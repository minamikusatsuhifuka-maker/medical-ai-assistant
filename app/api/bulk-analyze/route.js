import { NextResponse } from "next/server";

export const maxDuration = 60;

const PROMPTS = {
  treatment: "あなたは皮膚科専門医です。複数の診療記録から疾患別の治療説明・外用方法・治療プランを整理してまとめてください。疾患ごとにセクション分けし、外用薬の使い方・服薬指導・処置・経過観察のポイントを含めてください。",
  patient: "あなたは皮膚科クリニックの医療スタッフです。診療記録をもとに患者向けのわかりやすい説明文を疾患別に作成してください。専門用語は平易な言葉に言い換え、治療の目的・注意点・日常生活での注意を含めてください。",
  protocol: "あなたは皮膚科専門医です。診療記録から治療プロトコルを抽出・整理してください。疾患別に標準的な治療手順・薬剤選択・フォローアップ計画をまとめてください。",
  faq: "あなたは皮膚科クリニックのウェブ担当者です。診療記録をもとに患者がよく持つ疑問をQ&A形式で10問程度作成してください。ホームページ掲載用として患者目線で作成してください。",
  training: "あなたは皮膚科クリニックの教育担当者です。診療記録をもとに新人スタッフ向けの研修資料を作成してください。疾患の特徴・患者対応のポイント・よくある質問への回答例を含めてください。",
};

export async function POST(request) {
  try {
    const { records, mode } = await request.json();
    if (!records || !records.length) {
      return NextResponse.json({ error: "レコードが選択されていません" }, { status: 400 });
    }
    const systemPrompt = PROMPTS[mode];
    if (!systemPrompt) {
      return NextResponse.json({ error: "不明な分析モードです" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const combined = records.map((r, i) =>
      `--- 記録${i + 1} ---\n${r.input_text ? "【書き起こし】\n" + r.input_text + "\n" : ""}${r.output_text ? "【要約】\n" + r.output_text : ""}`
    ).join("\n\n");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: `以下の${records.length}件の診療記録を分析してください。\n\n${combined}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("bulk-analyze API error:", err);
      return NextResponse.json({ error: "AI分析APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";

    return NextResponse.json({ result: content, model: "gemini-2.5-flash" });
  } catch (e) {
    console.error("bulk-analyze error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
