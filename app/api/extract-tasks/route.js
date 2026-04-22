export const maxDuration = 300;

const TASK_CHUNK_SIZE = 8000;
const TASK_CHUNK_THRESHOLD = 10000;

/**
 * 429/503エラー時に指数バックオフで自動リトライ
 */
async function callWithRetry(fn, maxRetries = 3, baseDelay = 2000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = err?.status || err?.response?.status || err?.statusCode;
      const message = err?.message || String(err);
      const isRateLimit = status === 429 || message.includes("429") || message.includes("rate limit") || message.includes("quota");
      const isServiceUnavailable = status === 503 || message.includes("503") || message.includes("overloaded");
      const isRetryable = isRateLimit || isServiceUnavailable;

      if (!isRetryable || attempt === maxRetries) {
        console.error(`[extract-tasks] retry FAILED (attempt ${attempt + 1}/${maxRetries + 1}): status=${status}, msg=${message}`);
        throw err;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`[extract-tasks] rate limit hit (attempt ${attempt + 1}/${maxRetries + 1}): waiting ${delay}ms before retry`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * 同時並列数を制限した処理
 */
async function parallelWithLimit(items, worker, concurrency) {
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

/**
 * 文字数ベースでテキストを分割（段落境界を優先）
 */
function splitIntoChunks(text, chunkSize) {
  const chunks = [];
  let current = "";
  const paragraphs = text.split(/\n\n+/);

  for (const para of paragraphs) {
    if (current.length + para.length > chunkSize && current.length > 0) {
      chunks.push(current);
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current) chunks.push(current);

  return chunks.flatMap(c => {
    if (c.length <= chunkSize * 1.5) return [c];
    const sub = [];
    for (let i = 0; i < c.length; i += chunkSize) {
      sub.push(c.slice(i, i + chunkSize));
    }
    return sub;
  });
}

/**
 * 簡易的な文字列類似度（Jaccard係数ベース）
 */
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = new Set(a.split(""));
  const setB = new Set(b.split(""));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * タスクの重複除去（タスク内容が80%以上一致するものを統合）
 */
function deduplicateTasks(tasks) {
  const result = [];
  for (const task of tasks) {
    const taskText = (task.title || task.task || task.content || "").trim();
    if (!taskText) continue;

    const isDuplicate = result.some(existing => {
      const existingText = (existing.title || existing.task || existing.content || "").trim();
      return similarity(taskText, existingText) > 0.8;
    });

    if (!isDuplicate) result.push(task);
  }
  return result;
}

/**
 * Gemini API呼び出し（1チャンク分）
 * レート制限・HTTPエラーはcallWithRetry側で判定するため例外を投げる
 */
async function extractTasksFromText(text, chunkLabel = "") {
  const apiKey = process.env.GEMINI_API_KEY;
  const prompt = `以下の皮膚科・美容皮膚科クリニックの議事録${chunkLabel}からタスクを抽出してください。

【判断基準】
- 患者対応・医療安全（urgency:3-4, importance:4, role_level:director/manager）
- スタッフ教育・採用・労務（urgency:2, importance:3-4, role_level:manager/leader）
- 売上・集患・マーケティング（urgency:2-3, importance:3, role_level:manager）
- 設備・機器・オペレーション改善（urgency:2, importance:2-3, role_level:leader/staff）
- 法令遵守・届出・保険請求（urgency:3-4, importance:4, role_level:director/manager）
- 患者満足度・クレーム対応（urgency:3-4, importance:4, role_level:manager/leader）
- 美容メニュー開発・価格設定（urgency:2, importance:2-3, role_level:manager）

JSON配列のみを返してください（説明文不要）：
[{"title":"タスク名","urgency":2,"importance":2,"category":"operations","role_level":"staff"}]

categoryは: operations(運営), medical(医療), hr(人事), finance(経理)
role_levelは: director, manager, leader, staff
urgency/importance: 1=低 2=やや低 3=やや高 4=高

議事録:
${text}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 3000 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`Gemini API HTTP ${res.status}: ${errText.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  let content = parts.filter(p => !p.thought).map(p => p.text || "").join("");

  content = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const si = content.indexOf("[");
  const ei = content.lastIndexOf("]");
  if (si === -1 || ei === -1) {
    console.error("[extract-tasks] no JSON array found:", content.slice(0, 200));
    return [];
  }

  const jsonStr = content.substring(si, ei + 1);
  const parsed = JSON.parse(jsonStr);
  return Array.isArray(parsed) ? parsed : [];
}

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text || !text.trim()) {
      return Response.json({ tasks: [] });
    }

    // 短い議事録は従来通り1リクエストで処理
    if (text.length <= TASK_CHUNK_THRESHOLD) {
      try {
        const tasks = await callWithRetry(() => extractTasksFromText(text));
        return Response.json({ tasks, chunked: false });
      } catch (err) {
        const status = err?.status || 500;
        console.error("[extract-tasks] single request failed:", err?.message);
        if (status === 429) {
          return Response.json({ tasks: [], error: `HTTP 429 (レート制限)` }, { status: 429 });
        }
        return Response.json({ tasks: [], error: err?.message || "unknown error" }, { status: status >= 500 ? 502 : 500 });
      }
    }

    // 長い議事録はチャンク分割
    const chunks = splitIntoChunks(text, TASK_CHUNK_SIZE);
    console.log(`[extract-tasks] chunking: ${text.length}chars → ${chunks.length} chunks`);

    // 各チャンクからタスク抽出（同時2並列）
    const chunkResults = await parallelWithLimit(chunks, async (chunk, i) => {
      const t0 = Date.now();
      const tasks = await callWithRetry(() => extractTasksFromText(chunk, `(全${chunks.length}部中 ${i + 1}部目)`));
      console.log(`[extract-tasks] chunk ${i + 1}/${chunks.length} done: ${tasks.length} tasks, elapsed=${Date.now() - t0}ms`);
      return tasks;
    }, 2);

    // 結果集約
    const allTasks = [];
    const failedChunks = [];
    chunkResults.forEach((r, i) => {
      if (r.status === "fulfilled") {
        allTasks.push(...r.value);
      } else {
        console.error(`[extract-tasks] chunk ${i + 1} FAILED:`, r.reason?.message);
        failedChunks.push(i + 1);
      }
    });

    // 全チャンクが失敗した場合は429相当で返す
    if (failedChunks.length === chunks.length) {
      return Response.json({
        tasks: [],
        chunked: true,
        chunkCount: chunks.length,
        failedChunkCount: failedChunks.length,
        error: "全チャンクの抽出に失敗しました（レート制限の可能性）",
      }, { status: 429 });
    }

    const uniqueTasks = deduplicateTasks(allTasks);
    console.log(`[extract-tasks] total: ${allTasks.length} raw → ${uniqueTasks.length} after dedup, failed chunks: ${failedChunks.length}`);

    return Response.json({
      tasks: uniqueTasks,
      chunked: true,
      chunkCount: chunks.length,
      failedChunkCount: failedChunks.length,
    });
  } catch (e) {
    console.error("[extract-tasks] error:", e);
    return Response.json({ tasks: [], error: e.message }, { status: 500 });
  }
}
