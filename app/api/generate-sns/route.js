import { NextResponse } from "next/server";

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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "あなたは皮膚科クリニックのSNS担当者です。患者向けの親しみやすい投稿文を作成してください。専門用語は避け、絵文字を適度に使用してください。" }] },
        contents: [{ parts: [{ text: `【投稿先】${platform}\n【テーマ】${theme}\n\n上記に合わせた投稿文を作成してください。投稿先の文字数制限・特性に合わせてください。` }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "SNS投稿文生成APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Generate SNS error:", e);
    return NextResponse.json({ error: "SNS投稿文生成エラー: " + e.message }, { status: 500 });
  }
}
