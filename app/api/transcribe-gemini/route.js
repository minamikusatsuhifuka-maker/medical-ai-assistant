export const maxDuration = 30;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile) {
      return Response.json({ error: "音声ファイルがありません" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    // 音声データをbase64に変換
    const audioBuffer = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: "audio/webm",
                  data: audioBase64
                }
              },
              {
                text: "以下の音声を日本語でそのまま文字起こししてください。\n\n【厳守ルール】\n- 音声に実際に含まれている発言のみを書き起こすこと\n- 音声にない会話・文章を絶対に生成・補完・推測しないこと\n- 音声が途切れた場合や無音の場合は、その部分は出力しないこと\n- 「医師：」「患者：」などのラベルは音声に含まれる場合のみ使用\n- 前置き・説明・注釈・要約は一切不要\n- 書き起こしテキストのみ出力すること\n- 音声が不明瞭な場合は聞き取れた部分のみ出力すること（推測で補わない）\n\n対象：皮膚科・美容皮膚科の診察音声"
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 1000
        }
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini transcribe error:", err);
      return Response.json({ error: "Gemini API エラー: " + res.status }, { status: 500 });
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.filter(p => !p.thought).map(p => p.text || "").join("").trim();

    if (!text) {
      return Response.json({ text: "" });
    }

    return Response.json({ text });

  } catch (e) {
    console.error("transcribe-gemini error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
