export const maxDuration = 300;

const CHUNK_SIZE = 8000;

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
          generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
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
## 議事録
**会議名:** （書き起こしから判断）
**出席者:** （書き起こしから判断）
**目的:** （書き起こしから判断）

## 主な議題と内容
（重要な発言・決定事項を箇条書き）

## 決定事項・アクションアイテム
（担当者・期限があれば記載）

【ルール】
- 重要な発言・決定のみ抽出
- 冗長な表現は省く
- 「[記載なし]」は使わず、不明な場合は省略する
- 絶対に途中で止めない・必ず完成させる`;

    // 短いテキストはそのまま処理
    if (text.length <= CHUNK_SIZE) {
      const result = await callGemini(text, basePrompt);
      return Response.json({ summary: result.summary, model: result.model, chunks: 1 });
    }

    // 長いテキストはチャンク分割して逐次処理
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkPrompt = `以下は会議の書き起こしの第${i + 1}部（全${chunks.length}部）です。重要な発言・決定事項を簡潔な箇条書きでまとめてください：`;
      try {
        const result = await callGemini(chunks[i], chunkPrompt);
        chunkSummaries.push(result.summary);
      } catch (e) {
        chunkSummaries.push(`（第${i + 1}部の処理中にエラー）`);
      }
    }

    // 最終まとめ
    const mergedText = chunkSummaries.join("\n\n");
    const finalResult = await callGemini(mergedText, basePrompt);

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
