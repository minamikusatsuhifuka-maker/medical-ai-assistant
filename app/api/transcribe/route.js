import { NextResponse } from "next/server";

const WHISPER_PROMPT = "皮膚科・美容皮膚科診療の会話です。";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile) {
      return NextResponse.json({ error: "音声ファイルがありません" }, { status: 400 });
    }

    // Forward to OpenAI Whisper API
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, "audio.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "ja");
    whisperForm.append("response_format", "json");
    whisperForm.append("prompt", WHISPER_PROMPT);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: whisperForm,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Whisper API error:", err);
      return NextResponse.json({ error: "Whisper API エラー" }, { status: 500 });
    }

    const data = await res.json();
    const transcribedText = data.text || "";
    const HALLUCINATION_PATTERNS = [
      /ご視聴ありがとうございました/,
      /最後までご視聴/,
      /チャンネル登録/,
      /チャンネル登録お願い/,
      /高評価.*お願い/,
      /グッドボタン/,
      /Thank you for watching/i,
      /Thanks for watching/i,
      /Please subscribe/i,
      /please like and subscribe/i,
      /happens with most of the/i,
      /most of the drugs/i,
      /See you next time/i,
      /that's all for today/i,
      /コメント欄/,
      /概要欄/,
      /サブスクライブ/,
      /メンバーシップ/,
      /スーパーチャット/,
      /ライブ配信/,
      /生放送/,
      /YouTub/i,
      /TikTok/i,
      /Instagram.*フォロー/i,
      /^[\s\.。、]+$/,
      /^\[.*\]$/,
      /^♪.*♪$/,
      /music playing/i,
      /\[音楽\]/,
      /\[無音\]/,
      /^[silence]/i,
      /本日はご覧いただ/,
      /びらん.*ありがとう/,
      /ご覧いただれ/,
      /またお呼び掛けていただ/,
      /これまで見ていただ/,
      /最後までご覧いただ/,
      /良い1日を/,
      /良い一日を/,
    ];
    const isHallucination = HALLUCINATION_PATTERNS.some(p => p.test(transcribedText.trim()))
      && transcribedText.trim().length < 30;
    let filteredText = isHallucination ? "" : transcribedText;
    if (filteredText.trim().length <= 3) filteredText = "";
    const lines = filteredText.split("\n").filter(l => l.trim());
    if (lines.length >= 3) {
      const unique = new Set(lines.map(l => l.trim()));
      if (unique.size <= Math.ceil(lines.length * 0.4)) {
        filteredText = "";
      }
    }
    return NextResponse.json({ text: filteredText });
  } catch (e) {
    console.error("Transcribe error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
