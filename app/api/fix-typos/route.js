import { NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは皮膚科クリニックの音声書き起こし校正担当者です。以下のテキストはWhisperという音声認識AIが生成した書き起こしです。音声認識の誤りを見つけて修正候補を提示してください。

Whisperは以下のような誤りをよく起こします：
1. 似た音の別の単語に変換する（例：「プロアクティブ」→「プロアクティブ」以外の言葉）
2. カタカナ語を別のカタカナ語に変換する
3. 医療用語を日常語に変換する
4. 固有名詞を別の単語に変換する

テキストを注意深く読み、文脈的に不自然な単語や医療現場で使われない表現を見つけてください。

必ずJSON形式のみで回答してください：
{"corrections":[{"from":"テキスト内の疑わしい語句","candidates":[{"to":"正しいと思われる語句","reason":"なぜそう判断したか"}]}]}

候補が見つからない場合でも {"corrections":[]} を返してください。`;

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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
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
    console.log("Gemini raw response:", content.slice(0, 500));

    let parsed = { corrections: [] };
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                        content.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON parse error:", e.message, "Raw:", content.slice(0, 200));
      return NextResponse.json({ corrections: [] });
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
