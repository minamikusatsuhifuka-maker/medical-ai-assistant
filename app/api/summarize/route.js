import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";
import { GEMINI_MODELS, EXAM_SUMMARY_MODELS, EXAM_MODEL_CHAINS, EXAM_MODEL_SETTING_KEY, EXAM_DEFAULT_CHOICE, EXAM_COMPARE_MODELS, EXACT_PREFIX, isExamChoice, applyThinking, geminiTestFail, geminiOutputTokens } from "../../lib/gemini-models";

// Vercel関数タイムアウト延長（並列分析の60s超応答に対応・504解消）
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const DEFAULT_PROMPT = `あなたは皮膚科専門の優秀な医療秘書です。以下の音声書き起こしテキストをカルテ形式で要約してください。

【絶対禁止】以下の文言は一切出力してはならない：
- 「音声認識の精度が〜」
- 「断片的な情報から〜」
- 「再録音をお願いします」
- 「把握が困難」
- 「推定します」
- 「※」で始まる注釈
- 「**」で囲まれた注意書き
- カルテ要約以外の説明文・コメント・お願い文

【要約ルール】
- 聞き取れた内容のみでSOAP形式のカルテを作成する
- 不明な部分は省略し、わかる範囲で簡潔にまとめる
- 「変わらず」→症状変化なし、「光を当てる」→光線療法、「塗るやつ」→外用薬として補完
- 出力はカルテのみ。余計な言葉は一切不要`;

// Gemini ストリーミング（SSE）
async function tryGeminiStream(apiKey, text, prompt, modelList, encoder, controller, logInfo = {}) {
  const primary = modelList[0];
  // 切り替わり・空応答・途中で切れた回を数えるための記録（exam-to-hydrogen §5）。利用ログの request_meta に残す
  const attempts = [];
  const meta = (extra = {}) => ({
    char_length: text.length, model_preference: logInfo.model_preference || null, exam_choice: logInfo.exam_choice || null,
    exam_choice_source: logInfo.exam_choice_source || null, stream: true, primary, attempts, ...extra,
  });
  for (const model of modelList) {
    try {
      // 検証用: 開発時だけ、指定したモデルをわざと失敗させて切り替わりを確かめる（本番では効かない）
      if (geminiTestFail(model)) { attempts.push({ model, fail: "test-fail" }); continue; }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
      // Gemini 3.x は思考が既定ONで、ストリーミングでは思考完了まで出力が始まらず要約が遅くなる。
      // 要約は抽出・整形タスクで深い推論は不要のため思考を最小化する。
      // 付与値のモデル別分岐（3.7以降は minimal が400・2.5系は非対応・Hydrogen は既定 High なので必ず low）は gemini-models.js に集約。
      const genConfig = applyThinking({ temperature: 0.3, maxOutputTokens: 8192 }, model);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt }] },
          contents: [{ parts: [{ text }] }],
          generationConfig: genConfig,
        }),
      });
      if (!res.ok) { attempts.push({ model, fail: `HTTP ${res.status}` }); continue; }

      const reader = res.body.getReader();
      let buffer = "";
      let totalText = "";
      let used = false;
      let usage = null; // 最後のチャンクの usageMetadata（思考の分を含めて利用ログに残す）
      let finishReason = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += new TextDecoder().decode(value);
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            if (json.usageMetadata) usage = json.usageMetadata;
            if (json.candidates?.[0]?.finishReason) finishReason = json.candidates[0].finishReason;
            const parts = json.candidates?.[0]?.content?.parts || [];
            const chunk = parts.filter(p => !p.thought).map(p => p.text || "").join("");
            if (chunk) {
              totalText += chunk;
              used = true;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk, model, primary })}\n\n`));
            }
          } catch {}
        }
      }

      if (used && totalText.trim().length > 10) {
        // usage: 比較ボタンが 1 回の金額を画面に出すため（入力・出力＝思考込み・キャッシュ）
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, model, primary, total: totalText, finishReason, usage: { input: usage?.promptTokenCount || 0, output: geminiOutputTokens(usage), cached: usage?.cachedContentTokenCount || 0 } })}\n\n`));
        // 2026-11-14: ストリーミング（診察の要約）は利用ログに残していなかった。月の金額を正しく数えるため記録する。
        // 画面の完了（保存・コピー）を待たせないよう、done を送ったあとに記録する
        try {
          await logUsage({
            route: "/api/summarize", model, context: logInfo.context || "exam-stream",
            input_tokens: usage?.promptTokenCount || 0, output_tokens: geminiOutputTokens(usage), cached_tokens: usage?.cachedContentTokenCount || 0,
            request_meta: meta({ thoughts_tokens: usage?.thoughtsTokenCount || 0, finish_reason: finishReason || null, fallback: model !== primary, truncated: !!finishReason && finishReason !== "STOP" }),
          });
        } catch (e) { console.error("[logUsage] summarize-stream:", e); }
        return true;
      }
      // 本文が空（または短すぎる）＝空応答。思考で上限を使い切った MAX_TOKENS もここに来る
      attempts.push({ model, fail: "empty", finish_reason: finishReason || null, thoughts_tokens: usage?.thoughtsTokenCount || 0, chars: totalText.length });
    } catch (e) { attempts.push({ model, fail: String(e?.message || e).slice(0, 120) }); }
  }
  // 全部だめだった回も残す（success:false）
  try {
    await logUsage({ route: "/api/summarize", model: primary || "unknown", context: logInfo.context || "exam-stream", success: false, error_message: "全モデル失敗", request_meta: meta() });
  } catch (e) { console.error("[logUsage] summarize-stream(fail):", e); }
  return false;
}

// 全端末で共有する「要約AIモデル」（app_settings）を読む（exam-to-hydrogen §1）。
// 要約のたびに読み直す（覚えておかない）。切り替えた直後の要約から必ず効かせるため。
// 1 回の読み込みは 0.1 秒前後で、要約の待ち時間（Hydrogen は最初の文字まで約 8 秒）に比べて小さい。
// 1.5 秒で読めない・値が変なら null＝端末が送った値で動く（fail-open）
async function readSharedExamChoice() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 1500);
    const res = await fetch(`${url}/rest/v1/app_settings?select=value&key=eq.${EXAM_MODEL_SETTING_KEY}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: ctl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const v = rows?.[0]?.value;
    return isExamChoice(v) ? v : null;
  } catch (e) {
    console.error("[summarize] 共有の要約AIモデルを読めない（端末の値で続行）:", e?.message || e);
    return null;
  }
}

// 診察の要約の選好を決める。"gemini"（今までの既定）と exam-* だけが対象。共有の値が読めればそれを優先する
async function resolveExamPreference(model_preference) {
  if (model_preference !== "gemini" && !isExamChoice(model_preference)) return { pref: model_preference, choice: null, source: null };
  const shared = await readSharedExamChoice();
  if (shared) return { pref: shared, choice: shared, source: "shared" };
  // 共有の値が無い（または読めない）: 端末が exam-* を送っていればそれ。今までの既定 "gemini" は Hydrogen（§2・2026-11-15）
  if (isExamChoice(model_preference)) return { pref: model_preference, choice: model_preference, source: "device" };
  return { pref: EXAM_DEFAULT_CHOICE, choice: EXAM_DEFAULT_CHOICE, source: "default" };
}

// Gemini 非ストリーミング（従来のJSON応答）
function buildGeminiModelList(model_preference) {
  // 比較ボタンの列（three-way-compare）: そのモデルだけ。比較用の一覧に無いモデルは受けない
  if (typeof model_preference === "string" && model_preference.startsWith(EXACT_PREFIX)) {
    const m = model_preference.slice(EXACT_PREFIX.length);
    if (EXAM_COMPARE_MODELS.includes(m)) return [m];
  }
  // 診察の要約の 2 択（設定 ▸ 要約AIモデル・exam-to-hydrogen §1）
  if (isExamChoice(model_preference)) return EXAM_MODEL_CHAINS[model_preference];
  // gemini-3-pro: 最新3.1 Pro優先（フォールバックとして3 Pro系→標準Flashリスト）
  if (model_preference === "gemini-3-pro") {
    return ["gemini-3.1-pro-preview", "gemini-3-pro-preview", ...GEMINI_MODELS];
  }
  // gemini-pro: 2.5 Pro優先。2026-08-25 に診察の「🤖 要約AIモデル」からは選べなくしたため、
  // 現在は「要約テストラボ」からのみ届く。将来戻す可能性があるため経路は残置。
  // ※ 2.5系はフォールバック鎖（GEMINI_MODELS / EXAM_SUMMARY_MODELS の末尾）には引き続き残す。
  if (model_preference === "gemini-pro") {
    return ["gemini-2.5-pro", ...GEMINI_MODELS];
  }
  // gemini-3-5-flash: 明示的に Gemini 3.5 Flash を指定（要約テストラボ用・明示指定は不変）
  if (model_preference === "gemini-3-5-flash") {
    return ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"];
  }
  // gemini-3-6-flash: 明示的に 3.6 を指定した場合は 3.7 に繰り上げない（明示指定は不変）
  if (model_preference === "gemini-3-6-flash") {
    return ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];
  }
  // gemini-3-8-flash: 共通の順番（3.8 先頭）。2026-11-02 §3 でカウンセリング分析が送る（診察の既定は下の EXAM_SUMMARY_MODELS のまま）
  // "common" は名前にモデル番号を持たない共通の鍵（画面の内部キー）。先頭が変わっても画面を直さなくてよい
  // claude: Claude の経路は削除した（2026-11-02）。古い画面から届いたら共通の順番で生成する
  if (model_preference === "common" || model_preference === "gemini-3-8-flash" || model_preference === "claude") {
    return GEMINI_MODELS;
  }
  // gemini-3-7-flash: 3.7 を明示指定（診察の既定は下記のとおり 3.6 なので、試すときはこちらを選ぶ）
  if (model_preference === "gemini-3-7-flash") {
    return GEMINI_MODELS;
  }
  // gemini-3-5-flash-lite: Lite は複数疾患の分離に失敗するため撤去（2026-07-24 院長実ケースで確認）。
  // 旧クライアント（キャッシュ済みページ）から届いた場合も標準リストに丸める。
  // デフォルト（gemini）: EXAM_SUMMARY_MODELS。診察要約は診療の律速なので応答時間の安定を優先し、
  // 3.7 のTTFTスパイクが解消するまで 3.6 を先頭に置く（理由と実測値は gemini-models.js を参照）。
  return EXAM_SUMMARY_MODELS;
}

async function callGemini(text, prompt, model_preference) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  const models = buildGeminiModelList(model_preference);
  let lastError = null;
  for (const model of models) {
    try {
      if (geminiTestFail(model)) throw new Error(`${model}: 検証のため失敗させた`); // 開発時だけ（本番では効かない）
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      // Gemini 3.x は思考が既定ONで要約が遅くなる。要約は抽出・整形タスクで深い推論は不要のため最小化。
      // 付与値のモデル別分岐は gemini-models.js に集約。
      const genConfig = applyThinking({ temperature: 0.3, maxOutputTokens: 8192 }, model);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt }] },
          contents: [{ parts: [{ text }] }],
          generationConfig: genConfig,
        }),
      });
      if (!res.ok) {
        lastError = `${model}: HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      console.log("Gemini response:", model, "status:", res.status, "finishReason:", data.candidates?.[0]?.finishReason);
      if (data.candidates?.[0]?.content?.parts) {
        const summary = data.candidates[0].content.parts.map(p => p.text || "").join("");
        if (summary.trim()) {
          if (summary.trim().length < Math.min(text.length * 0.1, 30)) {
            lastError = `${model}: response too short (${summary.length} chars)`;
            continue;
          }
          const um = data.usageMetadata || {};
          return {
            summary, model,
            input_tokens: um.promptTokenCount || 0,
            output_tokens: geminiOutputTokens(um),
          };
        }
        lastError = `${model}: empty response`;
      } else {
        lastError = `${model}: ${JSON.stringify(data?.error || data)}`;
      }
    } catch (e) {
      lastError = `${model}: ${e.message}`;
    }
  }
  throw new Error("Gemini全モデル失敗: " + lastError);
}

export async function POST(request) {
  let _model_preference_for_err = null;
  try {
    const { text, mode, prompt, model_preference, stream: useStream, context: ctx } = await request.json();
    _model_preference_for_err = model_preference;
    if (!text || !text.trim()) {
      return NextResponse.json({ error: "テキストが必要です" }, { status: 400 });
    }
    const finalPrompt = prompt || DEFAULT_PROMPT;
    // 2026-11-02: Claude Sonnet 4.6 は補充しない判断で、要約テストラボの選択肢からも外した。Claude の経路は削除。
    // 古い画面が mode/model_preference に claude を送ってきても、下の Gemini（共通の順番）で生成する

    // Gemini ストリーミング（stream:true の場合のみ）
    if (useStream) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY未設定" }, { status: 500 });

      const exam = await resolveExamPreference(model_preference);
      const modelList = buildGeminiModelList(exam.pref);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const ok = await tryGeminiStream(apiKey, text, finalPrompt, modelList, encoder, controller, { context: ctx, model_preference, exam_choice: exam.choice, exam_choice_source: exam.source });
          if (!ok) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "要約に失敗しました" })}\n\n`));
          }
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Gemini 非ストリーミング（従来の動作）
    const examNs = await resolveExamPreference(model_preference);
    const result = await callGemini(text, finalPrompt, examNs.pref);
    const usage = await logUsage({
      route: "/api/summarize",
      model: result.model,
      context: ctx || model_preference || null,
      input_tokens: result.input_tokens, output_tokens: result.output_tokens,
      request_meta: { char_length: text.length, model_preference },
    });
    return NextResponse.json({ summary: result.summary, model: result.model, usage });
  } catch (e) {
    console.error("Summarize error:", e);
    try { await logUsage({ route: "/api/summarize", model: _model_preference_for_err || "unknown", success: false, error_message: e.message }); } catch {}
    return NextResponse.json({ error: "要約エラー: " + e.message }, { status: 500 });
  }
}
