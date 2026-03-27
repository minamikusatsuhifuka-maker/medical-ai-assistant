export const maxDuration = 30;

export async function POST(request) {
  try {
    const { text, registered } = await request.json();
    if (!text || !text.trim()) {
      return Response.json({ candidates: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const registeredList = (registered || []).join("、");

    const prompt = `以下は皮膚科クリニックの音声書き起こしテキストです。
診察・医療・クリニック運営と無関係なノイズテキストを検出してください。

【ノイズの定義】
- テレビ・動画・YouTube由来のフレーズ（「次の映像でお会いしましょう」など）
- 周囲の無関係な会話（診察と関係ない日常会話）
- 音声認識の誤認識による意味不明なフレーズ
- SNS・ネット由来のフレーズ
- 繰り返しパターン（同じ文が2回以上）

【除外するもの（ノイズではない）】
- 患者の訴え・症状の説明
- 医師の診断・処方・指示
- 薬品名・疾患名・施術名
- クリニック運営・経営に関する会話
- スタッフ間の業務会話

${registeredList ? `【既に登録済みのパターン（除外）】\n${registeredList}\n` : ""}

JSON形式のみで返してください：
{"candidates":[{"text":"ノイズテキスト","reason":"理由"}]}

書き起こしテキスト：
${text.substring(0, 5000)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
      }),
    });

    if (!res.ok) return Response.json({ candidates: [] });

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    let content = parts.filter(p => !p.thought).map(p => p.text || "").join("");
    content = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let parsed = { candidates: [] };
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*"candidates"[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }

    // 登録済みを除外
    const registeredSet = new Set(registered || []);
    const filtered = (parsed.candidates || []).filter(c => !registeredSet.has(c.text));

    return Response.json({ candidates: filtered });
  } catch (e) {
    console.error("scan-noise error:", e);
    return Response.json({ candidates: [], error: e.message });
  }
}
