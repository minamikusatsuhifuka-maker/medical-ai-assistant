import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { content } = await request.json();
    if (!content || content.trim() === "") {
      return NextResponse.json({ error: "書き起こしテキストが必要です" }, { status: 400 });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "CLAUDE_API_KEY が設定されていません" }, { status: 500 });
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        temperature: 0.5,
        system: "あなたはクリニックの接遇コンサルタントです。診察の書き起こしをもとに、スタッフの対応品質を評価してください。良かった点・改善点・具体的なアドバイスを含めてください。",
        messages: [
          { role: "user", content },
        ],
      }),
    });

    const data = await res.json();
    if (data.content?.[0]?.text) {
      return NextResponse.json({ result: data.content[0].text });
    }
    throw new Error("Claude応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Quality check error:", e);
    return NextResponse.json({ error: "品質チェックエラー: " + e.message }, { status: 500 });
  }
}
