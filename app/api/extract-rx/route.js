export const maxDuration = 30;

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text) return Response.json({ items: [] });

    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `以下のカルテ要約から処方薬・外用薬・内服薬のチェックリストを抽出してください。

【出力形式】JSONのみ。説明不要。
{"items": [
  {"name": "薬剤名", "usage": "用法・用量", "duration": "日数・期間", "type": "外用|内服|注射|その他"},
  ...
]}

薬剤が見つからない場合: {"items": []}

カルテ要約:
${text.substring(0, 2000)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
      }),
    });

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("") || "";
    const clean = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end === -1) return Response.json({ items: [] });
    const parsed = JSON.parse(clean.slice(start, end + 1));
    return Response.json({ items: parsed.items || [] });
  } catch (e) {
    return Response.json({ items: [] });
  }
}
