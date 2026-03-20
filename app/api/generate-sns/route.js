import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { platform, theme } = await request.json();
    if (!theme || theme.trim() === "") {
      return NextResponse.json({ error: "テーマの入力が必要です" }, { status: 400 });
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
        max_tokens: 1000,
        temperature: 0.8,
        system: "あなたは皮膚科クリニックのSNS担当者です。患者向けの親しみやすい投稿文を作成してください。専門用語は避け、絵文字を適度に使用してください。",
        messages: [
          {
            role: "user",
            content: `【投稿先】${platform}\n【テーマ】${theme}\n\n上記に合わせた投稿文を作成してください。投稿先の文字数制限・特性に合わせてください。`,
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
    console.error("Generate SNS error:", e);
    return NextResponse.json({ error: "SNS投稿文生成エラー: " + e.message }, { status: 500 });
  }
}
