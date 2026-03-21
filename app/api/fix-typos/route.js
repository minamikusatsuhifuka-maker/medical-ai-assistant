import { NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = "あなたは皮膚科・美容皮膚科の専門医です。音声書き起こしテキストに含まれる医療用語の誤認識を積極的に検出してください。\n\n【必ず検出すべき誤りの例】\n- 薬品名: ヒルドイド→ヒルドイド、プロトピック、リンデロン、キンダベート、アンテベート、デルモベート、ロコイド等の誤字\n- 疾患名: 「じんましん」→蕁麻疹、「アトピー」→アトピー性皮膚炎、「水虫」→足白癬等\n- 処置名: 「液体窒素」「ダーモスコピー」「ナローバンド」等の誤字\n- 外用薬の用法: 「プロアクティブ」「スタンダード」等の治療法名\n- 音声認識特有の誤り: 似た音の単語への誤変換\n\n【重要】\n- 誤りが疑われる場合は積極的に候補を挙げる（確信度が低くても含める）\n- 1〜3個の候補を必ず提示する\n- 結果はJSON形式のみで返す（説明文不要）\n- 形式: {\"corrections\":[{\"from\":\"誤りの語句\",\"candidates\":[{\"to\":\"候補1\",\"reason\":\"理由\"},{\"to\":\"候補2\",\"reason\":\"理由\"}]}]}";

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text || !text.trim()) {
      return NextResponse.json({ corrections: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: `以下の書き起こしテキストの医療用語の誤字脱字を検出:\n${text}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "AI校正APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const objMatch = content.match(/\{[\s\S]*"corrections"[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0];
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("fix-typos JSON parse error:", parseErr, "raw:", content);
      return NextResponse.json({ corrections: [], error: "AIレスポンスの解析に失敗しました" });
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
