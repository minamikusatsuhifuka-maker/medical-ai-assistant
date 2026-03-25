export const maxDuration = 30;

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text || !text.trim()) {
      return Response.json({ tasks: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = `以下の皮膚科・美容皮膚科クリニックの議事録からタスクを抽出してください。

【判断基準】
- 患者対応・医療安全（urgency:3-4, importance:4, role_level:director/manager）
- スタッフ教育・採用・労務（urgency:2, importance:3-4, role_level:manager/leader）
- 売上・集患・マーケティング（urgency:2-3, importance:3, role_level:manager）
- 設備・機器・オペレーション改善（urgency:2, importance:2-3, role_level:leader/staff）
- 法令遵守・届出・保険請求（urgency:3-4, importance:4, role_level:director/manager）
- 患者満足度・クレーム対応（urgency:3-4, importance:4, role_level:manager/leader）
- 美容メニュー開発・価格設定（urgency:2, importance:2-3, role_level:manager）

JSON配列のみを返してください（説明文不要）：
[{"title":"タスク名","urgency":2,"importance":2,"category":"operations","role_level":"staff"}]

categoryは: operations(運営), medical(医療), hr(人事), finance(経理)
role_levelは: director, manager, leader, staff
urgency/importance: 1=低 2=やや低 3=やや高 4=高

議事録:
${text.substring(0, 4000)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 3000 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("extract-tasks API error:", err);
      return Response.json({ tasks: [], error: `HTTP ${res.status}` });
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    let content = parts.filter(p => !p.thought).map(p => p.text || "").join("");

    content = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const si = content.indexOf("[");
    const ei = content.lastIndexOf("]");
    if (si === -1 || ei === -1) {
      console.error("extract-tasks: no JSON array found:", content.slice(0, 200));
      return Response.json({ tasks: [] });
    }

    const jsonStr = content.substring(si, ei + 1);
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return Response.json({ tasks: [] });
    }

    return Response.json({ tasks: parsed });
  } catch (e) {
    console.error("extract-tasks error:", e);
    return Response.json({ tasks: [], error: e.message });
  }
}
