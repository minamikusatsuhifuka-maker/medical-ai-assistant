import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const { records } = await request.json();
    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "診療記録が必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const content = records.map((r, i) => {
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString("ja-JP") : "";
      return `【記録${i + 1}】${date}\n${r.output_text || r.input_text || ""}`;
    }).join("\n---\n");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "あなたは皮膚科クリニックの教育担当者です。診療記録を分析して月次スタッフ対応品質レポートを作成してください。以下を含めてください：①よくある疾患TOP5 ②対応の良かった点 ③改善が必要な点 ④来月の重点改善テーマ ⑤スタッフへの具体的アドバイス" }] },
        contents: [{ parts: [{ text: content }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "品質レポートAPIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Quality report error:", e);
    return NextResponse.json({ error: "品質レポートエラー: " + e.message }, { status: 500 });
  }
}
