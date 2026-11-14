// 料金マスタ（USD per 1M tokens。2026年5月作成・2026-11-14 に 3.6〜3.8 と 4 Hydrogen を追加）

export const USD_JPY = Number(process.env.USD_JPY_RATE) || 155;

export const PRICING = {
  // Gemini 2.5 Pro
  "gemini-2.5-pro":            { input: 1.25, output: 10.00, family: "gemini-pro" },
  // Gemini 2.5 Flash（過去ログ集計のために維持）
  "gemini-2.5-flash":          { input: 0.30, output: 2.50,  family: "gemini-flash" },
  "gemini-2.0-flash":          { input: 0.30, output: 2.50,  family: "gemini-flash" },
  // Gemini 3.5 Flash（2026年5月19日 I/O 2026 で GA）
  "gemini-3.5-flash":          { input: 1.50, output: 9.00,  family: "gemini-3-5-flash" },
  "gemini-3-5-flash":          { input: 1.50, output: 9.00,  family: "gemini-3-5-flash" },
  "3.5-flash-05-2026":         { input: 1.50, output: 9.00,  family: "gemini-3-5-flash" },
  "gemini-3.5-flash-preview":  { input: 1.50, output: 9.00,  family: "gemini-3-5-flash" },
  // Gemini 3.6 / 3.7 / 3.8 Flash（2026-11-14 追加。それまで行が無く、FALLBACK（1.25 / 10.00）で数えていた）
  //   公式 pricing: 入力 $0.75 / 出力 $3.75（思考込み）。3.7 を指定すると実体は 3.8（Google 側の別名）
  "gemini-3.8-flash":          { input: 0.75, output: 3.75,  family: "gemini-3-8-flash" },
  "gemini-3.7-flash":          { input: 0.75, output: 3.75,  family: "gemini-3-8-flash" },
  "gemini-3.6-flash":          { input: 0.75, output: 3.75,  family: "gemini-3-6-flash" },
  // Gemini 4 Hydrogen（2026-11-14 追加・院長の指示）: 入力 $1.50 / 出力 $7.50（思考トークンも出力として課金）/ キャッシュ読み取り $0.075
  "gemini-4-hydrogen":         { input: 1.50, output: 7.50,  cache_read: 0.075, family: "gemini-4-hydrogen" },
  // Gemini 3.1 Pro 系
  "gemini-3.1-pro-preview":    { input: 2.00, output: 12.00, family: "gemini-3-pro" },
  "gemini-3-pro-preview":      { input: 2.00, output: 12.00, family: "gemini-3-pro" },
  // Claude
  "claude-sonnet-4-6":         { input: 3.00, output: 15.00, family: "claude" },
  "claude-sonnet-4-6-20250514":{ input: 3.00, output: 15.00, family: "claude" },
  // OpenAI Whisper（書き起こし、秒数ベース）
  "whisper-1":                 { input: 0,    output: 0,     family: "whisper", per_minute_usd: 0.006 },
};

const FALLBACK = { input: 1.25, output: 10.00, family: "unknown" };

// Whisper per-minute 課金（$0.006/分、2026年5月時点）
const WHISPER_PER_MINUTE_USD = 0.006;

export function calcWhisperCost(durationSeconds) {
  const sec = Math.max(0, Number(durationSeconds) || 0);
  const minutes = sec / 60;
  const cost_usd = minutes * WHISPER_PER_MINUTE_USD;
  const cost_jpy = Math.round(cost_usd * USD_JPY * 100) / 100;
  return { cost_usd, cost_jpy, family: "whisper", model_resolved: "whisper-1" };
}

// outputTokens は思考トークンを含めた数を渡す（gemini-models.js の geminiOutputTokens）。
// cachedTokens は inputTokens のうちキャッシュから読んだ分（usageMetadata.cachedContentTokenCount）。
// cache_read の単価がある行だけ安く数え、無い行は入力と同じ単価で数える（多めに出る側に倒す）。
export function calcCost(model, inputTokens = 0, outputTokens = 0, cachedTokens = 0) {
  let p = PRICING[model];
  let resolved = model;
  if (!p) {
    const key = Object.keys(PRICING).find(k => model && model.startsWith(k));
    if (key) { p = PRICING[key]; resolved = key; }
    else { p = FALLBACK; resolved = (model || "unknown") + " (fallback)"; }
  }
  const cached = p.cache_read != null ? Math.min(Math.max(0, Number(cachedTokens) || 0), inputTokens) : 0;
  const cost_usd = ((inputTokens - cached) * p.input + cached * (p.cache_read || 0) + outputTokens * p.output) / 1_000_000;
  const cost_jpy = Math.round(cost_usd * USD_JPY * 100) / 100;
  return { cost_usd, cost_jpy, family: p.family, model_resolved: resolved };
}
