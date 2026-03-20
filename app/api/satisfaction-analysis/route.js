import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { content } = await request.json();
    if (!content || content.trim() === "") {
      return NextResponse.json({ error: "分析データが必要です" }, { status: 400 });
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
        max_tokens: 2000,
        temperature: 0.3,
        system: "あなたはクリニック経営コンサルタントです。診療・カウンセリング記録から患者の関心・不安・満足度のポイントを分析してください。改善提案も含めてください。必ず以下の3セクションに分けて回答してください：\n\n## 患者の関心TOP5\n## 不安・懸念TOP5\n## 改善提案",
        messages: [{ role: "user", content }],
      }),
    });

    const data = await res.json();
    if (data.content?.[0]?.text) {
      return NextResponse.json({ result: data.content[0].text });
    }
    throw new Error("Claude応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Satisfaction analysis error:", e);
    return NextResponse.json({ error: "満足度分析エラー: " + e.message }, { status: 500 });
  }
}
