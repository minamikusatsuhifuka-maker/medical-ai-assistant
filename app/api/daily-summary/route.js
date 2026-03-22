import { NextResponse } from "next/server";

export const maxDuration = 60;

const PROMPTS = {
  summary: "皮膚科専門医として、この日の診療内容を総括してください。疾患別件数・特記事項・翌日への申し送り事項をまとめてください。",
  staff_manual: "皮膚科クリニックの教育担当として、この日の診療記録をもとにスタッフ指導用マニュアルを作成してください。よくある対応パターン・注意点・改善提案を含めてください。",
  patient_material: "皮膚科クリニックのスタッフとして、この日の診療記録をもとに患者向け説明資料のベースを作成してください。疾患別にわかりやすい説明・注意事項・日常生活のアドバイスを含めてください。",
  analysis: "皮膚科専門医として、この日の診療データを分析してください。疾患トレンド・処方パターン・患者層・特記事項をまとめてください。",
};

export async function POST(request) {
  try {
    const { records, date, mode } = await request.json();
    if (!records || !records.length) {
      return NextResponse.json({ error: "レコードがありません" }, { status: 400 });
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
      `--- 記録${i + 1}${r.patient_id ? " (ID:" + r.patient_id + ")" : ""} ---\n${r.input_text ? "【書き起こし】\n" + r.input_text + "\n" : ""}${r.output_text ? "【要約】\n" + r.output_text : ""}`
    ).join("\n\n");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: `${date}の診療記録（${records.length}件）を分析してください。\n\n${combined}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("daily-summary API error:", err);
      return NextResponse.json({ error: "AI分析APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";

    return NextResponse.json({ result: content, model: "gemini-2.5-flash" });
  } catch (e) {
    console.error("daily-summary error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
