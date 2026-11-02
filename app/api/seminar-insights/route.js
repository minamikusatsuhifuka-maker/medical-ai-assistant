import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";
import { GEMINI_MODELS, geminiTestFail } from "../../lib/gemini-models";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const INSIGHTS_PROMPT = `あなたは医療クリニックの経営コンサルタントです。
以下のセミナー要約から、当院（南草津皮フ科・皮膚科+美容皮膚科クリニック・滋賀県）に活かせる「気づき」と「提案」を4つの観点で抽出してください。

【出力構成】

## 🏥 クリニック作り（経営助言）
セミナーの内容を、クリニック経営・運営・ブランディングにどう活かせるかの提案。
3-5個の具体的な提案を、根拠（セミナー内容の引用）とセットで。

### 提案1: [タイトル]
**根拠（セミナーより）**: ...
**当院での実行案**: ...

### 提案2: ...

## 👥 スタッフ育成アドバイス
セミナーの学びを、スタッフ教育・人材育成・組織文化作りにどう活かせるかの提案。
3-5個の具体的な提案。

### 提案1: [タイトル]
**根拠**: ...
**実行案**: ...

## ⚠️ 見逃しポイント
セミナーで触れていたが、聞き手が見落としがちなポイント・実践時の落とし穴。
3-5個。

### ポイント1: ...
**なぜ見逃しやすいか**: ...
**当院での対策**: ...

## 💡 セクション別の応用提案
セミナー内容を以下の業務シーンで具体的にどう使えるかの応用提案:

### 接遇・カウンセリング
- ...

### 院内オペレーション
- ...

### 採用・教育
- ...

### マーケティング
- ...

### スタッフのモチベーション
- ...

【ルール】
- 抽象論ではなく、具体的かつ実行可能な提案
- セミナーの中で出てきた具体的な事例・キーワードを引用
- 当院（皮膚科・美容皮膚科の医療機関・スタッフ約20名規模）の文脈に合わせる
- マークダウンで構造化、前置きや注釈は書かない`;

// 2026-11-02 指示書 model-display-unify §3: この画面は選択肢をなくし、共通の順番（GEMINI_MODELS＝3.8 先頭）だけを使う。
// 古い端末が送る model_preference（gemini-3-pro・gemini-3-5-flash・claude 等）はすべてこれに読み替える。
function buildGeminiModelList(model_preference) {
  return GEMINI_MODELS;
}

async function callGemini(summary, model_preference) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  const models = buildGeminiModelList(model_preference);
  let lastError = null;
  for (const model of models) {
    try {
      if (geminiTestFail(model)) throw new Error(`${model}: 検証のため失敗させた`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: INSIGHTS_PROMPT }] },
          contents: [{ parts: [{ text: summary }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 16384 },
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

export async function POST(req) {
  let mp = null;
  try {
    const { summary, model_preference = "gemini-pro" } = await req.json();
    mp = model_preference;
    if (!summary || summary.trim().length < 50) {
      return NextResponse.json({ error: "要約テキストが不足しています" }, { status: 400 });
    }
    // Claude の選択肢はなくした（§3）。古い端末が claude を送っても共通の順番（GEMINI_MODELS）で生成する
    const r = await callGemini(summary, model_preference);
    const usage = await logUsage({
      route: "/api/seminar-insights",
      model: r.model,
      context: "seminar-insights",
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      request_meta: { char_length: summary.length, model_preference },
    });
    return NextResponse.json({ result: r.result, model: r.model, usage });
  } catch (e) {
    console.error("[seminar-insights] error:", e);
    try { await logUsage({ route: "/api/seminar-insights", model: mp || "unknown", success: false, error_message: e.message }); } catch {}
    return NextResponse.json({ error: "AI気づき・提案生成エラー: " + e.message }, { status: 500 });
  }
}
