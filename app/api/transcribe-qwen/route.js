export const maxDuration = 30;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile) {
      return Response.json({ error: "音声ファイルがありません" }, { status: 400 });
    }

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "DASHSCOPE_API_KEY が設定されていません" }, { status: 500 });
    }

    // OpenAI互換エンドポイントを使用
    const url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/audio/transcriptions";

    const qwenForm = new FormData();
    qwenForm.append("file", audioFile, "audio.webm");
    qwenForm.append("model", "qwen3-asr-flash");
    qwenForm.append("language", "ja");
    qwenForm.append("response_format", "json");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: qwenForm,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Qwen3-ASR API error:", res.status, err);
      return Response.json({ error: "Qwen3-ASR API エラー: " + res.status + " " + err.substring(0, 200) }, { status: 500 });
    }

    const data = await res.json();
    const text = data.text || "";

    if (!text || !text.trim()) {
      return Response.json({ text: "" });
    }

    return Response.json({ text: text.trim() });

  } catch (e) {
    console.error("transcribe-qwen error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
