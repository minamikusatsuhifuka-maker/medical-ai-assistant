// 要約・校正・生成系ルートで共通利用するGeminiモデルのフォールバック順。
// 2026-11-14: gemini-4-hydrogen を先頭に（院長の指示・gemini-4-migration）。thinkingLevel は必ず明示（下の GEMINI_THINKING）。
//   実測と料金は docs/gemini-4-hydrogen-2026-11-14.md。戻すときはこの配列の先頭を外すだけ（3.8 が先頭に戻る）。
// 2026-11-02: gemini-3.8-flash を先頭に（2026-08〜は3.7、2026-07は3.6）。
//   実測で gemini-3.7-flash を指定しても応答は gemini-3.8-flash（Google 側の別名）。3.8→3.7 は同じモデルへの切り替えで、
//   フォールバックとして別のモデルになるのは 3.6 から。3.7 は残すが「3.7 に落ちれば安全」とは考えない。
// 旧 gemini-2.0-flash は無効化されたため使用しない。
// ※二重管理を避けるため、モデル変更はこの1ファイルのみで行う。画面の表示名は app/lib/model-labels.js がここから作る。
export const GEMINI_MODELS = ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];

// 検証用: 開発時だけ、環境変数 GEMINI_TEST_FAIL_MODELS（カンマ区切り）に書いたモデルをわざと失敗させる。
// 3.8・3.7 を両方失敗させて 3.6 に届くかを確かめるため。NODE_ENV=production では常に false（本番では効かない）。
// 旧名 MINUTES_TEST_FAIL_MODELS も受ける。
export function geminiTestFail(model) {
  if (process.env.NODE_ENV === "production") return false;
  const list = String(process.env.GEMINI_TEST_FAIL_MODELS || process.env.MINUTES_TEST_FAIL_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(model);
}

// 定期チェック（gemini-model-check）の照合対象。このアプリが要約系で実際に呼ぶ「安定版」モデル。
// 廃番検知は ListModels の結果とこのリストを照合する。
// 注意: ListModels は新モデルの掲載が実提供より遅れることがある（2026-07の3.6-flash/3.5-flash-liteで実測。
// generateContent は200で成功するのに一覧に未掲載）。そのため一覧に無いだけでは廃番と断定せず、
// gemini-model-check 側で実呼び出しプローブによる最終確認を行う。
// 廃番疑いが出たら、人が判断してこのファイルのモデル名を更新する（1ファイルで全ルートに反映）。
// ※3.5-flash-lite は診察Lite撤去（複数疾患SOAP分離不可）に伴い監視対象から除外（使わないモデルの監視は不要）。
// ※2.5-pro は GEMINI_MODELS から外したが、選好「gemini-pro」で今も呼ぶため監視対象には残す。
export const ACTIVE_MODELS = ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"];
// 一部ルートが選好「gemini-3-pro」で使うプレビュー版。提供が流動的なので廃番警告は控えめに扱う（参考情報）。
export const PREVIEW_MODELS = ["gemini-3.1-pro-preview", "gemini-3-pro-preview"];

// 診察要約だけは「速さの安定」を最優先するため、当面 3.6 を先頭にする（2026-11-14 の Hydrogen 移行でも変えない＝院長の指示。
//   疾患見出しの比較結果を見るまで 3.6 のまま。Hydrogen(Low) は最初の文字まで中央値 7.8 秒・3.6 は 1.3 秒）（他ルートは GEMINI_MODELS＝3.7 先頭）。
// 2026-08-14 本番URL経由の実測（診察SOAP・ストリーミング・各8回）:
//   3.7: TTFT 中央値 5855ms / 8回中6回が3秒超 / 最大 8345ms、完了 中央値 6419ms
//   3.6: TTFT 中央値 1109ms / 3秒超 0回      / 最大 1533ms、完了 中央値 2432ms
// 出力品質は 3.7 の方がやや良いが、要約は診療の律速なので待ち時間のブレを優先して回避する。
// 3.7 の応答が安定したら、この定数を GEMINI_MODELS に戻すだけで切り替わる（院長判断待ち）。
export const EXAM_SUMMARY_MODELS = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-2.5-flash"];

// 議事録の要約だけは Gemini 3.8 Flash に固定（2026-11-02 指示書 minutes-model-3-8-only）。画面の選択肢は無くした。
// 自動フォールバックは 3.8 → 3.7 → 3.6 の順で残し、その後ろに従来の 3.5 → 2.5 を付けて全滅を避ける。
// 実測（2026-11-02・本番APIキー）: gemini-3.8-flash は 200（thinkingLevel low は可・minimal は 400）。
//   なお gemini-3.7-flash を指定しても応答の modelVersion は gemini-3.8-flash だった（Google 側で 3.7 が 3.8 を指している）。
// 2026-11-02 の §1 で共通の順番（GEMINI_MODELS）も 3.8 先頭になったので、同じものを指す（2026-11-14 から Hydrogen 先頭）
export const MINUTES_SUMMARY_MODELS = GEMINI_MODELS;

// ---- thinkingLevel の分岐（モデル世代ごとにサポート値が違う） ----
// 実測（2026-08-14・本番APIキー）:
//   gemini-3.7-flash + thinkingLevel:"minimal" → HTTP 400 INVALID_ARGUMENT
//     "Thinking level MINIMAL is not supported for this model."
//   gemini-3.7-flash + "low" / "high" → 200（"medium" が既定）
//   gemini-3.6-flash + "minimal" → 200（従来どおり）
// そのため「gemini-3で始まれば minimal」という一律判定は 3.7 で全滅する。
// 3.7 以降は minimal 非対応 → 最も軽い "low" を使う。
// 実測（2026-11-14・本番APIキー）: gemini-4-hydrogen は low / medium / high（既定）/ xhigh。minimal は 400。
//   指定しないと既定の high になり、思考トークン（出力として課金）が low の約3倍。
//   → Hydrogen はどの経路でも必ず明示する（未指定にしない）。
const MINIMAL_UNSUPPORTED_MINOR = 7;

// 作業ごとの思考の強さ（2026-11-14 院長の指示: 既定の High のままにしない）。
// 要約・書き起こし補正・誤字直し・抽出・生成は low。深い推論が要る処理は今のところ無い。
// minutes（議事録の要約）だけ medium。low と比べて見出し・項目が多く拾え（決定事項以降 12→15 項目）、
//   時間は約 19 秒→約 30 秒、1 回の金額は約 $0.029→約 $0.040（docs/gemini-4-hydrogen-2026-11-14.md）。
//   会議のあとに使う画面なので待ち時間より網羅を取った。
export const GEMINI_THINKING = {
  default: "low",
  minutes: "medium",
};

// 指定モデルに付けるべき thinkingLevel を返す。付けるべきでなければ null。
// level は作業ごとの強さ（"low" / "medium" / "high"）。
// - gemini-4 系（Hydrogen）→ level そのまま（minimal は 400 なので low に読み替える）
// - gemini-3.7 以降 → level（minimal は 400 なので low に読み替える）
// - それ以外の gemini-3.x（3.6 / 3.5 / 3.1-pro 等） → low は "minimal"（従来どおり）、それ以外は level
// - gemini-2.5 系以前 → null（thinkingLevel 非対応なので付けない）
export function thinkingLevelFor(model, level = GEMINI_THINKING.default) {
  if (!model) return null;
  const lv = level || GEMINI_THINKING.default;
  if (/^gemini-4/.test(model)) return lv === "minimal" ? "low" : lv;
  if (!model.startsWith("gemini-3")) return null;
  const m = model.match(/^gemini-3\.(\d+)/);
  const minor = m ? Number(m[1]) : 0; // "gemini-3-pro-preview" 等は 0 扱い（= minimal）
  if (minor >= MINIMAL_UNSUPPORTED_MINOR) return lv === "minimal" ? "low" : lv;
  return lv === "low" ? "minimal" : lv;
}

// generationConfig にモデル相応の thinkingConfig を付与して返す（破壊的変更・戻り値も同じ参照）。
// 要約・抽出は「整形タスク」で深い推論が不要なため、どの世代でも思考は最小に寄せる。
export function applyThinking(genConfig, model, level = GEMINI_THINKING.default) {
  const lv = thinkingLevelFor(model, level);
  if (lv) genConfig.thinkingConfig = { thinkingLevel: lv };
  return genConfig;
}

// 利用ログの出力トークン数。思考トークン（thoughtsTokenCount）も出力として課金されるので足す。
// 2026-11-14 まで candidatesTokenCount だけを記録していた（思考の分の金額が抜けていた）。
export function geminiOutputTokens(usageMetadata) {
  const u = usageMetadata || {};
  return (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
}

// 指定モデルへ generateContent を投げ、フォールバックしながら最初に成功したレスポンスを返す。
// 全滅時は throw（呼び出し元でエラーをUIに表面化する）。
// 返り値: { data, model } / 例外: Error(message に各モデルのHTTPステータスと本文断片)
export async function callGeminiWithFallback(apiKey, requestBody, logLabel = "gemini", { thinking = GEMINI_THINKING.default } = {}) {
  let lastErr = "";
  // 呼び出し元は JSON 文字列を渡す。モデルごとに thinkingLevel を付けるため一度ほどく。
  // 呼び出し元が thinkingConfig を自分で書いていればそれを尊重する。
  const base = typeof requestBody === "string" ? JSON.parse(requestBody) : requestBody;
  for (const model of GEMINI_MODELS) {
    if (geminiTestFail(model)) { lastErr = `${model}: 検証のため失敗させた`; console.error(`[${logLabel}] Gemini error:`, lastErr); continue; }
    const genConfig = { ...(base.generationConfig || {}) };
    if (!genConfig.thinkingConfig) applyThinking(genConfig, model, thinking);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, generationConfig: genConfig }),
    });
    if (res.ok) {
      const data = await res.json();
      return { data, model };
    }
    // Googleのエラー本文にAPIキーは含まれない（キーはURLクエリのみ）。本文先頭のみ保持。
    const body = await res.text().catch(() => "");
    lastErr = `${model}: HTTP ${res.status} ${body.slice(0, 300)}`;
    console.error(`[${logLabel}] Gemini error:`, lastErr);
  }
  throw new Error(lastErr || "全モデルでGemini呼び出しに失敗");
}

// テキストpartの取り出し（thinking partを除外して結合）。
export function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.filter(p => !p.thought).map(p => p.text || "").join("");
}
