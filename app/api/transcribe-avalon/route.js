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
    // 上流のエラー本文はAPIキー断片を含みうるためログのみ。例外メッセージはステータスのみ。
    console.error("Whisper fallback error:", res.status, (await res.text()).substring(0, 200));
    throw new Error("Whisper fallback failed (status " + res.status + ")");
  }
  const data = await res.json();
  return (data.text || "").trim();
}

export async function POST(request) {
  const t0 = Date.now();
  let audioFile = null;
  let compare = false;
  try {
    const formData = await request.formData();
    audioFile = formData.get("audio");
    // compare=1（両方比較/A/B検証）時は Whisper で穴埋めせず、Avalon の生の成否を返す。
    // → クライアントが「Avalon: 接続失敗(理由)」を明示表示できる。
    compare = formData.get("compare") === "1";

    if (!audioFile) {
      return Response.json({ error: "音声ファイルがありません" }, { status: 400 });
    }

    const apiKey = process.env.AQUA_API_KEY;

    // キー未設定: compare は明示失敗 / 単独は通知付き Whisper フォールバック
    if (!apiKey) {
      if (compare) {
        return Response.json({ failed: true, engine: "avalon", error: "AQUA_API_KEY 未設定", ms: Date.now() - t0 });
      }
      const text = await runWhisperFallback(audioFile);
      return Response.json({ text, engine: "whisper", fallback: true, ms: Date.now() - t0 });
    }

    // Avalon は OpenAI 互換。送信形式は Whisper と同じ。
    // ※ 実エンドポイントは api.aquavoice.com/api/v1/...（公式記載の api.aqua.sh/v1 はさくらの
    //   パーキングに解決され到達不能。2026-06-18 実機検証で確定）。
    // ※ model は送らない。"avalon-1" 等を送ると 400 "not a valid choice"。省略でデフォルトAvalonが使われる。
    const avalonForm = new FormData();
    avalonForm.append("file", audioFile, "audio.webm");
    avalonForm.append("language", "ja");
    avalonForm.append("response_format", "json");

    const res = await fetch("https://api.aquavoice.com/api/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: avalonForm,
    });

    // Avalon 失敗: compare は明示失敗 / 単独は通知付き Whisper フォールバック
    if (!res.ok) {
      const err = await res.text();
      console.error("Avalon API error:", res.status, err.substring(0, 200));
      if (compare) {
        return Response.json({ failed: true, engine: "avalon", error: `Avalon ${res.status}: ${err.substring(0, 120)}`, ms: Date.now() - t0 });
      }
      const text = await runWhisperFallback(audioFile);
      return Response.json({ text, engine: "whisper", fallback: true, ms: Date.now() - t0 });
    }

    // 念のため Content-Type を確認（JSON 以外＝HTML等が返ったら失敗扱い）
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) {
      const body = await res.text();
      console.error("Avalon non-JSON response:", ct, body.substring(0, 120));
      if (compare) {
        return Response.json({ failed: true, engine: "avalon", error: `Avalon 非JSON応答(${ct})`, ms: Date.now() - t0 });
      }
      const text = await runWhisperFallback(audioFile);
      return Response.json({ text, engine: "whisper", fallback: true, ms: Date.now() - t0 });
    }

    const data = await res.json();
    const text = (data.text || "").trim();
    const ms = Date.now() - t0;

    try {
      await logUsage({
        route: "/api/transcribe-avalon",
        model: "avalon",
        context: "transcribe",
        input_tokens: 0,
        output_tokens: 0,
        request_meta: { audio_bytes: audioFile.size || 0, text_length: text.length, ms },
      });
    } catch (e) { console.error("[logUsage] transcribe-avalon:", e); }

    return Response.json({ text, engine: "avalon", ms });
  } catch (e) {
    console.error("transcribe-avalon error:", e);
    // compare は明示失敗（Whisper で穴埋めしない）
    if (compare) {
      return Response.json({ failed: true, engine: "avalon", error: "Avalon 例外: " + (e.message || "unknown"), ms: Date.now() - t0 });
    }
    // 単独 Avalon は例外時も可能なら通知付き Whisper にフォールバック
    try {
      if (audioFile) {
        const text = await runWhisperFallback(audioFile);
        return Response.json({ text, engine: "whisper", fallback: true, ms: Date.now() - t0 });
      }
    } catch (e2) { console.error("transcribe-avalon fallback error:", e2); }
    return Response.json({ error: e.message }, { status: 500 });
  }
}
