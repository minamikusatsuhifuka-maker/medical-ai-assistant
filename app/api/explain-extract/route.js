import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";
import { GEMINI_MODELS, extractGeminiText } from "../../lib/gemini-models";
import { scrubPII } from "../../lib/explain-knowledge";

export const maxDuration = 120;

const MAX_INPUT_CHARS = 30000;

const SYSTEM_PROMPT = `あなたは皮膚科クリニックの教育担当です。1日分の診察記録（書き起こしとSOAP要約）から、疾患ごとに「院長の説明の型」を抽出し、スタッフが院長の代わりに患者へ説明できる教材ナレッジとして構造化します。

各診察から以下を抽出し、疾患ごとにグループ化してください:
- 疾患名（正規化した一般的名称。例「ニキビ（尋常性ざ瘡）」。表記ゆれは aliases に列挙）
- treatment: 治療内容（処方・処置・回数/期間）
- explanation: 医師の説明の仕方（病態・治療の説明の言い回し・説明の順序）
- skincare: スキンケア/生活指導の内容
- qa: 患者からの質問とそれへの回答（「Q: 〜？ A: 〜」の形式）
- caution: 注意点（副作用説明・禁忌・採血等のフォロー）

【厳守】
- 患者の氏名・ID・年齢・職業・家族構成など個人を特定しうる情報は一切含めない。
- 説明の「型」だけを一般化して抽出する。雑談・無関係文は無視。
- 記録に根拠のない内容を創作しない。該当が無いカテゴリは省く。
- 1項目=1ナレッジ（短い自己完結の文）。同じ内容を複数カテゴリに重複させない。

JSON形式のみで返す:
{"topics":[{"name":"疾患名","aliases":["表記ゆれ"],"items":[{"category":"treatment","content":"..."}]}]}`;

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
        console.error("[explain-extract] Gemini error:", lastErr);
        continue;
      }
      const data = await res.json();
      return { data, model };
    } catch (e) {
      lastErr = `${model}: ${e.message}`;
      console.error("[explain-extract] fetch error:", lastErr);
    }
  }
  throw new Error(lastErr || "全モデルでGemini呼び出しに失敗");
}

export async function POST(request) {
  try {
    const { records, date } = await request.json();
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "対象の診察記録がありません" }, { status: 400 });
    }

    const blocks = records
      .map((r, i) => {
        const inp = String(r?.input_text ?? "").trim();
        const out = String(r?.output_text ?? "").trim();
        if (!inp && !out) return "";
        return `【診察${i + 1}】\n${inp ? `▼書き起こし\n${inp}\n` : ""}${out ? `▼SOAP要約\n${out}\n` : ""}`;
      })
      .filter(Boolean);
    if (blocks.length === 0) {
      return NextResponse.json({ error: "書き起こし・要約が空です" }, { status: 400 });
    }
    const userText = `以下は ${date || "ある日"} の診察記録です。疾患ごとに説明ナレッジを抽出してください:\n\n${blocks.join("\n").slice(0, MAX_INPUT_CHARS)}`;

    let data, usedModel;
    try {
      ({ data, model: usedModel } = await callGemini(userText));
    } catch (apiErr) {
      // 成功に偽装せず500で返す（実ステータスはconsole.errorに残す）
      console.error("[explain-extract] all-models failed:", apiErr.message);
      return NextResponse.json({ error: "AI抽出APIエラー" }, { status: 500 });
    }

    try { await logUsage({ route: "/api/explain-extract", model: usedModel, context: "explain-extract", input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0, request_meta: { records: records.length, date: date || null } }); } catch (e) { console.error("[logUsage] explain-extract:", e); }

    const content = extractGeminiText(data) || "";
    if (!content.trim()) {
      return NextResponse.json({ error: "AIの応答が空でした" }, { status: 500 });
    }

    let parsed = { topics: [] };
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      const m1 = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m1) { try { parsed = JSON.parse(m1[1].trim()); } catch {} }
      else {
        const m2 = content.match(/\{[\s\S]*"topics"[\s\S]*\}/);
        if (m2) { try { parsed = JSON.parse(m2[0]); } catch {} }
      }
    }
    if (!Array.isArray(parsed.topics)) {
      console.error("explain-extract: no topics JSON in:", content.slice(0, 300));
      return NextResponse.json({ error: "AI応答の解析に失敗しました" }, { status: 500 });
    }

    // 個人情報の機械チェック（プロンプト厳守の後段ガード）: 疾患名・aliases・content 全てをスクラブ
    const topics = parsed.topics
      .map((t) => ({
        name: scrubPII(String(t?.name ?? "").trim()),
        aliases: (Array.isArray(t?.aliases) ? t.aliases : []).map((a) => scrubPII(String(a ?? "").trim())).filter(Boolean),
        items: (Array.isArray(t?.items) ? t.items : [])
          .map((it) => ({ category: it?.category, content: scrubPII(String(it?.content ?? "").trim()) }))
          .filter((it) => it.content),
      }))
      .filter((t) => t.name && t.items.length > 0);

    return NextResponse.json({ topics, model: usedModel });
  } catch (e) {
    console.error("explain-extract error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
