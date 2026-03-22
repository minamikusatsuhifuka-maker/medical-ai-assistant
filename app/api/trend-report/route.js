import { NextResponse } from "next/server";

export const maxDuration = 60;

const PROMPTS = {
  trend: "診療記録から月別・季節別の疾患トレンドを分析。疾患別件数・増減傾向・来月の予測を含むレポートを作成してください。",
  drugs: "診療記録からよく処方される薬・処置のランキングを集計。TOP10の薬品名・処置名・使用頻度をまとめてください。在庫管理や発注の参考になる情報も含めてください。",
  patient: "診療記録から患者の不安・疑問・要望パターンを分析。よくある訴えTOP10・患者満足度向上のための改善提案・説明方法の改善点をまとめてください。",
  summary: "診療記録から経営に役立つサマリーレポートを作成。来院患者の疾患構成・治療傾向・季節性・改善提案を含めてください。",
};

export async function POST(request) {
  try {
    const { records, type } = await request.json();
    if (!records || !records.length) {
      return NextResponse.json({ error: "診療記録データが必要です" }, { status: 400 });
    }

    const prompt = PROMPTS[type];
    if (!prompt) {
      return NextResponse.json({ error: "無効なタイプです: " + type }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const recordsText = records.map((r, i) => {
      const date = r.created_at ? new Date(r.created_at).toLocaleDateString("ja-JP") : "";
      return `【記録${i + 1}】${date}\n${r.output_text || ""}`;
    }).join("\n---\n");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "あなたは皮膚科クリニックのデータアナリストです。" + prompt }] },
        contents: [{ parts: [{ text: `【分析対象データ: ${records.length}件】\n${recordsText}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "トレンドレポート生成APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("Trend report error:", e);
    return NextResponse.json({ error: "トレンドレポート生成エラー: " + e.message }, { status: 500 });
  }
}
