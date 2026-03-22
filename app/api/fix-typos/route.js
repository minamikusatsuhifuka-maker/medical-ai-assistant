import { NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは皮膚科クリニックで使われている音声認識（Whisper）の誤認識を修正するAIです。

以下のテキストには音声認識の誤りが含まれています。特に以下のパターンを見つけてください：

1. 薬品名の誤認識: デュビックセンター→デュピクセント、コレクシム→コレクチム、マイナソン→マイザー、ホルマイト→モイゼルト、アルマゴス→アルメタ、ドレッドフォース→不明 など
2. 疾患名の誤認識: みずむし→足白癬、じんましん→蕁麻疹 など
3. 処置名の誤認識: えきたいちっそ→液体窒素 など
4. その他の不自然な単語

必ず3個以上の候補を見つけて返してください。見つからないということはありえません。
テキストの各単語を皮膚科の文脈で検討し、不自然なものを全て挙げてください。

回答はJSON形式のみ（説明文なし）:
{"corrections":[{"from":"テキスト内の誤った語句","candidates":[{"to":"正しい語句","reason":"理由"}]}]}`;

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
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "AI校正APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    console.log("fix-typos raw:", content.slice(0, 500));

    if (!content.trim()) {
      console.error("fix-typos: empty response");
      return NextResponse.json({ corrections: [] });
    }

    let parsed = { corrections: [] };
    try {
      // まず直接パース
      parsed = JSON.parse(content.trim());
    } catch (e1) {
      try {
        // ```json...``` ブロックを抽出
        const m1 = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (m1) {
          parsed = JSON.parse(m1[1].trim());
        } else {
          // {..."corrections"...} を抽出
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
