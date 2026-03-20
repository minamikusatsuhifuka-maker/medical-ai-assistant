import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { situation } = await request.json();
    if (!situation || situation.trim() === "") {
      return NextResponse.json({ error: "疾患名または状況の入力が必要です" }, { status: 400 });
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
        temperature: 0.8,
        system: "あなたは皮膚科クリニックの患者役です。スタッフが適切な対応を練習できるよう、リアルな患者の問いかけや状況を生成してください。",
        messages: [
          {
            role: "user",
            content: `【疾患/状況】${situation}\n\n上記に関する患者との会話練習シナリオと、模範応答例を生成してください。`,
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
    console.error("Roleplay error:", e);
    return NextResponse.json({ error: "ロールプレイ生成エラー: " + e.message }, { status: 500 });
  }
}
