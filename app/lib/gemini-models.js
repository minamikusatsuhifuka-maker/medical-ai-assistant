// 要約・校正・生成系ルートで共通利用するGeminiモデルのフォールバック順。
// 2026-08: gemini-3.7-flash を第一候補に更新（2026-07は3.6-flash）。
// 旧 gemini-2.0-flash は無効化されたため使用しない。
// ※二重管理を避けるため、モデル変更はこの1ファイルのみで行う。
export const GEMINI_MODELS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];

// 定期チェック（gemini-model-check）の照合対象。このアプリが要約系で実際に呼ぶ「安定版」モデル。
// 廃番検知は ListModels の結果とこのリストを照合する。
// 注意: ListModels は新モデルの掲載が実提供より遅れることがある（2026-07の3.6-flash/3.5-flash-liteで実測。
// generateContent は200で成功するのに一覧に未掲載）。そのため一覧に無いだけでは廃番と断定せず、
// gemini-model-check 側で実呼び出しプローブによる最終確認を行う。
// 廃番疑いが出たら、人が判断してこのファイルのモデル名を更新する（1ファイルで全ルートに反映）。
// ※3.5-flash-lite は診察Lite撤去（複数疾患SOAP分離不可）に伴い監視対象から除外（使わないモデルの監視は不要）。
// ※2.5-pro は GEMINI_MODELS から外したが、選好「gemini-pro」で今も呼ぶため監視対象には残す。
export const ACTIVE_MODELS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"];
// 一部ルートが選好「gemini-3-pro」で使うプレビュー版。提供が流動的なので廃番警告は控えめに扱う（参考情報）。
export const PREVIEW_MODELS = ["gemini-3.1-pro-preview", "gemini-3-pro-preview"];

// ---- thinkingLevel の分岐（モデル世代ごとにサポート値が違う） ----
// 実測（2026-08-14・本番APIキー）:
//   gemini-3.7-flash + thinkingLevel:"minimal" → HTTP 400 INVALID_ARGUMENT
//     "Thinking level MINIMAL is not supported for this model."
//   gemini-3.7-flash + "low" / "high" → 200（"medium" が既定）
//   gemini-3.6-flash + "minimal" → 200（従来どおり）
// そのため「gemini-3で始まれば minimal」という一律判定は 3.7 で全滅する。
// 3.7 以降は minimal 非対応 → 最も軽い "low" を使う。
const MINIMAL_UNSUPPORTED_MINOR = 7;

// 指定モデルに付けるべき thinkingLevel を返す。付けるべきでなければ null。
// - gemini-3.7 以降 → "low"（minimal は 400）
// - それ以外の gemini-3.x（3.6 / 3.5 / 3.1-pro 等） → "minimal"
// - gemini-2.5 系以前 → null（thinkingLevel 非対応なので付けない）
export function thinkingLevelFor(model) {
  if (!model || !model.startsWith("gemini-3")) return null;
  const m = model.match(/^gemini-3\.(\d+)/);
  const minor = m ? Number(m[1]) : 0; // "gemini-3-pro-preview" 等は 0 扱い（= minimal）
  return minor >= MINIMAL_UNSUPPORTED_MINOR ? "low" : "minimal";
}

// generationConfig にモデル相応の thinkingConfig を付与して返す（破壊的変更・戻り値も同じ参照）。
// 要約・抽出は「整形タスク」で深い推論が不要なため、どの世代でも思考は最小に寄せる。
export function applyThinking(genConfig, model) {
  const level = thinkingLevelFor(model);
  if (level) genConfig.thinkingConfig = { thinkingLevel: level };
  return genConfig;
}

// 指定モデルへ generateContent を投げ、フォールバックしながら最初に成功したレスポンスを返す。
// 全滅時は throw（呼び出し元でエラーをUIに表面化する）。
// 返り値: { data, model } / 例外: Error(message に各モデルのHTTPステータスと本文断片)
export async function callGeminiWithFallback(apiKey, requestBody, logLabel = "gemini") {
  let lastErr = "";
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
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
