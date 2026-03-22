import { NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは皮膚科・美容皮膚科の専門医です。音声書き起こしテキストの医療用語誤字を積極的に検出してください。

【必ず検出すべき音声認識誤りパターン】
・薬品名の誤り例: ヒルドイド→ひるどいど、プロトピック→ぷろとぴっく、リンデロン→りんでろん、デュピクセント→でゅぴくせんと、ミチーガ→みちーが、アレグラ→あれぐら、ザイザル→ざいざる、ディフェリン→でぃふぇりん、ラミシール→らみしーる
・疾患名の誤り例: 蕁麻疹→じんましん・じんま疹、アトピー性皮膚炎→あとぴー・アトピ、接触性皮膚炎→かぶれ・かぶれること、足白癬→みずむし・足水虫、爪白癬→つめみずむし
・処置名の誤り例: 液体窒素→えきたいちっそ・液体ちっそ、ダーモスコピー→だーもすこぴー、ナローバンドUVB→なろーばんど
・一般的な音声誤認識: ざ瘡→ざそう・にきび、酒さ→さけさ・しゅさ、掌蹠膿疱症→てのひらのうほうしょう

【重要ルール】
- 上記以外でも医療用語として不自然な表記があれば積極的に候補を挙げる
- 確信度が低くても候補として含める（見逃しより過検出を優先）
- 1〜3個の候補を提示する
- JSON形式のみで返す（説明文・Markdownなし）
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 3000, responseMimeType: "application/json" },
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
