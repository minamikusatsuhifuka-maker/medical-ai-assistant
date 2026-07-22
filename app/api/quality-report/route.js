import { NextResponse } from "next/server";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const { records } = await request.json();
    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "診療記録が必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const content = records.map((r, i) => {
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString("ja-JP") : "";
      return `【記録${i + 1}】${date}\n${r.output_text || r.input_text || ""}`;
    }).join("\n---\n");

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで500）
    const { data } = await callGeminiWithFallback(apiKey, JSON.stringify({
      system_instruction: { parts: [{ text: "あなたは皮膚科クリニックの教育担当者です。診療記録を分析して月次スタッフ対応品質レポートを作成してください。以下を含めてください：①よくある疾患TOP5 ②対応の良かった点 ③改善が必要な点 ④来月の重点改善テーマ ⑤スタッフへの具体的アドバイス" }] },
      contents: [{ parts: [{ text: content }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }), "quality-report");

    const result = extractGeminiText(data) || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Quality report error:", e);
    return NextResponse.json({ error: "品質レポートエラー: " + e.message }, { status: 500 });
  }
}
