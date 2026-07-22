import { NextResponse } from "next/server";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { content } = await request.json();
    if (!content || content.trim() === "") {
      return NextResponse.json({ error: "症例データが必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで500）
    const { data } = await callGeminiWithFallback(apiKey, JSON.stringify({
      system_instruction: { parts: [{ text: "あなたは皮膚科の指導医です。診療記録をもとに研修スタッフ向けの症例解説を作成してください。疾患の特徴・診察のポイント・患者への説明方法・注意点を含めてください。" }] },
      contents: [{ parts: [{ text: content }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
    }), "case-study");

    const result = extractGeminiText(data) || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Case study error:", e);
    return NextResponse.json({ error: "症例解説エラー: " + e.message }, { status: 500 });
  }
}
