import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";
import { GEMINI_MODELS, EXAM_SUMMARY_MODELS, applyThinking } from "../../lib/gemini-models";

// Vercel関数タイムアウト延長（並列分析の60s超応答に対応・504解消）
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DEFAULT_PROMPT = `あなたは皮膚科専門の優秀な医療秘書です。以下の音声書き起こしテキストをカルテ形式で要約してください。

【絶対禁止】以下の文言は一切出力してはならない：
- 「音声認識の精度が〜」
- 「断片的な情報から〜」
- 「再録音をお願いします」
- 「把握が困難」
- 「推定します」
- 「※」で始まる注釈
- 「**」で囲まれた注意書き
- カルテ要約以外の説明文・コメント・お願い文

【要約ルール】
- 聞き取れた内容のみでSOAP形式のカルテを作成する
- 不明な部分は省略し、わかる範囲で簡潔にまとめる
- 「変わらず」→症状変化なし、「光を当てる」→光線療法、「塗るやつ」→外用薬として補完
- 出力はカルテのみ。余計な言葉は一切不要`;

// Gemini ストリーミング（SSE）
async function tryGeminiStream(apiKey, text, prompt, modelList, encoder, controller) {
  for (const model of modelList) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
      // Gemini 3.x は思考が既定ONで、ストリーミングでは思考完了まで出力が始まらず要約が遅くなる。
      // 要約は抽出・整形タスクで深い推論は不要のため思考を最小化する。
      // 付与値のモデル別分岐（3.7以降は minimal が400・2.5系は非対応）は gemini-models.js に集約。
      const genConfig = applyThinking({ temperature: 0.3, maxOutputTokens: 8192 }, model);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt }] },
          contents: [{ parts: [{ text }] }],
          generationConfig: genConfig,
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
function buildGeminiModelList(model_preference) {
  // gemini-3-pro: 最新3.1 Pro優先（フォールバックとして3 Pro系→標準Flashリスト）
  if (model_preference === "gemini-3-pro") {
    return ["gemini-3.1-pro-preview", "gemini-3-pro-preview", ...GEMINI_MODELS];
  }
  // gemini-pro: 2.5 Pro優先。2026-08-25 に診察の「🤖 要約AIモデル」からは選べなくしたため、
  // 現在は「要約テストラボ」からのみ届く。将来戻す可能性があるため経路は残置。
  // ※ 2.5系はフォールバック鎖（GEMINI_MODELS / EXAM_SUMMARY_MODELS の末尾）には引き続き残す。
  if (model_preference === "gemini-pro") {
    return ["gemini-2.5-pro", ...GEMINI_MODELS];
  }
  // gemini-3-5-flash: 明示的に Gemini 3.5 Flash を指定（要約テストラボ用・明示指定は不変）
  if (model_preference === "gemini-3-5-flash") {
    return ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"];
  }
  // gemini-3-6-flash: 明示的に 3.6 を指定した場合は 3.7 に繰り上げない（明示指定は不変）
  if (model_preference === "gemini-3-6-flash") {
    return ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];
  }
  // gemini-3-7-flash: 3.7 を明示指定（診察の既定は下記のとおり 3.6 なので、試すときはこちらを選ぶ）
  if (model_preference === "gemini-3-7-flash") {
    return GEMINI_MODELS;
  }
  // gemini-3-5-flash-lite: Lite は複数疾患の分離に失敗するため撤去（2026-07-24 院長実ケースで確認）。
  // 旧クライアント（キャッシュ済みページ）から届いた場合も標準リストに丸める。
  // デフォルト（gemini）: EXAM_SUMMARY_MODELS。診察要約は診療の律速なので応答時間の安定を優先し、
  // 3.7 のTTFTスパイクが解消するまで 3.6 を先頭に置く（理由と実測値は gemini-models.js を参照）。
  return EXAM_SUMMARY_MODELS;
}

async function callGemini(text, prompt, model_preference) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  const models = buildGeminiModelList(model_preference);
  let lastError = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      // Gemini 3.x は思考が既定ONで要約が遅くなる。要約は抽出・整形タスクで深い推論は不要のため最小化。
      // 付与値のモデル別分岐は gemini-models.js に集約。
      const genConfig = applyThinking({ temperature: 0.3, maxOutputTokens: 8192 }, model);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt }] },
          contents: [{ parts: [{ text }] }],
          generationConfig: genConfig,
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
          const um = data.usageMetadata || {};
          return {
            summary, model,
            input_tokens: um.promptTokenCount || 0,
            output_tokens: um.candidatesTokenCount || 0,
          };
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
      max_tokens: 16384,
      temperature: 0.3,
      system: prompt,
      messages: [{ role: "user", content: text }],
    }),
  });
  const data = await res.json();
  if (data.content?.[0]?.text) return {
    summary: data.content[0].text,
    model: data.model || "claude-sonnet-4-6",
    input_tokens: data.usage?.input_tokens || 0,
    output_tokens: data.usage?.output_tokens || 0,
  };
  throw new Error("Claude応答エラー: " + JSON.stringify(data));
}

export async function POST(request) {
  let _model_preference_for_err = null;
  try {
    const { text, mode, prompt, model_preference, stream: useStream, context: ctx } = await request.json();
    _model_preference_for_err = model_preference;
    if (!text || !text.trim()) {
      return NextResponse.json({ error: "テキストが必要です" }, { status: 400 });
    }
    const finalPrompt = prompt || DEFAULT_PROMPT;
    const useClaude = model_preference === "claude" || mode === "claude";

    // Claude は常に非ストリーミング
    // 2026-08-25: 診察の「🤖 要約AIモデル」からは Claude を選べなくしたため、この経路は
    // 「要約テストラボ」(labModels に claude を含む)からのみ呼ばれる。診察要約からは到達しない。
    // 将来また選択肢に戻す可能性があるため経路は残置。
    if (useClaude) {
      const r = await callClaude(text, finalPrompt);
      const usage = await logUsage({
        route: "/api/summarize",
        model: r.model,
        context: ctx || (model_preference === "claude" ? "claude" : null),
        input_tokens: r.input_tokens, output_tokens: r.output_tokens,
        request_meta: { char_length: text.length, model_preference },
      });
      return NextResponse.json({ summary: r.summary, model: "Claude Sonnet 4.6", usage });
    }

    // Gemini ストリーミング（stream:true の場合のみ）
    if (useStream) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY未設定" }, { status: 500 });

      const modelList = buildGeminiModelList(model_preference);

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
    const usage = await logUsage({
      route: "/api/summarize",
      model: result.model,
      context: ctx || model_preference || null,
      input_tokens: result.input_tokens, output_tokens: result.output_tokens,
      request_meta: { char_length: text.length, model_preference },
    });
    return NextResponse.json({ summary: result.summary, model: result.model, usage });
  } catch (e) {
    console.error("Summarize error:", e);
    try { await logUsage({ route: "/api/summarize", model: _model_preference_for_err || "unknown", success: false, error_message: e.message }); } catch {}
    return NextResponse.json({ error: "要約エラー: " + e.message }, { status: 500 });
  }
}
