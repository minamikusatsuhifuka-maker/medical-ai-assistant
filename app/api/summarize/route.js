import { NextResponse } from "next/server";

export const maxDuration = 30;

const DEFAULT_PROMPT = `あなたは皮膚科専門の優秀な医療秘書です。以下の音声書き起こしテキストを簡潔に要約してください。

【重要ルール】
- 「提供された会話は〜」「音声認識の精度が〜」「判別困難な箇所が〜」などの前置き・注釈・免責文は一切書かない
- 要約内容のみを出力する
- 書き起こしが不明瞭・短い場合でも、わかる範囲で要約を出力する
- 要約できない場合は空白のまま返す（説明文は不要）`;

async function callGemini(text, prompt, model_preference) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  // model_preferenceに応じてモデル順序を変える
  const isFlashPreferred = model_preference === "gemini";
  const models = isFlashPreferred
    ? ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"]
    : ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"];
  let lastError = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt }] },
          contents: [{ parts: [{ text }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
        }),
      });
      if (!res.ok) {
        lastError = `${model}: HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      console.log("Gemini response:", model, "status:", res.status, "finishReason:", data.candidates?.[0]?.finishReason, "textLen:", data.candidates?.[0]?.content?.parts?.map(p => (p.text || "").length));
      if (data.candidates?.[0]?.content?.parts) {
        const summary = data.candidates[0].content.parts.map(p => p.text || "").join("");
        if (summary.trim()) {
          // 入力の10%未満の長さなら不完全と判断して次のモデルへ
          if (summary.trim().length < Math.min(text.length * 0.1, 30)) {
            console.log("Response too short, trying next model:", model, "len:", summary.length);
            lastError = `${model}: response too short (${summary.length} chars)`;
            continue;
          }
          return { summary, model };
        }
        lastError = `${model}: empty response`;
      } else {
        lastError = `${model}: ${JSON.stringify(data?.error || data)}`;
      }
    } catch (e) {
      lastError = `${model}: ${e.message}`;
    }
  }
  throw new Error("Gemini全モデル失敗: " + lastError);
}

async function callClaude(text, prompt) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("CLAUDE_API_KEY が設定されていません");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      temperature: 0.3,
      system: prompt,
      messages: [{ role: "user", content: text }],
    }),
  });
  const data = await res.json();
  if (data.content?.[0]?.text) return data.content[0].text;
  throw new Error("Claude応答エラー: " + JSON.stringify(data));
}

export async function POST(request) {
  try {
    const { text, mode, prompt, model_preference } = await request.json();
    if (!text || text.trim() === "") {
      return NextResponse.json({ error: "テキストが必要です" }, { status: 400 });
    }
    const systemPrompt = prompt || DEFAULT_PROMPT;
    let summary;
    let model = null;
    const useClaude = model_preference === "claude" || mode === "claude";
    if (useClaude) {
      summary = await callClaude(text, systemPrompt);
      model = "Claude Sonnet 4.6";
    } else {
      const result = await callGemini(text, systemPrompt, model_preference);
      summary = result.summary;
      model = result.model;
    }
    return NextResponse.json({ summary, model });
  } catch (e) {
    console.error("Summarize error:", e);
    return NextResponse.json({ error: "要約エラー: " + e.message }, { status: 500 });
  }
}
