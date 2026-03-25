export const maxDuration = 60;

const CHUNK_SIZE = 3000;

async function callGemini(text, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
  let lastError = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt + "\n\n" + text }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
        }),
      });
      if (!res.ok) { lastError = `${model}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const summary = parts.filter(p => !p.thought).map(p => p.text || "").join("");
      if (summary.trim()) return { summary, model };
      lastError = `${model}: empty response`;
    } catch (e) { lastError = `${model}: ${e.message}`; }
  }
  throw new Error("Gemini失敗: " + lastError);
}

export async function POST(request) {
  try {
    const { text, prompt, title } = await request.json();
    if (!text || text.trim() === "") {
      return Response.json({ error: "テキストが必要です" }, { status: 400 });
    }

    const basePrompt = prompt || "以下の会議・ミーティングの書き起こしから議事録を作成してください。";

    if (text.length <= CHUNK_SIZE) {
      const fullPrompt = `${basePrompt}\n\n以下の構成で簡潔にまとめてください：\n1. 日時・参加者（わかる場合）\n2. 議題・アジェンダ\n3. 決定事項\n4. 各議題の要点\n5. アクションアイテム（担当者・期限）\n6. 次回予定`;
      const result = await callGemini(text, fullPrompt);
      return Response.json({ summary: result.summary, model: result.model, chunks: 1 });
    }

    // チャンク分割
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    // 各チャンクを順番に要約
    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkPrompt = `以下は長い会議・ミーティングの書き起こしの第${i + 1}部（全${chunks.length}部）です。
この部分の要点・発言内容・決定事項・アクションアイテムを簡潔に箇条書きでまとめてください。
重要な発言・数字・固有名詞は漏らさずに含めてください。`;
      const result = await callGemini(chunks[i], chunkPrompt);
      chunkSummaries.push(`【第${i + 1}部の要点】\n${result.summary}`);
    }

    // 統合
    const mergedText = chunkSummaries.join("\n\n");
    const finalPrompt = `以下は長い会議・ミーティングの書き起こしを${chunks.length}つのパートに分けて要約したものです。
これらを統合して、一つの完成した議事録を作成してください。

以下の構成でまとめてください：
1. 日時・参加者（わかる場合）
2. 議題・アジェンダ
3. 決定事項（重要度順）
4. 各議題の要点
5. アクションアイテム（担当者・期限付き）
6. 次回予定
7. その他メモ・補足

重複する内容は統合し、重要な情報は漏らさずに含めてください。
皮膚科・美容皮膚科クリニックの経営・運営の観点で重要事項を優先してください。`;

    const finalResult = await callGemini(mergedText, finalPrompt);
    return Response.json({ summary: finalResult.summary, model: finalResult.model, chunks: chunks.length });

  } catch (e) {
    console.error("minutes-summarize error:", e);
    return Response.json({ error: "議事録要約エラー: " + e.message }, { status: 500 });
  }
}
