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
        system_instruction: { parts: [{ text: "あなたは皮膚科クリニックの患者役です。スタッフが適切な対応を練習できるよう、リアルな患者の問いかけや状況を生成してください。" }] },
        contents: [{ parts: [{ text: `【疾患/状況】${situation}\n\n上記に関する患者との会話練習シナリオと、模範応答例を生成してください。` }] }],
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
