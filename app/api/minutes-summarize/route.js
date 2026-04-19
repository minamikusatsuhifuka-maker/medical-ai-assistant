export const maxDuration = 300;

const CHUNK_SIZE = 3000;

async function callGemini(text, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
  let lastError = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt + "\n\n" + text }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
      });
      if (!res.ok) { lastError = `${model}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const summary = parts.filter(p => !p.thought).map(p => p.text || "").join("");
      if (summary.trim()) return { summary, model };
      lastError = `${model}: empty response`;
    } catch (e) {
      lastError = `${model}: ${e.message}`;
    }
  }
  throw new Error("Gemini全モデル失敗: " + lastError);
}

export async function POST(request) {
  try {
    const { text, prompt } = await request.json();
    if (!text || !text.trim()) {
      return Response.json({ error: "テキストが必要です" }, { status: 400 });
    }

    const basePrompt = prompt || `あなたは優秀な議事録作成者です。以下の会議の書き起こしを議事録形式でまとめてください。

【出力形式】
## 日時・参加者
## 議題
## 決定事項
## アクションアイテム（担当者・期限付き）
## 次回予定

【ルール】
- 重要な発言・決定のみ抽出
- 冗長な表現は省く
- 担当者名が出たら必ず記録する`;

    // 短いテキストはそのまま処理
    if (text.length <= CHUNK_SIZE) {
      const result = await callGemini(text, basePrompt);
      return Response.json({ summary: result.summary, model: result.model, chunks: 1 });
    }

    // 長いテキストはチャンク分割して逐次処理（並列ではなく順次）
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    // 並列ではなく逐次処理でタイムアウトを防ぐ
    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkPrompt = `以下は長い会議の書き起こしの第${i + 1}部（全${chunks.length}部）です。この部分の重要な内容を箇条書きでまとめてください：`;
      const result = await callGemini(chunks[i], chunkPrompt);
      chunkSummaries.push(result.summary);
    }

    // 最終まとめ
    const mergedText = chunkSummaries.join("\n\n");
    const finalPrompt = `以下は会議の書き起こしを${chunks.length}パートに分けて要約したものです。これを統合して正式な議事録を作成してください：\n\n${basePrompt}`;
    const finalResult = await callGemini(mergedText, finalPrompt);

    return Response.json({
      summary: finalResult.summary,
      model: finalResult.model,
      chunks: chunks.length
    });

  } catch (e) {
    console.error("minutes-summarize error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
