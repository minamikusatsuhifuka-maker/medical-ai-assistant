import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { purpose, content, language = "ja" } = await request.json();
    const langInstruction = language === "en" ? "Please write the patient explanation in English." :
      language === "zh" ? "请用中文（简体）为患者写说明资料。" :
      language === "ko" ? "환자를 위한 설명 자료를 한국어로 작성해 주세요。" :
      language === "th" ? "กรุณาเขียนเอกสารอธิบายสำหรับผู้ป่วยเป็นภาษาไทย" : "";
    if (!content || content.trim() === "") {
      return NextResponse.json({ error: "コンテンツが必要です" }, { status: 400 });
    }
    if (!purpose || purpose.trim() === "") {
      return NextResponse.json({ error: "用途の指定が必要です" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "あなたは皮膚科クリニックの医療事務スタッフです。与えられた診療記録をもとに、指定された用途の文書を作成してください。" }] },
        contents: [{ parts: [{ text: `【用途】${purpose}\n【元データ】${content}\n\n上記をもとに適切な文書を作成してください。${langInstruction?"\n\n"+langInstruction:""}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "資料生成APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Generate material error:", e);
    return NextResponse.json({ error: "資料生成エラー: " + e.message }, { status: 500 });
  }
}
