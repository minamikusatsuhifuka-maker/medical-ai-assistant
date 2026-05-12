import { createClient } from "@supabase/supabase-js";
import { calcCost, USD_JPY } from "./pricing";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;

/**
 * API使用量を api_usage_logs テーブルに記録（失敗してもAPI本体は止めない）
 * @returns {Promise<{input_tokens,output_tokens,total_tokens,cost_usd,cost_jpy,family,model_resolved,usd_jpy_rate}>}
 */
export async function logUsage({
  route,
  model,
  context = null,
  input_tokens = 0,
  output_tokens = 0,
  request_meta = null,
  success = true,
  error_message = null,
}) {
  const total_tokens = (input_tokens || 0) + (output_tokens || 0);
  const { cost_usd, cost_jpy, family, model_resolved } = calcCost(model, input_tokens, output_tokens);
  const summary = { input_tokens, output_tokens, total_tokens, cost_usd, cost_jpy, family, model_resolved, usd_jpy_rate: USD_JPY };

  if (!supabase) {
    console.warn("[logUsage] supabase 未初期化、記録スキップ");
    return summary;
  }
  try {
    const { error } = await supabase.from("api_usage_logs").insert({
      route, model: model_resolved, model_family: family, context,
      input_tokens, output_tokens, total_tokens,
      cost_usd, cost_jpy, usd_jpy_rate: USD_JPY,
      request_meta, success, error_message,
    });
    if (error) console.error("[logUsage] insert error:", error.message);
  } catch (e) {
    console.error("[logUsage] unexpected error:", e);
  }
  return summary;
}
