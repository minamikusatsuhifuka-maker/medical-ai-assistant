export const maxDuration = 300;

const CHUNK_SIZE = 8000;

// チャンク要約用プロンプト
const CHUNK_PROMPT = `あなたは議事録作成の専門家です。以下は会議の書き起こし（全体の一部分）です。
この部分を「詳細な議事録の構成要素」として、情報を落とさず整理してください。

【絶対ルール】
1. 議論された論点・意見・具体例をすべて拾ってください。要約して省略しないこと。
2. 発言者の立場・発言内容の具体性を保ってください（「〇〇という意見が出た」ではなく「〇〇の理由で××すべきという意見」のように具体的に）。
3. 数字・固有名詞・具体的なエピソードは必ず保持してください。
4. 箇条書きで構造化し、各項目は簡潔にまとめず、必要な情報量を維持してください。
5. この部分は全体の一部なので、無理に結論づけず、話題ごとに整理することに集中してください。
6. 「音声認識の精度が〜」「書き起こしに不明瞭な部分が〜」等の前置き・注釈・お願い文は一切書かないこと。
7. Markdown記法で見出し（##, ###）と箇条書き（*）を使って整理してください。

【出力形式】
## [このチャンクの主題]

### 論点1
* 議論内容（具体的に）
* 出た意見（発言者の立場も含めて）
* 具体例・エピソード

### 論点2
...

【書き起こし】
`;

// 最終統合用プロンプト
const FINAL_PROMPT = `以下は、会議の書き起こしをチャンク分割して要約した結果です。
これらを統合して、**詳細で網羅的な議事録**を作成してください。

【絶対ルール】
1. 各チャンクに含まれる論点・意見・具体例をすべて最終議事録に反映してください。
2. 重複する論点は統合しつつ、情報量を減らさないこと。省略・圧縮は禁止です。
3. 会議全体の流れが分かるよう、論理的な順序で再構成してください。
4. 数字・固有名詞・具体例は必ず保持してください。
5. 最後に「決定事項」「ネクストアクション」「未決事項」のセクションを必ず設けてください。
6. 前置き・注釈・お願い文は一切書かないこと（「音声認識の精度が〜」等の記載禁止）。
7. Markdown記法で整形してください。

【出力形式】
## 議事録：[会議のタイトル]

### 会議の概要
（2-3行で会議の目的と主要議題）

### 1. [論点1のタイトル]
#### 1.1 [サブトピック]
* 詳細な内容
* 出た意見・議論

#### 1.2 [サブトピック]
...

### 2. [論点2のタイトル]
...

### 決定事項
* ...

### ネクストアクション
* ...

### 未決事項・宿題
* ...

【各チャンクの要約】
`;

// 禁止ルール（念のため二重適用）
const FORBIDDEN_RULES = "\n\n【絶対禁止】以下は一切出力しないこと：音声認識の精度が〜、断片的な情報から〜、再録音をお願いします、把握が困難、推定します、※で始まる注釈、**で囲まれた注意書き、議事録以外の説明文やコメント";

async function callGemini(text, prompt, maxOutputTokens = 8192) {
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
          generationConfig: { temperature: 0.3, maxOutputTokens },
        }),
      });
      if (!res.ok) { lastError = `${model}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const summary = parts.filter(p => !p.thought).map(p => p.text || "").join("");
      const finishReason = data.candidates?.[0]?.finishReason || "";
      if (summary.trim()) return { summary, model, finishReason };
      lastError = `${model}: empty response`;
    } catch (e) {
      lastError = `${model}: ${e.message}`;
    }
  }
  throw new Error("Gemini全モデル失敗: " + lastError);
}

export async function POST(request) {
  const startTime = Date.now();
  try {
    const { text, prompt } = await request.json();
    if (!text || !text.trim()) {
      return Response.json({ error: "テキストが必要です" }, { status: 400 });
    }

    // 短いテキストはそのまま詳細プロンプトで処理
    if (text.length <= CHUNK_SIZE) {
      const singlePrompt = (prompt ? prompt + "\n\n" : "") + FINAL_PROMPT.replace("【各チャンクの要約】", "【書き起こし】") + FORBIDDEN_RULES;
      const result = await callGemini(text, singlePrompt, 32768);
      const truncated = result.finishReason && result.finishReason !== "STOP";
      console.log(`[minutes-summarize] single done: input=${text.length}chars, output=${result.summary.length}chars, finishReason=${result.finishReason}, totalElapsed=${Date.now() - startTime}ms`);
      if (truncated) {
        console.warn(`[minutes-summarize] ⚠️ finishReason=${result.finishReason} - 出力が途中で打ち切られた可能性あり`);
      }
      return Response.json({
        summary: result.summary,
        model: result.model,
        chunks: 1,
        truncated: !!truncated,
        finishReason: result.finishReason,
      });
    }

    // 長いテキストはチャンク分割して逐次処理
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    const chunkSummaries = [];
    let totalInput = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunkStart = Date.now();
      const chunkPromptText = CHUNK_PROMPT + FORBIDDEN_RULES + `\n\n（これは全${chunks.length}部のうち第${i + 1}部です）\n`;
      try {
        const result = await callGemini(chunks[i], chunkPromptText, 8192);
        chunkSummaries.push(result.summary);
        totalInput += chunks[i].length;
        console.log(`[minutes-summarize] chunk ${i + 1}/${chunks.length} done: input=${chunks[i].length}chars, output=${result.summary.length}chars, finishReason=${result.finishReason}, elapsed=${Date.now() - chunkStart}ms`);
        if (result.finishReason && result.finishReason !== "STOP") {
          console.warn(`[minutes-summarize] ⚠️ chunk ${i + 1} finishReason=${result.finishReason} - チャンク出力が途中で打ち切られた可能性あり`);
        }
      } catch (e) {
        chunkSummaries.push(`（第${i + 1}部の処理中にエラー）`);
        console.error(`[minutes-summarize] chunk ${i + 1}/${chunks.length} error: ${e.message}`);
      }
    }

    // 最終統合
    const userPrefix = prompt ? prompt + "\n\n" : "";
    const finalPromptText = userPrefix + FINAL_PROMPT + FORBIDDEN_RULES;
    const mergedText = chunkSummaries.join("\n\n---\n\n");
    const finalResult = await callGemini(mergedText, finalPromptText, 32768);
    const truncated = finalResult.finishReason && finalResult.finishReason !== "STOP";

    console.log(`[minutes-summarize] final integration done: input=${mergedText.length}chars, output=${finalResult.summary.length}chars, finishReason=${finalResult.finishReason}, totalInput=${totalInput}chars, totalElapsed=${Date.now() - startTime}ms`);
    if (truncated) {
      console.warn(`[minutes-summarize] ⚠️ finishReason=${finalResult.finishReason} - 最終統合の出力が途中で打ち切られた可能性あり`);
    }

    return Response.json({
      summary: finalResult.summary,
      model: finalResult.model,
      chunks: chunks.length,
      truncated: !!truncated,
      finishReason: finalResult.finishReason,
    });

  } catch (e) {
    console.error("minutes-summarize error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
