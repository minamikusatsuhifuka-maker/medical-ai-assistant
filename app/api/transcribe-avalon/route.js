import { logUsage } from "../../lib/log-usage";

export const maxDuration = 30;

// Whisper(OpenAI) へのフォールバック。AQUA_API_KEY 未設定 / Avalon 失敗時に使用。
// 既存 /api/transcribe と同じ送信形式（FormData）。重い幻聴フィルタは掛けず、
// クライアント側の filterTranscriptNoise に委ねる（qwen/gemini ルートと同じ方針）。
async function runWhisperFallback(audioFile) {
  const whisperForm = new FormData();
  whisperForm.append("file", audioFile, "audio.webm");
  whisperForm.append("model", "whisper-1");
  whisperForm.append("language", "ja");
  whisperForm.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: whisperForm,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Whisper fallback error: " + res.status + " " + err.substring(0, 200));
  }
  const data = await res.json();
  return (data.text || "").trim();
}

export async function POST(request) {
  const t0 = Date.now();
  let audioFile = null;
  try {
    const formData = await request.formData();
    audioFile = formData.get("audio");

    if (!audioFile) {
      return Response.json({ error: "音声ファイルがありません" }, { status: 400 });
    }

    const apiKey = process.env.AQUA_API_KEY;

    // キー未設定 → Whisper にフォールバック（落とさない）
    if (!apiKey) {
      const text = await runWhisperFallback(audioFile);
      return Response.json({ text, engine: "whisper", fallback: true, ms: Date.now() - t0 });
    }

    // Avalon は OpenAI 互換（base_url を Aqua に向けるだけ）。送信形式は Whisper と同じ。
    const avalonForm = new FormData();
    avalonForm.append("file", audioFile, "audio.webm");
    avalonForm.append("model", "avalon-1");
    avalonForm.append("language", "ja");
    avalonForm.append("response_format", "json");

    const res = await fetch("https://api.aqua.sh/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: avalonForm,
    });

    // Avalon 失敗 → Whisper にフォールバック（エラーで落とさない）
    if (!res.ok) {
      const err = await res.text();
      console.error("Avalon API error:", res.status, err.substring(0, 200));
      const text = await runWhisperFallback(audioFile);
      return Response.json({ text, engine: "whisper", fallback: true, ms: Date.now() - t0 });
    }

    const data = await res.json();
    const text = (data.text || "").trim();
    const ms = Date.now() - t0;

    try {
      await logUsage({
        route: "/api/transcribe-avalon",
        model: "avalon-1",
        context: "transcribe",
        input_tokens: 0,
        output_tokens: 0,
        request_meta: { audio_bytes: audioFile.size || 0, text_length: text.length, ms },
      });
    } catch (e) { console.error("[logUsage] transcribe-avalon:", e); }

    return Response.json({ text, engine: "avalon", ms });
  } catch (e) {
    console.error("transcribe-avalon error:", e);
    // 例外時も可能なら Whisper にフォールバック
    try {
      if (audioFile) {
        const text = await runWhisperFallback(audioFile);
        return Response.json({ text, engine: "whisper", fallback: true, ms: Date.now() - t0 });
      }
    } catch (e2) { console.error("transcribe-avalon fallback error:", e2); }
    return Response.json({ error: e.message }, { status: 500 });
  }
}
