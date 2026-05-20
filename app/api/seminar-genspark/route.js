import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const GENSPARK_PROMPT = `あなたはプレゼン資料作成の専門家です。
以下のセミナー要約を、Genspark（AIスライド作成ツール）に渡してスライド資料を生成するための「指示テキスト」に変換してください。

【出力構成】
# Genspark向けプロンプト

セミナータイトル: ○○
ターゲット: クリニックスタッフ（医療事務・看護師等）
スライド枚数の目安: 15-20枚
デザインテーマ: 清潔感のある医療系、見出しは大きく、図解を多用

## スライド構成案
1. タイトルスライド: ○○
2. 概要スライド: ...
3. ○○について（3枚）: ...
...

## 各スライドのトークスクリプト案
（スライド1）...
（スライド2）...
...

【ルール】
- スライド化しやすいよう、各スライド1メッセージに整理
- 図解できる箇所には【図解推奨】と注記
- スタッフ向けに専門用語は噛み砕く
- そのままGensparkにコピペ可能なテキストとして出力
- 前置きや注釈は書かない`;

function buildGeminiModelList(model_preference) {
  if (model_preference === "gemini-3-pro") return ["gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash"];
  if (model_preference === "gemini-pro") return ["gemini-2.5-pro", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
  return ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"];
}

async function callGemini(summary, model_preference) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  const models = buildGeminiModelList(model_preference);
  let lastError = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: GENSPARK_PROMPT }] },
          contents: [{ parts: [{ text: summary }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
      });
      if (!res.ok) { lastError = `${model}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const result = parts.filter(p => !p.thought).map(p => p.text || "").join("");
      if (result.trim()) {
        return {
          result, model,
          input_tokens: data.usageMetadata?.promptTokenCount || 0,
          output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
        };
      }
      lastError = `${model}: empty response`;
    } catch (e) { lastError = `${model}: ${e.message}`; }
  }
  throw new Error("Gemini全モデル失敗: " + lastError);
}

async function callClaude(summary) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("CLAUDE_API_KEY が設定されていません");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      temperature: 0.7,
      system: GENSPARK_PROMPT,
      messages: [{ role: "user", content: summary }],
    }),
  });
  const data = await res.json();
  if (data.content?.[0]?.text) return {
    result: data.content[0].text,
    model: data.model || "claude-sonnet-4-6",
    input_tokens: data.usage?.input_tokens || 0,
    output_tokens: data.usage?.output_tokens || 0,
  };
  throw new Error("Claude応答エラー: " + JSON.stringify(data));
}

export async function POST(req) {
  let mp = null;
  try {
    const { summary, model_preference = "gemini-pro" } = await req.json();
    mp = model_preference;
    if (!summary || summary.trim().length < 50) {
      return NextResponse.json({ error: "要約テキストが不足しています" }, { status: 400 });
    }
    const useClaude = model_preference === "claude";
    const r = useClaude ? await callClaude(summary) : await callGemini(summary, model_preference);
    const usage = await logUsage({
      route: "/api/seminar-genspark",
      model: r.model,
      context: "seminar-genspark",
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      request_meta: { char_length: summary.length, model_preference },
    });
    return NextResponse.json({ result: r.result, model: r.model, usage });
  } catch (e) {
    console.error("[seminar-genspark] error:", e);
    try { await logUsage({ route: "/api/seminar-genspark", model: mp || "unknown", success: false, error_message: e.message }); } catch {}
    return NextResponse.json({ error: "Genspark用テキスト生成エラー: " + e.message }, { status: 500 });
  }
}
