import { NextResponse } from "next/server";

export const maxDuration = 60;

const DEFAULT_PROMPT = `あなたは皮膚科専門の優秀な医療秘書です。以下の音声書き起こしテキストを簡潔に要約してください。

【重要ルール】
- 「提供された会話は〜」「音声認識の精度が〜」「判別困難な箇所が〜」などの前置き・注釈・免責文は一切書かない
- 要約内容のみを出力する
- 診察内容が含まれない場合は「診察内容なし」とだけ出力する`;

// Gemini ストリーミング（SSE）
async function tryGeminiStream(apiKey, text, prompt, modelList, encoder, controller) {
  for (const model of modelList) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${prompt}\n\n${text}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
        }),
      });
      if (!res.ok) continue;

      const reader = res.body.getReader();
      let buffer = "";
      let totalText = "";
      let used = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += new TextDecoder().decode(value);
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const parts = json.candidates?.[0]?.content?.parts || [];
            const chunk = parts.filter(p => !p.thought).map(p => p.text || "").join("");
            if (chunk) {
              totalText += chunk;
              used = true;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk, model })}\n\n`));
            }
          } catch {}
        }
      }

      if (used && totalText.trim().length > 10) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, model, total: totalText })}\n\n`));
        return true;
      }
    } catch {}
  }
  return false;
}

// Gemini 非ストリーミング（従来のJSON応答）
async function callGemini(text, prompt, model_preference) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
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
      console.log("Gemini response:", model, "status:", res.status, "finishReason:", data.candidates?.[0]?.finishReason);
      if (data.candidates?.[0]?.content?.parts) {
        const summary = data.candidates[0].content.parts.map(p => p.text || "").join("");
        if (summary.trim()) {
          if (summary.trim().length < Math.min(text.length * 0.1, 30)) {
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
    const { text, mode, prompt, model_preference, stream: useStream } = await request.json();
    if (!text || !text.trim()) {
      return NextResponse.json({ error: "テキストが必要です" }, { status: 400 });
    }
    const finalPrompt = prompt || DEFAULT_PROMPT;
    const useClaude = model_preference === "claude" || mode === "claude";

    // Claude は常に非ストリーミング
    if (useClaude) {
      const summary = await callClaude(text, finalPrompt);
      return NextResponse.json({ summary, model: "Claude Sonnet 4.6" });
    }

    // Gemini ストリーミング（stream:true の場合のみ）
    if (useStream) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY未設定" }, { status: 500 });

      const isFlashPreferred = model_preference === "gemini";
      const modelList = isFlashPreferred
        ? ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"]
        : ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const ok = await tryGeminiStream(apiKey, text, finalPrompt, modelList, encoder, controller);
          if (!ok) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "要約に失敗しました" })}\n\n`));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Gemini 非ストリーミング（従来の動作）
    const result = await callGemini(text, finalPrompt, model_preference);
    return NextResponse.json({ summary: result.summary, model: result.model });
  } catch (e) {
    console.error("Summarize error:", e);
    return NextResponse.json({ error: "要約エラー: " + e.message }, { status: 500 });
  }
}
