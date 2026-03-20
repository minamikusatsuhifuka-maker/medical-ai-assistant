import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text || !text.trim()) {
      return NextResponse.json({ corrections: [] });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "あなたは皮膚科・美容皮膚科の医療専門家です。音声書き起こしテキストの誤字脱字を検出し、正しい医療用語の候補を複数提示してください。ルール：皮膚科疾患名・薬品名・処置名・医療用語の誤りのみ対象。日常会話は対象外。確信度が低い場合も候補として含めてよい。結果はJSON形式のみで返す。形式:{\"corrections\":[{\"from\":\"誤りの語句\",\"candidates\":[{\"to\":\"候補1\",\"reason\":\"理由\"},{\"to\":\"候補2\",\"reason\":\"理由\"},{\"to\":\"候補3\",\"reason\":\"理由\"}]}]} candidatesは1〜3個。確実な場合は1個でよい。",
          },
          {
            role: "user",
            content: `以下の書き起こしテキストの医療用語の誤字脱字を検出:\n${text}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI API error:", err);
      return NextResponse.json(
        { error: "AI校正APIエラー" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("fix-typos error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
