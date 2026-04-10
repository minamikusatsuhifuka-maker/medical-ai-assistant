export const maxDuration = 30;

export async function POST(request) {
  try {
    const { disease, isFirstVisit } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `皮膚科クリニックの${isFirstVisit?"初診":"再診"}患者向けの「${disease}」に特化した問診票を作成してください。

【出力形式】患者が読みやすい日本語で、スマホで回答しやすい形式

# ${disease} 問診票（${isFirstVisit?"初診":"再診"}）

## 基本情報
- お名前：
- 生年月日：
- 性別：

## 症状について
（${disease}に特有の質問を5〜8項目、選択肢付きで）

## 現在の治療・薬
（現在使用中の薬・他院での治療歴）

## 生活背景
（症状に関連する生活習慣・環境）

## その他
（ご要望・気になること）

問診票は患者が自分で記入できる平易な言葉で作成。専門用語は使わない。`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
      }),
    });
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const questionnaire = parts.filter(p => !p.thought).map(p => p.text || "").join("").trim();
    return Response.json({ questionnaire });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
