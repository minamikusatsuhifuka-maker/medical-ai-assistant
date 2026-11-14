import { logUsage } from "../../lib/log-usage";
import { callGeminiWithFallback, extractGeminiText, geminiOutputTokens } from "../../lib/gemini-models";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text) return Response.json({ items: [] });

    const apiKey = process.env.GEMINI_API_KEY;

    const prompt = `以下のカルテ要約から処方薬・外用薬・内服薬のチェックリストを抽出してください。

【出力形式】JSONのみ。説明不要。
{"items": [
  {"name": "薬剤名", "usage": "用法・用量", "duration": "日数・期間", "type": "外用|内服|注射|その他"},
  ...
]}

薬剤が見つからない場合: {"items": []}

カルテ要約:
${text.substring(0, 2000)}`;

    // 中央ヘルパー経由でフォールバック呼び出し（全滅時はthrow→下のcatchで items:[] を返す従来挙動）
    const { data, model: usedModel } = await callGeminiWithFallback(apiKey, JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2500 },
    }), "extract-rx");

    const raw = extractGeminiText(data) || "";
    const finishReason = data.candidates?.[0]?.finishReason || null;
    // 取り出しの結果を先に決めてから利用ログに残す（2週間の記録で「空を返した回」「上限で切れた回」を数えるため・heading-site-map-decision §4）
    let items = [], parsedOk = false;
    try {
      const clean = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      if (start !== -1 && end !== -1) { items = JSON.parse(clean.slice(start, end + 1)).items || []; parsedOk = true; }
    } catch { parsedOk = false; }
    try { await logUsage({ route: "/api/extract-rx", model: usedModel, context: "rx-extract", input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: geminiOutputTokens(data.usageMetadata), cached_tokens: data.usageMetadata?.cachedContentTokenCount || 0, request_meta: { char_length: text?.length || 0, finish_reason: finishReason, parsed: parsedOk, items: items.length, empty: !parsedOk, thoughts_tokens: data.usageMetadata?.thoughtsTokenCount || 0 } }); } catch(e) { console.error("[logUsage] extract-rx:", e); }
    return Response.json({ items });
  } catch (e) {
    return Response.json({ items: [] });
  }
}
