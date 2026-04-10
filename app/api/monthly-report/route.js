export const maxDuration = 60;

export async function POST(request) {
  try {
    const { records, month } = await request.json();
    if (!records || records.length === 0) {
      return Response.json({ error: "データがありません" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const combined = records.map(r => r.output_text || "").filter(Boolean).join("\n---\n");

    const prompt = `以下は${month}の皮膚科・美容皮膚科クリニックの診察要約データです。
月次レポートを作成してください。

【出力形式】
# ${month} 月次診療レポート

## 1. 総診察件数と概要
- 総件数・疾患傾向

## 2. 疾患別集計（上位10疾患）
| 疾患名 | 件数 | 割合 | 主な処方・治療 |
|--------|------|------|----------------|
...

## 3. 処方薬ランキング（上位10薬剤）
| 薬剤名 | 使用件数 | 主な適応 |
|--------|---------|---------|
...

## 4. 季節・トレンド分析
- 今月の特徴・傾向

## 5. 来月への提言
- 在庫・準備すべきこと

---
診察データ（${records.length}件）:
${combined.substring(0, 10000)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
      }),
    });

    if (!res.ok) {
      return Response.json({ error: "AI APIエラー: " + res.status }, { status: 500 });
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const report = parts.filter(p => !p.thought).map(p => p.text || "").join("").trim();

    return Response.json({ report });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
