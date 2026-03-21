import { NextResponse } from "next/server";

export const maxDuration = 30;

const SYSTEM_PROMPT = "あなたは皮膚科・美容皮膚科の医療専門家です。音声書き起こしテキストの誤字脱字を検出し、正しい医療用語の候補を複数提示してください。ルール：皮膚科疾患名・薬品名・処置名・医療用語の誤りのみ対象。日常会話は対象外。確信度が低い場合も候補として含めてよい。結果はJSON形式のみで返す。形式:{\"corrections\":[{\"from\":\"誤りの語句\",\"candidates\":[{\"to\":\"候補1\",\"reason\":\"理由\"},{\"to\":\"候補2\",\"reason\":\"理由\"},{\"to\":\"候補3\",\"reason\":\"理由\"}]}]} candidatesは1〜3個。確実な場合は1個でよい。";

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text || !text.trim()) {
      return NextResponse.json({ corrections: [] });
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
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: `以下の書き起こしテキストの医療用語の誤字脱字を検出:\n${text}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "AI校正APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const objMatch = content.match(/\{[\s\S]*"corrections"[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0];
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("fix-typos JSON parse error:", parseErr, "raw:", content);
      return NextResponse.json({ corrections: [], error: "AIレスポンスの解析に失敗しました" });
    }
    if (!parsed.corrections || !Array.isArray(parsed.corrections)) {
      return NextResponse.json({ corrections: [] });
    }
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("fix-typos error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
