import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";
import { GEMINI_MODELS, extractGeminiText } from "../../lib/gemini-models";
import { INTAKE_CATEGORY_IDS, scrubPII } from "../../lib/intake-knowledge";

export const maxDuration = 120;

const MAX_INPUT_CHARS = 30000;

const SYSTEM_PROMPT = `以下は同一疾患の診察の書き起こしである。医師が患者に投げた質問を抽出し、
スタッフが診察前に行う事前問診の項目に書き直せ。

【抽出しないもの】
- 診断や治療方針の判断を要する質問
- 視診・触診・検査所見を前提とする質問
- 医師の説明・指導(質問ではないもの)
- 患者から医師への質問

【書き方】
- 書き起こしは音声認識のため崩れている。逐語ではなく、
  スタッフがそのまま読み上げられる自然な問診文に正規化すること。
- 残すのは、患者が自分で答えられる事実確認の質問だけに限る。
- 各項目に、何を確認するための質問かを1行(intent)で添える。
- カテゴリを次から1つ選ぶ:
  発症・経過 / 症状の性状 / 悪化因子・生活環境 / 既往・治療歴 / 薬剤・アレルギー / その他
- 意味が重複する質問は1つにまとめる。記録に根拠のない質問を創作しない。
- 全て自然な日本語のみで書く。書き起こし由来の意味不明な英単語・記号・ノイズを問診文に混入させない。

【個人情報】
- 氏名、年齢、具体的な日付、勤務先、学校名、家族構成の固有情報、
  その他個人を特定しうる情報を一切含めてはならない。

JSON形式のみで返す:
{"items":[{"category":"発症・経過","question":"いつ頃から症状がありますか？","intent":"発症時期の確認"}]}`;

async function callGemini(userText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  let lastErr = "";
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      // 抽出・整形タスクのため思考は最小化（Gemini 3.x は思考既定ONで枠固定JSON抽出が切れる。2.5系は thinkingLevel 非対応のため付けない）
      const genConfig = { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: "application/json" };
      if (model.startsWith("gemini-3")) genConfig.thinkingConfig = { thinkingLevel: "minimal" };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userText }] }],
          generationConfig: genConfig,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastErr = `${model}: HTTP ${res.status} ${body.slice(0, 200)}`;
        console.error("[intake-extract] Gemini error:", lastErr);
        continue;
      }
      const data = await res.json();
      return { data, model };
    } catch (e) {
      lastErr = `${model}: ${e.message}`;
      console.error("[intake-extract] fetch error:", lastErr);
    }
  }
  throw new Error(lastErr || "全モデルでGemini呼び出しに失敗");
}

export async function POST(request) {
  try {
    const { disease, records } = await request.json();
    if (!disease || !String(disease).trim()) {
      return NextResponse.json({ error: "疾患名が必要です" }, { status: 400 });
    }
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "対象の診察記録がありません" }, { status: 400 });
    }

    const blocks = records
      .map((r, i) => {
        const inp = String(r?.input_text ?? "").trim();
        const out = String(r?.output_text ?? "").trim();
        if (!inp && !out) return "";
        return `【診察${i + 1}】\n${inp ? `▼書き起こし\n${inp}\n` : ""}${out ? `▼要約\n${out}\n` : ""}`;
      })
      .filter(Boolean);
    if (blocks.length === 0) {
      return NextResponse.json({ error: "書き起こし・要約が空です" }, { status: 400 });
    }
    const userText = `疾患: ${disease}\n以下は「${disease}」の診察記録である。事前問診項目を抽出せよ:\n\n${blocks.join("\n").slice(0, MAX_INPUT_CHARS)}`;

    let data, usedModel;
    try {
      ({ data, model: usedModel } = await callGemini(userText));
    } catch (apiErr) {
      // 成功に偽装せず500で返す（実ステータスはconsole.errorに残す）
      console.error("[intake-extract] all-models failed:", apiErr.message);
      return NextResponse.json({ error: "AI抽出APIエラー" }, { status: 500 });
    }

    try { await logUsage({ route: "/api/intake-extract", model: usedModel, context: "intake-extract", input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0, request_meta: { disease, records: records.length } }); } catch (e) { console.error("[logUsage] intake-extract:", e); }

    const content = extractGeminiText(data) || "";
    if (!content.trim()) {
      return NextResponse.json({ error: "AIの応答が空でした" }, { status: 500 });
    }

    let parsed = { items: [] };
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const m1 = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m1) { try { parsed = JSON.parse(m1[1].trim()); } catch {} }
      else {
        const m2 = content.match(/\{[\s\S]*"items"[\s\S]*\}/);
        if (m2) { try { parsed = JSON.parse(m2[0]); } catch {} }
      }
    }
    // Geminiは {"items":[...]} でなくトップレベル配列 [{...}] で返すことがある（responseMimeType:jsonの揺れ）
    if (Array.isArray(parsed)) parsed = { items: parsed };
    if (!Array.isArray(parsed.items)) {
      console.error("intake-extract: no items JSON in:", content.slice(0, 300));
      return NextResponse.json({ error: "AI応答の解析に失敗しました" }, { status: 500 });
    }

    // 個人情報の機械チェック（プロンプト厳守の後段ガード・説明ナレッジのscrubPIIを流用）: question/intent 双方をスクラブ
    const items = parsed.items
      .map((it) => ({
        category: INTAKE_CATEGORY_IDS.includes(it?.category) ? it.category : null,
        question: scrubPII(String(it?.question ?? "").trim()),
        intent: scrubPII(String(it?.intent ?? "").trim()),
      }))
      .filter((it) => it.category && it.question);

    return NextResponse.json({ items, model: usedModel });
  } catch (e) {
    console.error("intake-extract error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
