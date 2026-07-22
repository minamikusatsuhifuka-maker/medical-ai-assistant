import { NextResponse } from "next/server";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const { content } = await request.json();
    if (!content || content.trim().length < 10) {
      return NextResponse.json({ error: "コンテンツが不足しています" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const systemPrompt = `あなたはクリニックブランディングの専門家です。
以下の皮膚科・美容皮膚科クリニックの診療記録・カウンセリング記録を深く分析し、
このクリニック独自の「診療哲学・クリニックらしさ」を言語化してください。

【分析の観点】
1. 📋 診療スタイルの特徴
   - 医師がよく使う言葉・説明スタイル
   - 患者への向き合い方・コミュニケーションの特徴
   - 他院との違いが見えるポイント

2. 💎 当院の強み・価値観
   - 診療で大切にしていること
   - 患者に対して一貫して提供しているもの
   - スタッフ・チームの動き方の特徴

3. 🌟 ミッション・ビジョン案（3パターン）
   - シンプル版（20字以内）
   - 詳細版（50字以内）
   - ストーリー版（100字以内）

4. 🏷️ ブランドキーワード（10個）
   - このクリニックを象徴する言葉を厳選

5. 📣 ホームページTOPコピー案（3パターン）
   - キャッチコピー＋サブコピーの形式で

6. 🔍 他院との差別化ポイント
   - データから見える明確な違い

上記を丁寧に分析し、院長・スタッフが「確かにうちらしい」と感じられる言語化をしてください。`;

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで500）
    const { data } = await callGeminiWithFallback(apiKey, JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: content.substring(0, 8000) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }), "philosophy");

    const result = extractGeminiText(data) || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("philosophy error:", e);
    return NextResponse.json({ error: "診療哲学エラー: " + e.message }, { status: 500 });
  }
}
