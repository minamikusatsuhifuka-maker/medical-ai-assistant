import { NextResponse } from "next/server";
const DEFAULT_PROMPT = `あなたは皮膚科専門の優秀な医療秘書です。以下の音声書き起こしテキストを簡潔に要約してください。`;
async function callGemini(text, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  const models = [
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
  ];
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
      if (data.candidates?.[0]?.content?.parts) {
        const candidate = data.candidates[0];
        const finishReason = candidate.finishReason;
        let summary = candidate.content.parts.map(p => p.text || "").join("");

        // MAX_TOKENSで切れた場合、続きを取得
        if(finishReason === "MAX_TOKENS") {
          try {
            const contRes = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: prompt }] },
                contents: [
                  { role: "user", parts: [{ text }] },
                  { role: "model", parts: [{ text: summary }] },
                  { role: "user", parts: [{ text: "続きを出力してください。途中で切らずに最後まで完成させてください。" }] }
                ],
                generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
              }),
            });
            if(contRes.ok) {
              const contData = await contRes.json();
              if(contData.candidates?.[0]?.content?.parts) {
                summary += contData.candidates[0].content.parts.map(p => p.text || "").join("");
              }
            }
          } catch(e) {
            console.error("Continue fetch error:", e);
          }
        }
        return { summary, model };
      }
      lastError = `${model}: ${JSON.stringify(data?.error || data)}`;
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
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: prompt,
      messages: [{ role: "user", content: text }],
    }),
  });
  const data = await res.json();
  if (data.content?.[0]?.text) return data.content[0].text;
  throw new Error("Claude応答エラー: " + JSON.stringify(data));
}
export const maxDuration = 30;
export async function POST(request) {
  try {
    const { text, mode, prompt } = await request.json();
    if (!text || text.trim() === "") {
      return NextResponse.json({ error: "テキストが必要です" }, { status: 400 });
    }
    const systemPrompt = prompt || DEFAULT_PROMPT;
    let summary;
    let model = null;
    if (mode === "claude") {
      summary = await callClaude(text, systemPrompt);
      model = "claude-sonnet";
    } else {
      const result = await callGemini(text, systemPrompt);
      summary = result.summary;
      model = result.model;
    }
    return NextResponse.json({ summary, model });
  } catch (e) {
    console.error("Summarize error:", e);
    return NextResponse.json({ error: "要約エラー: " + e.message }, { status: 500 });
  }
}
