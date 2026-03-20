import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { purpose, content } = await request.json();
    if (!content || content.trim() === "") {
      return NextResponse.json({ error: "コンテンツが必要です" }, { status: 400 });
    }
    if (!purpose || purpose.trim() === "") {
      return NextResponse.json({ error: "用途の指定が必要です" }, { status: 400 });
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        temperature: 0.7,
        system: "あなたは皮膚科クリニックの医療事務スタッフです。与えられた診療記録をもとに、指定された用途の文書を作成してください。",
        messages: [
          {
            role: "user",
            content: `【用途】${purpose}\n【元データ】${content}\n\n上記をもとに適切な文書を作成してください。`,
          },
        ],
      }),
    });

    const data = await res.json();
    if (data.content?.[0]?.text) {
      return NextResponse.json({ result: data.content[0].text });
    }
    throw new Error("Claude応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Generate material error:", e);
    return NextResponse.json({ error: "資料生成エラー: " + e.message }, { status: 500 });
  }
}
