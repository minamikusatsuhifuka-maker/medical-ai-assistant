import { logUsage } from "../../lib/log-usage";
import { GEMINI_MODELS } from "../../lib/gemini-models";

// 対策1: maxDuration を 800秒に拡大（Vercel Pro上限）
export const maxDuration = 800;

const CHUNK_SIZE = 8000;

// チャンク要約用プロンプト
const CHUNK_PROMPT = `あなたは議事録作成の専門家です。以下は会議の書き起こし（全体の一部分）です。
この部分を「詳細な議事録の構成要素」として、情報を落とさず整理してください。

【絶対ルール】
1. 議論された論点・意見・具体例をすべて拾ってください。要約して省略しないこと。
2. 発言者の立場・発言内容の具体性を保ってください（「〇〇という意見が出た」ではなく「〇〇の理由で××すべきという意見」のように具体的に）。
3. 数字・固有名詞（ただし人名・個人を特定し得る情報は除く。下記ルール8の人名除外を優先）・具体的なエピソードは必ず保持してください。
4. 箇条書きで構造化し、各項目は簡潔にまとめず、必要な情報量を維持してください。
5. この部分は全体の一部なので、無理に結論づけず、話題ごとに整理することに集中してください。
6. 「音声認識の精度が〜」「書き起こしに不明瞭な部分が〜」等の前置き・注釈・お願い文は一切書かないこと。
7. Markdown記号（#, ##, ###, **, ---, *）は使わないこと。見出しは行頭に「■」、箇条書きは行頭に「・」を使い、改行と空行で読みやすく整理すること。強調したい語は「」で囲む。
8. 【個人名・個人情報の除外（最優先・厳守）】特定の個人の固有名（人名）を一切出力しないこと。スタッフ名・患者名・その他いかなる実名も含めない。患者を特定し得る情報（氏名・カルテ番号・連絡先・生年月日等）も含めない。「誰が」を示す必要がある場合は実名でなく役割・一般名詞に置き換える（例:「参加者」「スタッフ」「受付担当」「院長」「看護師」）。担当者も名前でなく役割で表す（例:「田中さんが対応」→「受付担当が対応」）。議題・決定事項・タスク・期限の情報は保持する。

【出力形式】
■ [このチャンクの主題]

・論点1: 議論内容（具体的に）／出た意見（発言者の立場も含めて）／具体例・エピソード
・論点2: ...

【書き起こし】
`;

// 最終統合用プロンプト
const FINAL_PROMPT = `以下は、会議の書き起こしをまとめた内容です。
これを統合して、「端的な要約」と「詳細で網羅的な議事録」を一度に作成してください。

【絶対ルール】
1. 各内容に含まれる論点・意見・具体例をすべて最終議事録に反映してください。
2. 重複する論点は統合しつつ、議事録本文の情報量は減らさないこと（圧縮禁止）。ただし冒頭の「端的な要約」は短くまとめること。
3. 会議全体の流れが分かるよう、論理的な順序で再構成してください。
4. 数字・固有名詞（ただし人名・個人を特定し得る情報は除く。下記ルール8の人名除外を優先）・具体例は必ず保持してください。
5. 議事録の最後に「決定事項」「ネクストアクション」「未決事項・宿題」のセクションを必ず設けてください。
6. 前置き・注釈・お願い文は一切書かないこと（「音声認識の精度が〜」等の記載禁止）。
7. Markdown記号（#, ##, ###, **, ---, *）は絶対に使わないこと。見出しは行頭に「■」、箇条書きは行頭に「・」を使い、項目間は空行で区切る。強調したい語は「」で囲む（**は使わない）。コピーしてそのまま電子カルテやメールに貼れるプレーンなテキストにすること。
8. 【個人名・個人情報の除外（最優先・厳守）】特定の個人の固有名（人名）を一切出力しないこと。スタッフ名・患者名・その他いかなる実名も含めない。患者を特定し得る情報（氏名・カルテ番号・連絡先・生年月日等）も含めない。「誰が」を示す必要がある場合は実名でなく役割・一般名詞に置き換える（例:「参加者」「スタッフ」「受付担当」「院長」「看護師」）。タスクの担当者も名前でなく役割で表す（例:「田中さんが対応」→「受付担当が対応」）。この人名除外は冒頭の「端的な要約」と「議事録」本体の両方に必ず適用する。議題・決定事項・タスク・期限は保持する。
9. 【可読性（壁にしない）】各「・」項目の間に空行を1行入れる。1項目は要点を先頭に置き、長くなる場合は文単位で改行するか、全角スペース＋「- 」で字下げしたサブ項目に分割し、長大な一塊にしない。1文を不必要に長くせず、適宜「。」で区切る。列挙は必ず縦に並べる。
【端的な要約】
・会議の要点を3〜5行程度で簡潔に（最重要の決定事項・次に取るべきアクションを中心に）

【議事録】

■ 会議の概要
・2〜3行で会議の目的と主要議題

■ [論点1のタイトル]
・詳細な内容
・出た意見・議論

■ [論点2のタイトル]
・...

■ 決定事項
・...

■ ネクストアクション
・...

■ 未決事項・宿題
・...

【各チャンクの要約】
`;

// 禁止ルール（念のため二重適用）
const FORBIDDEN_RULES = "\n\n【絶対禁止】以下は一切出力しないこと：音声認識の精度が〜、断片的な情報から〜、再録音をお願いします、把握が困難、推定します、※で始まる注釈、**で囲まれた注意書き、議事録以外の説明文やコメント、スタッフ名・患者名などの個人の実名（人名は出力せず「受付担当」「院長」「看護師」等の役割・一般名詞に置き換える。氏名・カルテ番号・連絡先など個人を特定し得る情報も出さない）";

/**
 * 同時実行数を制限した並列処理（セマフォ方式）
 * @param {Array} items - 処理対象の配列
 * @param {Function} worker - async (item, index) => result
 * @param {number} concurrency - 同時実行数
 * @returns {Array} Promise.allSettled と同じ形式の結果
 */
async function parallelWithLimit(items, worker, concurrency = 3) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runNext() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        const value = await worker(items[idx], idx);
        results[idx] = { status: "fulfilled", value };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(runners);
  return results;
}

// Gemini 単一モデル呼び出し
async function callGeminiSingle(geminiModel, text, prompt, maxOutputTokens) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 未設定");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt + "\n\n" + text }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens },
    }),
  });
  if (!res.ok) throw new Error(`${geminiModel}: HTTP ${res.status}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const summary = parts.filter(p => !p.thought).map(p => p.text || "").join("");
  const finishReason = data.candidates?.[0]?.finishReason || "";
  try {
    await logUsage({
      route: "/api/minutes-summarize",
      model: geminiModel,
      context: "minutes",
      input_tokens: data.usageMetadata?.promptTokenCount || 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      request_meta: { char_length: text.length },
    });
  } catch (e) { console.error("[logUsage] minutes-gemini:", e); }
  if (!summary.trim()) throw new Error(`${geminiModel}: empty response`);
  return { summary, model: geminiModel, finishReason };
}

// Gemini フォールバック呼び出し（モデルリストを順に試行）
async function callGeminiList(models, text, prompt, maxOutputTokens = 8192) {
  let lastError = null;
  for (const m of models) {
    try {
      return await callGeminiSingle(m, text, prompt, maxOutputTokens);
    } catch (e) {
      lastError = e.message;
    }
  }
  throw new Error("Gemini全モデル失敗: " + lastError);
}
// 既存互換: flash → 2.5 pro フォールバック（呼び出し元が変わるまで維持）
async function callGeminiFallback(text, prompt, maxOutputTokens = 8192) {
  return await callGeminiList(GEMINI_MODELS, text, prompt, maxOutputTokens);
}

// Claude 呼び出し
async function callClaude(text, prompt, maxTokens = 8192) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error("CLAUDE_API_KEY 未設定");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: Math.min(maxTokens, 8192),
      temperature: 0.3,
      system: prompt,
      messages: [{ role: "user", content: text }],
    }),
  });
  const data = await res.json();
  if (data.content?.[0]?.text) {
    try {
      await logUsage({
        route: "/api/minutes-summarize",
        model: data.model || "claude-sonnet-4-6",
        context: "minutes",
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
        request_meta: { char_length: text.length },
      });
    } catch (e) { console.error("[logUsage] minutes-claude:", e); }
    return {
      summary: data.content[0].text,
      model: "claude-sonnet-4-6",
      finishReason: data.stop_reason === "end_turn" ? "STOP" : (data.stop_reason || ""),
    };
  }
  throw new Error("Claude応答エラー: " + JSON.stringify(data));
}

// 統一的モデル呼び出し（model パラメータで使い分け）
async function callModel(model, text, prompt, maxOutputTokens) {
  if (model === "claude") {
    return await callClaude(text, prompt, maxOutputTokens);
  }
  if (model === "gemini-pro") {
    return await callGeminiList(["gemini-2.5-pro", "gemini-3.5-flash", "gemini-2.5-flash"], text, prompt, maxOutputTokens);
  }
  if (model === "gemini-3-pro") {
    return await callGeminiList(["gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-2.5-pro", "gemini-3.5-flash", "gemini-2.5-flash"], text, prompt, maxOutputTokens);
  }
  if (model === "gemini-3-5-flash") {
    return await callGeminiList(["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"], text, prompt, maxOutputTokens);
  }
  if (model === "gemini-3-6-flash") {
    return await callGeminiList(GEMINI_MODELS, text, prompt, maxOutputTokens);
  }
  // デフォルト（gemini-flash 等の既存互換キー含む）: 3.6 Flash 優先（2026-07-21 GA）
  return await callGeminiList(GEMINI_MODELS, text, prompt, maxOutputTokens);
}

// チャンク要約（既存プロンプト維持）
async function summarizeChunk(chunk, i, total, model) {
  const chunkPromptText = CHUNK_PROMPT + FORBIDDEN_RULES + `\n\n（これは全${total}部のうち第${i + 1}部です）\n`;
  const result = await callModel(model, chunk, chunkPromptText, 8192);
  return result.summary;
}

// 対策3: 中間統合（グループ単位）
async function midIntegrate(groupSummaries, groupIndex, totalGroups, model) {
  const prompt = `以下は、長時間会議の書き起こしをチャンク分割して要約した結果の一部（グループ${groupIndex + 1}/${totalGroups}）です。
この複数チャンクの要約を統合し、**このグループで議論された論点を網羅的にまとめた中間要約**を作成してください。

【ルール】
1. 各チャンクの論点・具体例・数字・固有名詞はすべて保持してください。
2. 重複する論点は統合してください。
3. この段階では結論や全体のまとめは不要です。論点を整理することに集中してください。
4. 前置き・注釈は書かないこと。
5. Markdown記号（#, ##, ###, **, *）は使わず、見出しは「■」、箇条書きは「・」で整形すること。
`;
  const input = `【チャンク要約群】\n${groupSummaries.join("\n\n---\n\n")}`;
  const result = await callModel(model, input, prompt, 16384);
  return result.summary;
}

// 最終統合
async function finalIntegrate(finalInput, model, additionalInstruction) {
  const userPrefix = additionalInstruction ? additionalInstruction + "\n\n" : "";
  const finalPromptText = userPrefix + FINAL_PROMPT + FORBIDDEN_RULES;
  return await callModel(model, finalInput, finalPromptText, 32768);
}

export async function POST(request) {
  const startTime = Date.now();
  try {
    const { text, prompt, model: reqModel } = await request.json();
    const model = reqModel || "gemini-3-6-flash"; // デフォルトは Gemini 3.6 Flash（2026-07-21 GA）
    if (!text || !text.trim()) {
      return Response.json({ error: "テキストが必要です" }, { status: 400 });
    }

    // 短いテキストはそのまま詳細プロンプトで処理
    if (text.length <= CHUNK_SIZE) {
      const userPrefix = prompt ? prompt + "\n\n" : "";
      const singlePrompt = userPrefix + FINAL_PROMPT.replace("【各チャンクの要約】", "【書き起こし】") + FORBIDDEN_RULES;
      const result = await callModel(model, text, singlePrompt, 32768);
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
        chunkSummaries: [result.summary],
        midIntegrated: false,
        chunkCount: 1,
        failedChunkCount: 0,
        finalIntegrationFailed: false,
      });
    }

    // 長いテキストはチャンク分割
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    // 対策2: チャンク要約の並列化（同時3）
    const chunkStart = Date.now();
    console.log(`[minutes-summarize] starting parallel chunk processing: ${chunks.length} chunks, concurrency=3, model=${model}`);

    const chunkResults = await parallelWithLimit(chunks, async (chunk, i) => {
      const t0 = Date.now();
      const summary = await summarizeChunk(chunk, i, chunks.length, model);
      console.log(`[minutes-summarize] chunk ${i + 1}/${chunks.length} done: input=${chunk.length}chars, output=${summary.length}chars, elapsed=${Date.now() - t0}ms`);
      return summary;
    }, 3);

    // 失敗チャンクはプレースホルダで埋める
    const chunkSummaries = chunkResults.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      console.error(`[minutes-summarize] chunk ${i + 1} FAILED:`, r.reason?.message || r.reason);
      return `\n\n■ ⚠️ チャンク${i + 1}の要約に失敗しました\n（このチャンクの書き起こしは全体には含まれていますが、要約生成中にエラーが発生しました）\n\n`;
    });

    const failedCount = chunkResults.filter(r => r.status === "rejected").length;
    console.log(`[minutes-summarize] all chunks done: ${chunks.length - failedCount}/${chunks.length} succeeded, total elapsed=${Date.now() - chunkStart}ms`);

    // 対策3: 中間統合層（Pro/Claude使用時 かつ チャンク数 >= 6 のみ）
    const needsMidIntegration = chunkSummaries.length >= 6 && (model === "gemini-pro" || model === "claude");
    let finalInput;
    if (needsMidIntegration) {
      const groupSize = Math.ceil(chunkSummaries.length / 3);
      const groups = [];
      for (let i = 0; i < chunkSummaries.length; i += groupSize) {
        groups.push(chunkSummaries.slice(i, i + groupSize));
      }
      console.log(`[minutes-summarize] mid-integration: ${chunkSummaries.length} chunks → ${groups.length} groups`);
      const midStart = Date.now();

      // 各グループを中間統合（並列・同時2）
      const midResults = await parallelWithLimit(groups, async (group, gi) => {
        const t0 = Date.now();
        const midSummary = await midIntegrate(group, gi, groups.length, model);
        console.log(`[minutes-summarize] mid-group ${gi + 1}/${groups.length} done: input_chunks=${group.length}, output=${midSummary.length}chars, elapsed=${Date.now() - t0}ms`);
        return midSummary;
      }, 2);

      const midSummaries = midResults.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        console.error(`[minutes-summarize] mid-group ${i + 1} FAILED:`, r.reason?.message || r.reason);
        // 中間統合失敗時はそのグループの元チャンク要約を連結してフォールバック
        return groups[i].join("\n\n");
      });

      console.log(`[minutes-summarize] mid-integration done: total elapsed=${Date.now() - midStart}ms`);
      finalInput = midSummaries.join("\n\n---\n\n");
    } else {
      finalInput = chunkSummaries.join("\n\n---\n\n");
    }

    // 対策4: 最終統合（エラー時はチャンク要約連結にフォールバック）
    let finalSummary;
    let finalModelName = model;
    let finishReason = "STOP";
    let finalIntegrationFailed = false;
    let finalIntegrationError = null;

    try {
      const finalResult = await finalIntegrate(finalInput, model, prompt);
      finalSummary = finalResult.summary;
      finalModelName = finalResult.model;
      finishReason = finalResult.finishReason;
      console.log(`[minutes-summarize] final integration done: input=${finalInput.length}chars, output=${finalSummary.length}chars, finishReason=${finishReason}, totalElapsed=${Date.now() - startTime}ms`);
      if (finishReason !== "STOP") {
        console.warn(`[minutes-summarize] ⚠️ finishReason=${finishReason} - 最終統合の出力が途中で打ち切られた可能性あり`);
      }
    } catch (err) {
      console.error(`[minutes-summarize] final integration FAILED:`, err?.message || err);
      finalIntegrationFailed = true;
      finalIntegrationError = err?.message || String(err);
      // フォールバック: チャンク要約を連結した暫定版
      finalSummary = `■ ⚠️ 最終統合でエラーが発生しました\n\n最終的な統合処理に失敗したため、各チャンクの要約をそのまま連結したものを表示しています。\nGemini 2.5 Pro や Claude Sonnet 4.6 に切り替えて再生成するか、書き起こしのみ保存してください。\n\nエラー: ${finalIntegrationError}\n\n--------\n\n${chunkSummaries.join("\n\n--------\n\n")}`;
    }

    const truncated = finalIntegrationFailed || (finishReason !== "STOP");

    return Response.json({
      summary: finalSummary,
      model: finalModelName,
      chunks: chunks.length,
      truncated: !!truncated,
      finishReason: finalIntegrationFailed ? "ERROR" : finishReason,
      chunkSummaries,
      midIntegrated: needsMidIntegration,
      chunkCount: chunks.length,
      failedChunkCount: failedCount,
      finalIntegrationFailed,
      finalIntegrationError,
    });

  } catch (e) {
    console.error("minutes-summarize error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
