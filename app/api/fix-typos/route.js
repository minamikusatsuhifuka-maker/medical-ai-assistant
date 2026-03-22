import { NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは皮膚科・美容皮膚科の音声認識誤り修正の専門家です。音声書き起こしテキストに含まれるWhisperの誤認識を積極的に検出してください。

【検出対象】
- 医療用語・薬品名・疾患名・処置名の誤認識
- 文脈から明らかに不自然な単語（例:「ドレッドフォース」→「ドレッドフォース」は誤り）
- カタカナ語の誤認識（例:「プロセッサー」→「プロアクティブ」の可能性）
- ひらがな・カタカナの混在による誤り
- 音が似た別の単語への誤変換

【重要ルール】
- 文脈を重視して、その前後の会話から正しい意味を推測する
- 医療・皮膚科の文脈で意味が通らない単語は必ず候補を挙げる
- 確信度が低くても候補として含める（見逃しより過検出を優先）
- 候補が思いつかない場合でも、誤りの可能性を示す
- JSON形式のみで返す（説明文なし）
- 形式: {"corrections":[{"from":"誤り語句","candidates":[{"to":"候補","reason":"理由"}]}]}`;

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
