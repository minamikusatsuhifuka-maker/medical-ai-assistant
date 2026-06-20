import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは皮膚科・美容皮膚科クリニックの音声書き起こし校正の専門家です。
WhisperによるAI音声認識の誤りを検出して正しい医療用語に修正してください。

【よくある音声認識誤りパターン】
薬品名: デュビックセンター→デュピクセント、コレクシム→コレクチム、ミチーガ→ミチーガ、プロトビック→プロトピック、ヒルドイド→ヒルドイド、リンデロン→リンデロン、ドレッドフォース→プロトピック等、ラミシール→ラミシール、アレグラ→アレグラ、ザイザル→ザイザル、ディフェリン→ディフェリン、デュアック→デュアック、エピデュオ→エピデュオ、アダパレン→アダパレン
疾患名: カートビー→アトピー、アトピ→アトピー性皮膚炎、じんましん→蕁麻疹、ざそう→痤瘡、しゅさ→酒さ、はくせん→白癬、みずむし→足白癬
処置名: えきたいちっそ→液体窒素、なろーばんど→ナローバンドUVB、だーもすこぴー→ダーモスコピー

【重要ルール】
- 上記パターンに一致する誤りを優先的に検出する
- 文脈から明らかに皮膚科用語の誤認識と判断できるもののみ検出する
- 一般的な日本語の言い間違いや話し言葉は検出しない
- 確信度が高い候補のみ返す（不確かな場合は候補に含めない）
- JSON形式のみで返す
- 形式: {"corrections":[{"from":"誤り語句","candidates":[{"to":"正しい医療用語","reason":"理由"}]}]}`;

export async function POST(request) {
  try {
    const body = await request.json();
    const text = body.text;
    const dictionary = body.dictionary;
    if (!text || !text.trim()) {
      return NextResponse.json({ corrections: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    let userPrompt = `以下は皮膚科クリニックでのWhisper音声書き起こしテキストです。音声認識の誤りを全て見つけて修正候補を提示してください。必ず3個以上見つけてください：\n\n${text}`;
    if (dictionary && Array.isArray(dictionary) && dictionary.length > 0) {
      const dictText = dictionary.map(d => `${d.from}→${d.to}`).join("\n");
      userPrompt += `\n\n【登録済み辞書（参考）】\n${dictText}`;
    }

    const requestBody = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
    });

    let data, usedModel;
    try {
      ({ data, model: usedModel } = await callGeminiWithFallback(apiKey, requestBody, "fix-typos"));
    } catch (apiErr) {
      // 全モデル失敗。成功に偽装せず500で返す。
      // ★一時計測用: Geminiの実ステータス(404等)を _debug で透過。確認後にこの _debug は除去する。
      return NextResponse.json({ error: "AI校正APIエラー", _debug: apiErr.message }, { status: 500 });
    }

    try { await logUsage({ route: "/api/fix-typos", model: usedModel, context: "typos-fix", input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0, request_meta: { char_length: text?.length || 0 } }); } catch(e) { console.error("[logUsage] fix-typos:", e); }
    // thinking partを除外してtext partのみ結合
    const content = extractGeminiText(data) || "";
    console.log("fix-typos model:", usedModel, "content:", content.slice(0, 500));

    if (!content.trim()) {
      console.error("fix-typos: empty response");
      return NextResponse.json({ corrections: [] });
    }

    let parsed = { corrections: [] };
    try {
      parsed = JSON.parse(content.trim());
    } catch (e1) {
      try {
        const m1 = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (m1) {
          parsed = JSON.parse(m1[1].trim());
        } else {
          const m2 = content.match(/\{[\s\S]*"corrections"[\s\S]*\}/);
          if (m2) {
            parsed = JSON.parse(m2[0]);
          } else {
            console.error("fix-typos: no JSON found in:", content.slice(0, 300));
            return NextResponse.json({ corrections: [] });
          }
        }
      } catch (e2) {
        console.error("fix-typos parse error:", e2.message, "raw:", content.slice(0, 300));
        return NextResponse.json({ corrections: [] });
      }
    }

    console.log("fix-typos corrections:", parsed.corrections?.length || 0);

    if (!parsed.corrections || !Array.isArray(parsed.corrections)) {
      return NextResponse.json({ corrections: [] });
    }
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("fix-typos error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
