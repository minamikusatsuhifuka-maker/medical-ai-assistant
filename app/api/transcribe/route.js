import { NextResponse } from "next/server";
import { filterTranscript } from "../../lib/transcript-filter";
import { logUsage } from "../../lib/log-usage";

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
    // ハルシネーション除去は app/lib/transcript-filter.js（1文単位・fail-open）。2026-10-29 院長承認の設計
    // 旧実装は1語でも当たるとチャンク全体を "" にしており、「よろしくお願いします」等で実際の会話ごと失われていた
    const { text: filteredText, dropped } = filterTranscript(transcribedText);
    if (dropped.length) {
      // 除去の痕跡（パターン番号と文字数のみ。本文は残さない）
      try {
        await logUsage({ route: "/api/transcribe-filter", model: "filter", context: "transcribe-filter",
          request_meta: { raw_length: transcribedText.length, kept_length: filteredText.length, dropped } });
      } catch (e) { console.error("[transcribe] filter log error:", e); }
    }
    return NextResponse.json({ text: filteredText });
  } catch (e) {
    console.error("Transcribe error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
