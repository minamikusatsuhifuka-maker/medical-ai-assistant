import { NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `皮膚科・美容皮膚科の専門医として音声書き起こしの医療用語誤字を検出してください。薬品名・疾患名・処置名の誤りのみ対象。結果はJSONのみ: {"corrections":[{"from":"誤り","candidates":[{"to":"正しい表現","reason":"理由"}]}]}`;

export async function POST(request) {
  try {
    const body = await request.json();
    const text = body.text;
    const dictionary = body.dictionary;
    if (!text || !text.trim()) {
      return NextResponse.json({ corrections: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    let userPrompt = `以下の書き起こしテキストの医療用語の誤字脱字を検出:\n${text}`;
    if (dictionary && Array.isArray(dictionary) && dictionary.length > 0) {
      const dictText = dictionary.map(d => `${d.from}→${d.to}`).join("\n");
      userPrompt += `\n\n【登録済み辞書（参考）】\n${dictText}`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
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
