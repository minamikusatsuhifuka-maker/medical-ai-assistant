import { logUsage } from "../../lib/log-usage";
import { callGeminiWithFallback, extractGeminiText } from "../../lib/gemini-models";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const { records } = await request.json();
    if (!records || records.length === 0) {
      return Response.json({ error: "記録がありません" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const combined = records.map((r, i) =>
      `【記録${i + 1}】\n書き起こし: ${(r.input_text || "").substring(0, 800)}\n要約: ${(r.output_text || "").substring(0, 500)}`
    ).join("\n\n---\n\n");

    const prompt = `以下は皮膚科・美容皮膚科クリニックの複数の診察記録です。
これらを分析し、疾患ごとに外用方法・副作用・治療方針・患者説明のポイントを整理してください。

【出力形式】
疾患ごとに以下の形式でまとめてください：

■ [疾患名（医学用語）]（[件数]件の診察から抽出）

💊 外用方法・使い方
・[具体的な塗り方・頻度・タイミング・量の目安など]

⚠️ 副作用・注意事項
・[患者に伝えるべきリスク・注意点]

📋 治療方針
・[当院での治療の進め方・ステップ・目標]

💬 患者説明のポイント
・[スタッフが説明する際のポイント・よくある質問への答え方]

---

【重要なルール】
- 実際の診察記録に含まれる情報のみを使用する
- 記録にない内容は推測で補わない
- 複数の記録で共通している内容を優先してまとめる
- 当院独自の表現・説明方法を活かす

診察記録:
${combined.substring(0, 8000)}`;

    // 旧 gemini-2.0-flash 直叩きは404（廃番）。中央ヘルパーの有効モデルフォールバックに統一。
    const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
    });
    const { data, model } = await callGeminiWithFallback(apiKey, requestBody, "treatment-material");
    try { await logUsage({ route: "/api/treatment-material", model, context: "treatment-material", input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0, request_meta: { record_count: records?.length || 0 } }); } catch(e) { console.error("[logUsage] treatment-material:", e); }
    const material = extractGeminiText(data).trim();

    // Gensparkプロンプトを生成
    const gensparkPrompt = `以下は皮膚科クリニックの実際の診察記録をもとに整理した治療内容です。
これをもとに、クリニックのスタッフが患者説明・研修に使える資料を作成してください。

【作成してほしい資料の形式】
- タイトルスライド（クリニック名：南草津皮フ科）
- 疾患ごとのページ（各疾患について外用方法・副作用・治療方針をビジュアルで整理）
- スタッフ向け説明ポイントまとめページ
- よくある質問と回答ページ

【デザイン指示】
- 清潔感のある医療系デザイン
- 患者にも見せられるわかりやすい表現
- 図や表を活用して視覚的に整理

【治療内容データ】
${material}`;

    return Response.json({ material, gensparkPrompt });
  } catch (e) {
    console.error("treatment-material error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
