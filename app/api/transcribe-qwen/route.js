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

    // 音声データをArrayBufferに変換
    const audioBuffer = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // Qwen3-ASR Flash API（ファイル認識）
    const url = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3-asr-flash",
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "input_audio",
                  input_audio: {
                    data: `data:audio/webm;base64,${audioBase64}`,
                    format: "webm"
                  }
                }
              ]
            }
          ]
        },
        parameters: {
          asr_options: {
            language: "ja"
          }
        }
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Qwen3-ASR API error:", err);
      return Response.json({ error: "Qwen3-ASR API エラー: " + res.status }, { status: 500 });
    }

    const data = await res.json();

    // レスポンスからテキストを抽出
    const text = data.output?.choices?.[0]?.message?.content?.[0]?.text ||
                 data.output?.text ||
                 "";

    if (!text || !text.trim()) {
      return Response.json({ text: "" });
    }

    return Response.json({ text: text.trim() });

  } catch (e) {
    console.error("transcribe-qwen error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
