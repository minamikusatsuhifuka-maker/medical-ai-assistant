import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { content } = await request.json();
    if (!content || content.trim() === "") {
      return NextResponse.json({ error: "データが必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで500）
    const { data, model: usedModel } = await callGeminiWithFallback(apiKey, JSON.stringify({
      system_instruction: { parts: [{ text: "あなたは皮膚科クリニックのウェブ担当者です。診療記録をもとにホームページ掲載用のFAQを作成してください。患者目線のQ&A形式で5〜10問作成してください。" }] },
      contents: [{ parts: [{ text: content }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
    }), "generate-faq");

    try { await logUsage({ route: "/api/generate-faq", model: usedModel, context: "faq", input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0 }); } catch(e) { console.error("[logUsage] generate-faq:", e); }
    const result = extractGeminiText(data) || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Generate FAQ error:", e);
    return NextResponse.json({ error: "FAQ生成エラー: " + e.message }, { status: 500 });
  }
}
