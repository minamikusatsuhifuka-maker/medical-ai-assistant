import { logUsage } from "../../lib/log-usage";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { disease, isFirstVisit } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;

    const prompt = `皮膚科クリニックの${isFirstVisit?"初診":"再診"}患者向けの「${disease}」に特化した問診票を作成してください。

【出力形式】患者が読みやすい日本語で、スマホで回答しやすい形式

# ${disease} 問診票（${isFirstVisit?"初診":"再診"}）

## 基本情報
- お名前：
- 生年月日：
- 性別：

## 症状について
（${disease}に特有の質問を5〜8項目、選択肢付きで）

## 現在の治療・薬
（現在使用中の薬・他院での治療歴）

## 生活背景
（症状に関連する生活習慣・環境）

## その他
（ご要望・気になること）

問診票は患者が自分で記入できる平易な言葉で作成。専門用語は使わない。`;

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで500）
    const { data, model: usedModel } = await callGeminiWithFallback(apiKey, JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
    }), "generate-questionnaire");
    try { await logUsage({ route: "/api/generate-questionnaire", model: usedModel, context: "questionnaire", input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0, request_meta: { disease: disease || null, isFirstVisit } }); } catch(e) { console.error("[logUsage] questionnaire:", e); }
    const questionnaire = extractGeminiText(data).trim();
    return Response.json({ questionnaire });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
