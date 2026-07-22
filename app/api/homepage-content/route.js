import { NextResponse } from "next/server";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 60;

const PROMPTS = {
  faq: "診療記録から患者がよく持つ疑問をQ&A形式で15問作成。ホームページ掲載用として患者目線で。",
  factsheet: "診療記録から疾患別ファクトシートを作成。各疾患について原因・症状・治療・予防を簡潔にまとめる。",
  seasonal: "診療記録から季節性疾患トレンドを分析し、来月の患者向け啓発コンテンツを作成。",
};

export async function POST(request) {
  try {
    const { records, type } = await request.json();
    if (!records || !records.length) {
      return NextResponse.json({ error: "診療記録データが必要です" }, { status: 400 });
    }

    const prompt = PROMPTS[type];
    if (!prompt) {
      return NextResponse.json({ error: "無効なタイプです: " + type }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const recordsText = records.map((r, i) => `【記録${i + 1}】\n${r.output_text || ""}`).join("\n---\n");

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで500）
    const { data } = await callGeminiWithFallback(apiKey, JSON.stringify({
      system_instruction: { parts: [{ text: "あなたは皮膚科クリニックのウェブ担当者です。" + prompt }] },
      contents: [{ parts: [{ text: `【診療記録データ】\n${recordsText}` }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    }), "homepage-content");

    const result = extractGeminiText(data) || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Homepage content error:", e);
    return NextResponse.json({ error: "ホームページコンテンツ生成エラー: " + e.message }, { status: 500 });
  }
}
