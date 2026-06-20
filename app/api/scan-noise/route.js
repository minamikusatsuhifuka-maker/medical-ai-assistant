import { logUsage } from "../../lib/log-usage";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 30;

export async function POST(request) {
  try {
    const { text, registered } = await request.json();
    if (!text || !text.trim()) {
      return Response.json({ candidates: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const registeredList = (registered || []).join("、");

    const prompt = `以下は皮膚科クリニックの音声書き起こしテキストです。
診察・医療・クリニック運営と無関係なノイズテキストを検出してください。

【ノイズの定義】
- テレビ・動画・YouTube由来のフレーズ（「次の映像でお会いしましょう」など）
- 周囲の無関係な会話（診察と関係ない日常会話）
- 音声認識の誤認識による意味不明なフレーズ
- SNS・ネット由来のフレーズ
- 繰り返しパターン（同じ文が2回以上）

【除外するもの（ノイズではない）】
- 患者の訴え・症状の説明
- 医師の診断・処方・指示
- 薬品名・疾患名・施術名
- クリニック運営・経営に関する会話
- スタッフ間の業務会話

${registeredList ? `【既に登録済みのパターン（除外）】\n${registeredList}\n` : ""}

JSON形式のみで返してください：
{"candidates":[{"text":"ノイズテキスト","reason":"理由"}]}

書き起こしテキスト：
${text.substring(0, 5000)}`;

    const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
    });

    let data, usedModel;
    try {
      ({ data, model: usedModel } = await callGeminiWithFallback(apiKey, requestBody, "scan-noise"));
    } catch (apiErr) {
      // 旧実装はここで {candidates:[]} を返し失敗を「0件」に偽装していた。成功偽装をやめ500で返す。
      // ★一時計測用: Geminiの実ステータス(404等)を _debug で透過。確認後にこの _debug は除去する。
      return Response.json({ candidates: [], error: "ノイズAI呼び出しに失敗しました", _debug: apiErr.message }, { status: 500 });
    }

    try { await logUsage({ route: "/api/scan-noise", model: usedModel, context: "noise-scan", input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0, request_meta: { char_length: text?.length || 0 } }); } catch(e) { console.error("[logUsage] scan-noise:", e); }
    let content = extractGeminiText(data);
    content = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let parsed = { candidates: [] };
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*"candidates"[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }

    // 登録済みを除外
    const registeredSet = new Set(registered || []);
    const filtered = (parsed.candidates || []).filter(c => !registeredSet.has(c.text));

    return Response.json({ candidates: filtered });
  } catch (e) {
    console.error("scan-noise error:", e);
    return Response.json({ candidates: [], error: e.message }, { status: 500 });
  }
}
