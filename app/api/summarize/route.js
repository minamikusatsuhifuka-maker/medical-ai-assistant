import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `あなたは皮膚科専門の優秀な医療秘書です。以下の音声書き起こしテキストを、ASOP形式で要約してください。

【最重要原則：正確性】
- 会話に含まれる情報のみを記載。推測で補完しない
- 数字・日付・固有名詞は正確に。曖昧なら「（要確認）」を付記

【出力フォーマット】
■ A（評価・診断名）
■ S（患者の主観的訴え）
■ O（医師の客観的所見）
■ P（治療計画・処方）
■ 患者情報（言及があれば）

【ルール】
- 各セクション内に不要な空行を入れない
- AIコメント・注釈は一切不要
- 言及のないセクションは「言及なし」と記載`;

async function callGemini(text, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = "gemini-2.5-flash-preview-05-20";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: prompt }] },
      contents: [{ parts: [{ text }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }),
  });

  const data = await res.json();
  if (data.candidates?.[0]?.content?.parts) {
    return data.candidates[0].content.parts.map(p => p.text || "").join("");
  }
  throw new Error("Gemini response error");
}

async function callClaude(text, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: prompt,
      messages: [{ role: "user", content: text }],
    }),
  });

  const data = await res.json();
  if (data.content?.[0]?.text) return data.content[0].text;
  throw new Error("Claude response error");
}

export async function POST(request) {
  try {
    const { text, mode } = await request.json();

    if (!text || text.trim() === "") {
      return NextResponse.json({ error: "テキストが必要です" }, { status: 400 });
    }

    let summary;
    if (mode === "claude") {
      summary = await callClaude(text, SYSTEM_PROMPT);
    } else {
      summary = await callGemini(text, SYSTEM_PROMPT);
    }

    return NextResponse.json({ summary });
  } catch (e) {
    console.error("Summarize error:", e);
    return NextResponse.json({ error: "要約エラー: " + e.message }, { status: 500 });
  }
}
