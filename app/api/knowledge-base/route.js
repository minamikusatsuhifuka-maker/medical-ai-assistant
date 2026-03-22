import { NextResponse } from "next/server";

export const maxDuration = 60;

const PROMPTS = {
  manual: "あなたは皮膚科クリニックの教育担当者です。診療記録から院内マニュアルを作成してください。疾患別に外用方法・服薬指導・患者説明のポイントをまとめてください。",
  library: "あなたは皮膚科クリニックの教育担当者です。診療記録から疾患別標準説明文ライブラリを作成してください。各疾患について①疾患説明②治療方針③日常生活注意点④よくある質問をまとめてください。",
  training: "あなたは皮膚科クリニックの教育担当者です。診療記録から新人スタッフ向け対応パターン集を作成してください。よくある患者の訴えと適切な対応例をまとめてください。",
};

export async function POST(request) {
  try {
    const { records, mode } = await request.json();
    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "診療記録が必要です" }, { status: 400 });
    }

    const systemPrompt = PROMPTS[mode];
    if (!systemPrompt) {
      return NextResponse.json({ error: "無効なモードです" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const content = records.map((r, i) => {
      return `【記録${i + 1}】\n${r.output_text || r.input_text || ""}`;
    }).join("\n---\n");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: content }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "ナレッジベースAPIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Knowledge base error:", e);
    return NextResponse.json({ error: "ナレッジベースエラー: " + e.message }, { status: 500 });
  }
}
