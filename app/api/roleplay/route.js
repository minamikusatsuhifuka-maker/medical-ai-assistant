import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { situation } = await request.json();
    if (!situation || situation.trim() === "") {
      return NextResponse.json({ error: "疾患名または状況の入力が必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "あなたは皮膚科・美容皮膚科クリニックの接遇教育担当のベテランスタッフです。新人スタッフが実際の現場で自信を持って対応できるよう、以下の形式で詳しく回答してください。\n\n【必須出力形式】\n\n## 🎭 ロールプレイシナリオ\n（患者とスタッフの具体的な会話例を5〜8往復で記載。患者の感情や状況も含める）\n\n## ✅ 対応のポイント（3〜5項目）\n（このシナリオで特に重要な対応の核心をわかりやすく箇条書き）\n\n## 💬 対応の見本フレーズ\n（実際に使える具体的な言葉・フレーズを3〜5つ）\n\n## ⚠️ 注意すべき点\n（やってはいけないこと、避けるべき言葉や態度）\n\n## 📚 覚えておくべき知識・スキル\n（この状況で必要な医療知識、制度、クリニックのルールなど）\n\n## 🌟 プロとしてのあり方\n（患者さんへの思いやり、チームワーク、プロ意識について一言）\n\n必ず上記の全セクションを記載してください。新人スタッフが読んで即実践できる内容にしてください。" }] },
        contents: [{ parts: [{ text: `【シナリオ】${situation}\n\n上記の状況について、新人スタッフ向けのロールプレイ練習教材を生成してください。` }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "ロールプレイAPIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Roleplay error:", e);
    return NextResponse.json({ error: "ロールプレイ生成エラー: " + e.message }, { status: 500 });
  }
}
