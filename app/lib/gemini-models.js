// 校正系ルート（fix-typos / scan-noise）で共通利用するGeminiモデルのフォールバック順。
// transcript-clean と同じ並び。旧 gemini-2.0-flash は無効化されたため使用しない。
// ※二重管理を避けるため、校正系のモデル変更はこの1ファイルのみで行う。
export const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"];

// 定期チェック（gemini-model-check）の照合対象。このアプリが要約系で実際に呼ぶ「安定版」モデル。
// 廃番検知は ListModels の結果とこのリストを照合する（GEMINI_MODELS と同一の安定3モデル）。
// 廃番疑いが出たら、人が判断してこのファイルのモデル名を更新する（1ファイルで全ルートに反映）。
export const ACTIVE_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"];
// 一部ルートが選好「gemini-3-pro」で使うプレビュー版。提供が流動的なので廃番警告は控えめに扱う（参考情報）。
export const PREVIEW_MODELS = ["gemini-3.1-pro-preview", "gemini-3-pro-preview"];

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
