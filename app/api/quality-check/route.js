import { NextResponse } from "next/server";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { content } = await request.json();
    if (!content || content.trim() === "") {
      return NextResponse.json({ error: "書き起こしテキストが必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで500）
    const { data } = await callGeminiWithFallback(apiKey, JSON.stringify({
      system_instruction: { parts: [{ text: "あなたはクリニックの接遇コンサルタントです。診察の書き起こしをもとに、スタッフの対応品質を評価してください。良かった点・改善点・具体的なアドバイスを含めてください。" }] },
      contents: [{ parts: [{ text: content }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
    }), "quality-check");

    const result = extractGeminiText(data) || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Quality check error:", e);
    return NextResponse.json({ error: "品質チェックエラー: " + e.message }, { status: 500 });
  }
}
