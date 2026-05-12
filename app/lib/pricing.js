// 料金マスタ（2026年5月時点 USD per 1M tokens）

export const USD_JPY = Number(process.env.USD_JPY_RATE) || 155;

export const PRICING = {
  // Gemini 2.5 Pro
  "gemini-2.5-pro":            { input: 1.25, output: 10.00, family: "gemini-pro" },
  // Gemini 2.5 Flash
  "gemini-2.5-flash":          { input: 0.30, output: 2.50,  family: "gemini-flash" },
  "gemini-2.0-flash":          { input: 0.30, output: 2.50,  family: "gemini-flash" },
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

export function calcCost(model, inputTokens = 0, outputTokens = 0) {
  let p = PRICING[model];
  let resolved = model;
  if (!p) {
    const key = Object.keys(PRICING).find(k => model && model.startsWith(k));
    if (key) { p = PRICING[key]; resolved = key; }
    else { p = FALLBACK; resolved = (model || "unknown") + " (fallback)"; }
  }
  const cost_usd = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  const cost_jpy = Math.round(cost_usd * USD_JPY * 100) / 100;
  return { cost_usd, cost_jpy, family: p.family, model_resolved: resolved };
}
