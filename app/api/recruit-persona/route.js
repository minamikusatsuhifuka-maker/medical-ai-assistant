import { NextResponse } from "next/server";

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

    const systemPrompt = `あなたは医療クリニックの採用・人事コンサルタントです。
以下の皮膚科・美容皮膚科クリニックの議事録・タスク実績データを分析し、
採用活動に使える資料を生成してください。

【生成する内容】

1. 👤 採用ペルソナ（理想の人材像）
   - このクリニックで活躍できる人物像を具体的に描写
   - スキル面・人柄面・価値観面それぞれの特徴
   - NG人材像（ミスマッチを防ぐために）

2. 📝 求人票コピー（3パターン）
   - 看護師・医療事務・美容カウンセラー向けにそれぞれ
   - 「仕事内容」「求める人材」「職場の特徴」の文章

3. 🎯 面接評価基準（5項目）
   - 面接で確認すべき具体的な質問と評価ポイント
   - データから見えるこのクリニック特有の重要評価軸

4. 🌱 入社後に活躍するために必要なこと
   - このクリニックで早期活躍するためのポイント
   - よくある躓きポイントと対策

5. 💬 採用広告・SNS投稿文（Wantedly・Instagram・求人サイト向け）

データから読み取れる職場の雰囲気・業務特性・求められるスキルを踏まえ、
実際に使えるリアルな採用資料を作成してください。`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: content.substring(0, 8000) }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "採用ペルソナAPIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("recruit-persona error:", e);
    return NextResponse.json({ error: "採用ペルソナエラー: " + e.message }, { status: 500 });
  }
}
