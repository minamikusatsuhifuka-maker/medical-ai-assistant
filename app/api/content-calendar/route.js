import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const { records, month } = await request.json();
    if (!records || !records.length) {
      return NextResponse.json({ error: "診療記録データが必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const recordsText = records.map((r, i) => {
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString("ja-JP") : "";
      return `【記録${i + 1}】${date}\n${r.output_text || ""}`;
    }).join("\n---\n");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "あなたは皮膚科クリニックのSNSマーケティング担当者です。診療記録から季節・疾患トレンドを分析し、来月のSNS投稿カレンダーを作成してください。Instagram・X・LINEの各投稿案を週1本ずつ（計4週分）提案してください。各投稿に①テーマ②投稿文③ハッシュタグ④最適な投稿曜日・時間を含めてください。" }] },
        contents: [{ parts: [{ text: `【対象月】${month || "来月"}\n\n【診療記録データ】\n${recordsText}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "コンテンツカレンダー生成APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Content calendar error:", e);
    return NextResponse.json({ error: "コンテンツカレンダー生成エラー: " + e.message }, { status: 500 });
  }
}
