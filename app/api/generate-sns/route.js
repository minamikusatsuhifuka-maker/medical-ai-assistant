import { NextResponse } from "next/server";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { platform, theme } = await request.json();
    if (!theme || theme.trim() === "") {
      return NextResponse.json({ error: "テーマの入力が必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで500）
    const { data } = await callGeminiWithFallback(apiKey, JSON.stringify({
      system_instruction: { parts: [{ text: "あなたは皮膚科クリニックのSNS担当者です。患者向けの親しみやすい投稿文を作成してください。専門用語は避け、絵文字を適度に使用してください。" }] },
      contents: [{ parts: [{ text: `【投稿先】${platform}\n【テーマ】${theme}\n\n上記に合わせた投稿文を作成してください。投稿先の文字数制限・特性に合わせてください。` }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
    }), "generate-sns");

    const result = extractGeminiText(data) || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Generate SNS error:", e);
    return NextResponse.json({ error: "SNS投稿文生成エラー: " + e.message }, { status: 500 });
  }
}
