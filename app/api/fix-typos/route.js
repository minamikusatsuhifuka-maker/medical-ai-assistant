import { NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `皮膚科診療の音声書き起こしの誤字を直してください。必ず3個以上の修正候補をJSONで返してください。形式のみ: {"corrections":[{"from":"誤り","candidates":[{"to":"正解","reason":"理由"}]}]}`;

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

    let userPrompt = `以下は皮膚科クリニックでのWhisper音声書き起こしテキストです。音声認識の誤りを全て見つけて修正候補を提示してください。必ず3個以上見つけてください：\n\n${text}`;
    if (dictionary && Array.isArray(dictionary) && dictionary.length > 0) {
      const dictText = dictionary.map(d => `${d.from}→${d.to}`).join("\n");
      userPrompt += `\n\n【登録済み辞書（参考）】\n${dictText}`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 1.0, maxOutputTokens: 2000 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "AI校正APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    console.log("fix-typos parts count:", parts.length, "parts:", JSON.stringify(parts.map(p => ({ thought: p.thought, textLen: (p.text||"").length, textPreview: (p.text||"").slice(0,100) }))));
    // thinking partを除外してtext partのみ結合
    const content = parts.filter(p => !p.thought).map(p => p.text || "").join("") || "";
    console.log("fix-typos content:", content.slice(0, 500));

    if (!content.trim()) {
      console.error("fix-typos: empty response");
      return NextResponse.json({ corrections: [] });
    }

    let parsed = { corrections: [] };
    try {
      parsed = JSON.parse(content.trim());
    } catch (e1) {
      try {
        const m1 = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (m1) {
          parsed = JSON.parse(m1[1].trim());
        } else {
          const m2 = content.match(/\{[\s\S]*"corrections"[\s\S]*\}/);
          if (m2) {
            parsed = JSON.parse(m2[0]);
          } else {
            console.error("fix-typos: no JSON found in:", content.slice(0, 300));
            return NextResponse.json({ corrections: [] });
          }
        }
      } catch (e2) {
        console.error("fix-typos parse error:", e2.message, "raw:", content.slice(0, 300));
        return NextResponse.json({ corrections: [] });
      }
    }

    console.log("fix-typos corrections:", parsed.corrections?.length || 0);

    if (!parsed.corrections || !Array.isArray(parsed.corrections)) {
      return NextResponse.json({ corrections: [] });
    }
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("fix-typos error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
