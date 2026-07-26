import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";
import { GEMINI_MODELS, extractGeminiText } from "../../lib/gemini-models";
import { INTAKE_CATEGORY_IDS, scrubPII, fixNonWords } from "../../lib/intake-knowledge";

export const maxDuration = 120;

const MAX_INPUT_CHARS = 30000;

const SYSTEM_PROMPT = `以下は同一疾患の診察の書き起こしである。医師が患者に投げた質問を抽出し、
スタッフが診察前に行う事前問診の項目に書き直せ。

【抽出しないもの】
- 診断や治療方針の判断を要する質問
- 視診・触診・検査所見を前提とする質問
- 医師の説明・指導(質問ではないもの)
- 患者から医師への質問
- 以下は全疾患共通の固定項目として別に用意されているため、抽出しないこと:
  妊娠・授乳の有無、薬や食べ物のアレルギー、他院での治療中の病気や内服薬、
  本日の相談内容・受診目的

【書き方】
- 書き起こしは音声認識のため崩れている。逐語ではなく、
  スタッフがそのまま読み上げられる自然な問診文に正規化すること。
- 残すのは、患者が自分で答えられる事実確認の質問だけに限る。
- 1つの項目には1つのことだけを尋ねる。複数の事柄を1文にまとめない。
  誤: ニキビのある場所や、痛み・痒みの有無を教えてください
  正: ニキビはどのあたりに出ていますか / 痛みやかゆみはありますか
- 選択肢を列挙する場合は3つまで。それ以上は項目を分ける。
- 特定の患者の会話に出た固有の事情(具体的な商品名、個別の生活状況、特定の地名など)を
  問診文に残さない。その疾患の患者に広く当てはまる一般的な表現に置き換える。
  誤: ビタミンC配合のものなどは含まれますか
  正: (スキンケアの質問に統合し、具体名は挙げない)
- 各項目に、何を確認するための質問かを1行(intent)で添える。
- カテゴリを次から1つ選ぶ:
  発症・経過 / 症状の性状 / 悪化因子・生活環境 / 既往・治療歴 / 薬剤・アレルギー / その他
- 各項目に、初診の患者に聞くべきか、再診の患者に聞くべきか、両方かを判定して visit_type を付ける。
  初診: 発症時期、これまでの経過、既往、家族歴など、初めて診るときに必要なもの
  再診: 前回処方の使用状況、残薬、副作用、前回からの変化など、継続診療で必要なもの
  共通: どちらでも聞くもの
- 意味が重複する質問は1つにまとめる。記録に根拠のない質問を創作しない。
- 全て自然な日本語のみで書く。書き起こし由来の意味不明な英単語・記号・ノイズを問診文に混入させない。
- 問診文は自然な日本語で書く。存在しない語や省略形を作らない。
  誤: 痛増 / 痒増 / 症状増
  正: 痛み / かゆみ / 症状の増加

【個人情報】
- 氏名、年齢、具体的な日付、勤務先、学校名、家族構成の固有情報、
  その他個人を特定しうる情報を一切含めてはならない。

JSON形式のみで返す:
{"items":[{"category":"発症・経過","question":"いつ頃から症状がありますか？","intent":"発症時期の確認","visit_type":"初診"}]}`;

// 2段階目: 同義判定専用プロンプト（抽出内の自己照合だけでは見逃しが出るため、新規候補を判定タスク単体で再照合する。
// 実測で「いつ頃から症状が出始めましたか」等の明確な同義が抽出時に素通りした対策）
const JUDGE_SYSTEM_PROMPT = `あなたは事前問診項目の同義判定器である。
「既存の問診項目」と「新規候補」を与える。各新規候補について、
表現が違っていても患者が同じ答えを返す既存項目があればその番号を、どれとも異なる場合のみ 0 を返す。
確認する内容が部分的にでも重なる場合は同義とみなし番号を返す。判断に迷う場合も番号を返す（同義側に倒す）。
JSON形式のみで返す: {"judgments":[数値,...]}（新規候補と同じ順・同じ個数）`;

// 既存項目が渡された場合にプロンプトへ足す同義判定ルール（intake-dedup-fix §A）
const buildExistingBlock = (existing) => `

【既存の問診項目】
${existing.map((e, i) => `${i + 1}. [${e.category}] ${e.question}`).join("\n")}

上記と同じことを尋ねている項目は、新規として出力してはならない。
その場合は既存の番号を返すこと。
表現が違っていても、患者が同じ答えを返す質問は「同じこと」とみなす。
例: 「現在使っている塗り薬はありますか」と「今お使いのニキビのお薬を教えてください」は同じ。
例: 「残薬はありますか」と「残っている量（残薬）を教えてください」は同じ。
例: 「脱毛施術を受けていますか」と「医療脱毛やサロン脱毛の施術を受けていますか」は同じ。
例: 「刺激症状はありますか」と「副作用と思われる症状はありますか」は同じ。
確認する内容が部分的にでも重なる場合は、新規にせず既存の番号を返す。
判断に迷う場合は必ず「既存と同義」に倒すこと。
新規と判定してよいのは、既存のどの項目でも確認できない事柄を尋ねる場合だけである。
出力する前に、新規項目の一つひとつについて既存一覧を先頭から順に見直し、
同じ答えが返る項目が1つでもあれば {"existing": 番号} に置き換えること。

出力形式:
- 新規項目: これまでどおり category / question / intent / visit_type を返す
- 既存と同義: { "existing": 番号 } を返す`;

async function callGemini(userText, systemPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  let lastErr = "";
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      // 抽出・整形タスクのため思考は最小化（Gemini 3.x は思考既定ONで枠固定JSON抽出が切れる。2.5系は thinkingLevel 非対応のため付けない）
      const genConfig = { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" };
      if (model.startsWith("gemini-3")) genConfig.thinkingConfig = { thinkingLevel: "minimal" };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
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
    const { disease, records, existing } = await request.json();
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
    // 既存項目（番号つき）を渡された場合はLLM側で同義判定させる（intake-dedup-fix §A・再抽出での増殖防止）
    const existingList = (Array.isArray(existing) ? existing : [])
      .map((e) => ({ category: String(e?.category ?? "").trim(), question: String(e?.question ?? "").trim() }))
      .filter((e) => e.question);
    const systemPrompt = SYSTEM_PROMPT + (existingList.length ? buildExistingBlock(existingList) : "");

    let data, usedModel;
    try {
      ({ data, model: usedModel } = await callGemini(userText, systemPrompt));
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
    // {"existing": n} 形式（既存項目と同義）はそのまま素通しする（新規登録せず seen_count 加算するのは呼び出し側）
    const items = parsed.items
      .map((it) => {
        if (it && it.existing !== undefined && it.existing !== null) {
          const n = Number(it.existing);
          return Number.isInteger(n) && n >= 1 && n <= existingList.length ? { existing: n } : null;
        }
        return {
          category: INTAKE_CATEGORY_IDS.includes(it?.category) ? it.category : null,
          question: fixNonWords(scrubPII(String(it?.question ?? "").trim())),
          intent: fixNonWords(scrubPII(String(it?.intent ?? "").trim())),
          visit_type: ["初診", "再診", "共通"].includes(it?.visit_type) ? it.visit_type : "共通",
        };
      })
      .filter((it) => it && (it.existing || (it.category && it.question)));

    // 2段階目: 新規判定された候補を、判定専用のLLM呼び出しで既存一覧と再照合する（fail-open: 失敗時は新規のまま）
    let items2 = items;
    const newOnes = items.filter((it) => !it.existing);
    if (existingList.length > 0 && newOnes.length > 0) {
      try {
        const judgeText = `【既存の問診項目】\n${existingList.map((e, i) => `${i + 1}. [${e.category}] ${e.question}`).join("\n")}\n\n【新規候補】\n${newOnes.map((it, i) => `${i + 1}. [${it.category}] ${it.question}`).join("\n")}`;
        const { data: jd } = await callGemini(judgeText, JUDGE_SYSTEM_PROMPT);
        const jContent = extractGeminiText(jd) || "";
        let judgments = [];
        try { const jp = JSON.parse(jContent.trim()); judgments = Array.isArray(jp) ? jp : jp.judgments || []; } catch {}
        if (Array.isArray(judgments) && judgments.length === newOnes.length) {
          let ni = 0;
          items2 = items.map((it) => {
            if (it.existing) return it;
            const n = Number(judgments[ni++]);
            return Number.isInteger(n) && n >= 1 && n <= existingList.length ? { existing: n } : it;
          });
        }
      } catch (e) {
        console.error("[intake-extract] judge pass failed (fail-open):", e.message);
      }
    }

    return NextResponse.json({ items: items2, model: usedModel });
  } catch (e) {
    console.error("intake-extract error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
