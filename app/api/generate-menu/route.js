import { NextResponse } from "next/server";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { content } = await request.json();
    if (!content || content.trim() === "") {
      return NextResponse.json({ error: "施術データが必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで500）
    const { data } = await callGeminiWithFallback(apiKey, JSON.stringify({
      system_instruction: { parts: [{ text: "あなたは美容皮膚科クリニックのマーケティング担当者です。施術記録をもとにホームページ・院内POP用の施術メニュー説明文を作成してください。患者が安心・魅力を感じる表現にしてください。" }] },
      contents: [{ parts: [{ text: content }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }), "generate-menu");

    const result = extractGeminiText(data) || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Generate menu error:", e);
    return NextResponse.json({ error: "メニュー説明文生成エラー: " + e.message }, { status: 500 });
  }
}
