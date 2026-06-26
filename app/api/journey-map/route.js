import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `あなたは医療マーケティング・患者体験設計の専門家です。
以下の皮膚科・美容皮膚科クリニックのカウンセリング記録・診療記録を分析し、
患者ジャーニーマップを作成してください。

【患者ジャーニーマップの構成】

■ フェーズ1: 認知・来院前
- 患者が抱えている悩み・症状（データから読み取れる主訴TOP5）
- 来院を決断する前の不安・躊躇（「本当に行くべきか」「費用は？」など）
- 情報収集行動の推測（何で調べているか・何を気にしているか）
- 💡 改善アクション: ホームページ・SNSで発信すべきコンテンツ

■ フェーズ2: 初回来院・受付
- 患者が最初に感じる不安・期待
- 受付・待合での患者心理（データから読み取れる傾向）
- よくある最初の質問パターン
- 💡 改善アクション: 問診票・受付トークの改善ポイント

■ フェーズ3: 診察・カウンセリング
- 患者が「よかった」と感じる瞬間（データから読み取れる肯定的サイン）
- 患者が「不安」を感じる瞬間（データから読み取れる懸念ポイント）
- 説明で特に重要なポイント（患者がよく確認すること）
- 💡 改善アクション: 説明トーク・カウンセリングの改善ポイント

■ フェーズ4: 治療中・経過観察
- 継続率に影響する要因（データから見えること）
- 患者が途中でやめたくなる理由の推測
- リピートにつながるポジティブな体験
- 💡 改善アクション: フォローアップ・リマインド施策の提案

■ フェーズ5: 終診・リピート・紹介
- リピート患者の特徴（データから読み取れるパターン）
- 口コミ・紹介につながる体験の特徴
- 長期関係構築のための提案
- 💡 改善アクション: ロイヤル患者育成・紹介促進施策

■ 総合評価と優先改善ポイント
- データから見える当院の患者体験の強み（3点）
- 最優先で改善すべきポイント（3点）
- 短期（1ヶ月以内）・中期（3ヶ月以内）のアクションプラン

実際のデータに基づき、具体的で実践的なジャーニーマップを作成してください。
推測の場合は「推測:」と明記してください。`;

function buildGeminiModelList(model_preference) {
  if (model_preference === "gemini-3-pro") return ["gemini-3.1-pro-preview","gemini-3-pro-preview","gemini-3.5-flash","gemini-2.5-pro","gemini-2.5-flash"];
  if (model_preference === "gemini-pro") return ["gemini-2.5-pro","gemini-3.5-flash","gemini-2.5-flash"];
  return ["gemini-3.5-flash","gemini-2.5-flash","gemini-2.5-pro"];
}

async function callGemini(content, model_preference) {
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
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: content.substring(0, 10000) }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
      });
      if (!res.ok) { lastError = `${model}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
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

async function callClaude(content) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("CLAUDE_API_KEY が設定されていません");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16384,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: content.substring(0, 10000) }],
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

export async function POST(request) {
  let mp = null;
  try {
    const { content, model_preference, context } = await request.json();
    mp = model_preference;
    if (!content || content.trim().length < 10) {
      return NextResponse.json({ error: "コンテンツが不足しています" }, { status: 400 });
    }
    const useClaude = model_preference === "claude";
    const r = useClaude ? await callClaude(content) : await callGemini(content, model_preference);
    const usage = await logUsage({
      route: "/api/journey-map",
      model: r.model,
      context: context || "journey-map",
      input_tokens: r.input_tokens, output_tokens: r.output_tokens,
      request_meta: { char_length: content.length, model_preference },
    });
    return NextResponse.json({ result: r.result, model: r.model, usage });
  } catch (e) {
    console.error("journey-map error:", e);
    try { await logUsage({ route: "/api/journey-map", model: mp || "unknown", success: false, error_message: e.message }); } catch {}
    return NextResponse.json({ error: "患者ジャーニーマップエラー: " + e.message }, { status: 500 });
  }
}
