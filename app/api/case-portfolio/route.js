import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const { content, group } = await request.json();
    if (!content || content.trim().length < 10) {
      return NextResponse.json({ error: "コンテンツが不足しています" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const groupLabel = group || "美容";

    const systemPrompt = `あなたは皮膚科・美容皮膚科クリニックのコンテンツディレクターです。
以下の「${groupLabel}」グループのお気に入り症例データを分析し、
ホームページ・院内掲示・スタッフ教育に使える症例ポートフォリオを作成してください。

【生成する内容】

1. 📊 症例データの概要
   - 件数・期間・主な施術/疾患の内訳
   - 患者層の傾向（年代・性別・主訴の傾向）

2. 🌟 代表症例集（上位5〜8件）
   - 各症例のタイトル・施術/治療内容・経過・ポイント
   - 「この症例から学べること」を1行で
   - ホームページ掲載向けの紹介文（100字以内）

3. 📈 よくある相談パターンTOP5
   - 主訴・患者の悩み・当院の対応アプローチ
   - 類似症例数・成功のポイント

4. 💡 施術/治療別の特徴まとめ
   - 当院が得意とする施術/疾患領域
   - 他院との違いが出ているポイント

5. 📣 ホームページ・SNS活用素材
   - 症例紹介ページのコピー案（3パターン）
   - 「こんなお悩みの方へ」コーナー用の文章
   - Before/Afterの見せ方のポイント・注意事項

6. 🎓 スタッフ教育への活用
   - この症例集から新人スタッフが学ぶべきポイント3点
   - よくある患者の不安・質問と模範回答

実際の診療データに基づき、リアルで活用しやすい症例ポートフォリオを作成してください。
個人情報（患者名・ID等）は出力に含めないでください。`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: content.substring(0, 10000) }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "症例ポートフォリオAPIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("case-portfolio error:", e);
    return NextResponse.json({ error: "症例ポートフォリオエラー: " + e.message }, { status: 500 });
  }
}
