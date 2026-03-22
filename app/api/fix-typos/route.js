import { NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `音声認識（Whisper）の書き起こしテキストの誤りを修正する専門家です。テキストを読んで、明らかに不自然な単語や誤認識と思われる箇所を3〜10個見つけて修正候補を提示してください。必ず何か候補を見つけること。JSONのみで返す: {"corrections":[{"from":"誤り","candidates":[{"to":"修正候補","reason":"理由"}]}]}`;

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

    let userPrompt = `以下の音声書き起こしテキストを校正してください。文脈的に不自然な単語、医療現場で使われない表現、音が似た別の単語への誤変換を積極的に探してください：\n\n${text}`;
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
        generationConfig: { temperature: 0.7, maxOutputTokens: 3000, responseMimeType: "application/json" },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "AI校正APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    console.log("fix-typos raw response length:", content.length, "preview:", content.slice(0, 300));

    if (!content.trim()) {
      console.error("fix-typos: empty response from Gemini");
      return NextResponse.json({ corrections: [] });
    }

    let parsed = { corrections: [] };
    try {
      // responseMimeType=application/json なので直接パースを試みる
      parsed = JSON.parse(content.trim());
    } catch (e1) {
      console.log("fix-typos: direct parse failed, trying extraction");
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                          content.match(/(\{[\s\S]*\})/);
        const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
        parsed = JSON.parse(jsonStr);
      } catch (e2) {
        console.error("fix-typos JSON parse error:", e2.message, "Raw:", content.slice(0, 300));
        return NextResponse.json({ corrections: [] });
      }
    }

    console.log("fix-typos parsed corrections count:", parsed.corrections?.length || 0);

    if (!parsed.corrections || !Array.isArray(parsed.corrections)) {
      return NextResponse.json({ corrections: [] });
    }
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("fix-typos error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
