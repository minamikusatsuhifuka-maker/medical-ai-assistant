import { NextResponse } from "next/server";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { content } = await request.json();
    if (!content || content.trim() === "") {
      return NextResponse.json({ error: "分析データが必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで500）
    const { data } = await callGeminiWithFallback(apiKey, JSON.stringify({
      system_instruction: { parts: [{ text: "あなたはクリニック経営コンサルタントです。診療・カウンセリング記録から患者の関心・不安・満足度のポイントを分析してください。改善提案も含めてください。必ず以下の3セクションに分けて回答してください：\n\n## 患者の関心TOP5\n## 不安・懸念TOP5\n## 改善提案" }] },
      contents: [{ parts: [{ text: content }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }), "satisfaction-analysis");

    const result = extractGeminiText(data) || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Satisfaction analysis error:", e);
    return NextResponse.json({ error: "満足度分析エラー: " + e.message }, { status: 500 });
  }
}
