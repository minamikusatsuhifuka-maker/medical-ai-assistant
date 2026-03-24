import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const { content } = await request.json();
    if (!content || content.trim().length < 10) {
      return NextResponse.json({ error: "コンテンツが不足しています" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const systemPrompt = `あなたは医療マーケティング・患者体験設計の専門家です。
以下の皮膚科・美容皮膚科クリニックのカウンセリング記録・診療記録を分析し、
患者ジャーニーマップを作成してください。

【患者ジャーニーマップの構成】

■ フェーズ1: 認知・来院前
- 患者が抱えている悩み・症状（データから読み取れる主訴TOP5）
- 来院を決断する前の不安・躊躇（「本当に行くべきか」「費用は？」など）
- 情報収集行動の推測（何で調べているか・何を気にしているか）
- 💡 改善アクション: ホームページ・SNSで発信すべきコンテンツ

■ フェーズ2: 初回来院・受付
- 患者が最初に感じる不安・期待
- 受付・待合での患者心理（データから読み取れる傾向）
- よくある最初の質問パターン
- 💡 改善アクション: 問診票・受付トークの改善ポイント

■ フェーズ3: 診察・カウンセリング
- 患者が「よかった」と感じる瞬間（データから読み取れる肯定的サイン）
- 患者が「不安」を感じる瞬間（データから読み取れる懸念ポイント）
- 説明で特に重要なポイント（患者がよく確認すること）
- 💡 改善アクション: 説明トーク・カウンセリングの改善ポイント

■ フェーズ4: 治療中・経過観察
- 継続率に影響する要因（データから見えること）
- 患者が途中でやめたくなる理由の推測
- リピートにつながるポジティブな体験
- 💡 改善アクション: フォローアップ・リマインド施策の提案

■ フェーズ5: 終診・リピート・紹介
- リピート患者の特徴（データから読み取れるパターン）
- 口コミ・紹介につながる体験の特徴
- 長期関係構築のための提案
- 💡 改善アクション: ロイヤル患者育成・紹介促進施策

■ 総合評価と優先改善ポイント
- データから見える当院の患者体験の強み（3点）
- 最優先で改善すべきポイント（3点）
- 短期（1ヶ月以内）・中期（3ヶ月以内）のアクションプラン

実際のデータに基づき、具体的で実践的なジャーニーマップを作成してください。
推測の場合は「推測:」と明記してください。`;

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
      return NextResponse.json({ error: "患者ジャーニーマップAPIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("journey-map error:", e);
    return NextResponse.json({ error: "患者ジャーニーマップエラー: " + e.message }, { status: 500 });
  }
}
