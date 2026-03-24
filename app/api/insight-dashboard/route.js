import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const { content, mode } = await request.json();
    if (!content || content.trim().length < 10) {
      return NextResponse.json({ error: "コンテンツが不足しています" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    const prompts = {
      full: `あなたは医療経営・患者マーケティングの専門家です。
以下の皮膚科・美容皮膚科クリニックの診療・カウンセリング・症例データを横断的に分析し、
経営改善に直結する総合インサイトレポートを作成してください。

【分析項目】

1. 📊 患者データ概要
   - 総診療件数・期間・主要疾患TOP10
   - 美容施術の内訳と傾向
   - 患者の主な訴え・悩みパターン

2. 💎 当院の強み（データが示す事実）
   - 診療量・質の面での強み
   - 患者から評価されているポイント
   - 他院との差別化につながるデータ

3. ⚠️ 改善機会（データが示す課題）
   - 需要はあるが対応が少ない領域
   - 患者の潜在ニーズ（言葉にされていない悩み）
   - 離脱・リピート率に影響しそうなポイント

4. 📣 マーケティング施策提案（優先度順）
   - 今すぐできるSNS・HP改善（3つ）
   - 1ヶ月以内に着手すべき施策（3つ）
   - 3ヶ月以内の中期施策（3つ）

5. 🌸 季節・時期別の対策カレンダー
   - データから見える季節性・繁忙期
   - 各月の重点施術・疾患と推奨アクション

6. 💰 収益改善のヒント
   - 伸びしろがある施術・疾患領域
   - クロスセル・アップセルの機会
   - 新メニュー開発のヒント`,

      marketing: `あなたは医療特化のマーケティングストラテジストです。
以下のデータを分析し、このクリニックのマーケティング戦略を策定してください。

【マーケティング戦略レポート】

1. 🎯 ターゲット患者ペルソナ（3タイプ）
   - 各ペルソナの年代・悩み・来院動機・情報収集方法
   - 各ペルソナへの最適なメッセージ・チャネル

2. 📣 コンテンツマーケティング戦略
   - SNS（Instagram・X・LINE）別の投稿テーマ・頻度提案
   - ホームページで強化すべきコンテンツ（SEOキーワード含む）
   - 動画・ブログで狙うべきテーマTOP5

3. 🏷️ ポジショニング戦略
   - 競合との差別化ポイント（データ裏付けあり）
   - 「〇〇といえばこのクリニック」のブランドポジション案
   - 打ち出すべきUSP（独自の強み）3点

4. 📅 年間マーケティングカレンダー
   - 月別の重点テーマ・キャンペーン案
   - 季節イベントとの連動施策

5. 📊 KPI提案
   - 追跡すべき指標（新患数・リピート率・施術単価など）
   - 目標設定の考え方`,

      seasonal: `あなたは医療データアナリストです。
以下のデータから季節性・トレンドを分析し、来月以降の予測レポートを作成してください。

【季節・トレンド予測レポート】

1. 📅 月別疾患・施術トレンド（データから読み取れる傾向）
   - 各季節に多い疾患・施術TOP3
   - 繁忙期・閑散期のパターン

2. 🌸 今後3ヶ月の予測と推奨アクション
   - 予測される需要増加領域
   - 在庫・スタッフ配置の準備提案
   - 先手を打つSNS投稿・キャンペーンの提案

3. 🔮 中長期トレンド予測
   - 美容皮膚科領域での成長が見込まれる施術
   - 患者ニーズの変化の兆し
   - 新メニュー導入のタイミング提案

4. ⚡ 今すぐ着手すべきこと（緊急度順）
   - データが示す「今が旬」の施策
   - 機会損失を防ぐためのアクション`,

      segment: `あなたは患者行動分析の専門家です。
以下のデータから患者セグメントを分析し、セグメント別の対応戦略を提案してください。

【患者セグメント分析レポート】

1. 👥 患者セグメントの定義（4〜6セグメント）
   - 各セグメントの特徴（疾患・施術・来院頻度・訴えのパターン）
   - 推定人数比率
   - セグメント名（わかりやすいネーミング）

2. 💎 最重要セグメント（ロイヤル患者）の分析
   - 特徴・行動パターン・満足ポイント
   - このセグメントを増やすための施策

3. 🌱 成長可能性が高いセグメントの分析
   - 現在は少ないが伸びしろがある層
   - アプローチ方法・メッセージ

4. ⚠️ 離脱リスクが高いセグメントの分析
   - 途中離脱しやすい患者の特徴
   - 離脱防止のためのフォローアップ施策

5. 📣 セグメント別コミュニケーション戦略
   - 各セグメントへの最適なメッセージ・チャネル・タイミング`,

      revenue: `あなたは医療経営コンサルタントです。
以下のデータを分析し、このクリニックの収益改善提案をしてください。

【収益改善提案レポート】

1. 💰 現状の収益構造分析（推測）
   - 主要収益源の疾患・施術領域
   - 収益への貢献度が高い施術TOP5（推測）
   - 件数は多いが単価が低い可能性がある領域

2. 📈 収益向上の機会（3つのアプローチ）
   【アプローチA: 単価アップ】
   - アップセルできる施術・オプション提案
   - パッケージ化で単価を上げられるメニュー案

   【アプローチB: リピート率向上】
   - 継続治療につなげやすい疾患・施術
   - リピートを促すフォローアップ施策

   【アプローチC: 新患獲得】
   - 今のデータから見える未開拓の患者層
   - 新メニュー開発で取り込める市場

3. 🌟 新メニュー・サービス開発の提案
   - データが示すニーズ×自院の強みで生まれる新サービス案（3つ）
   - 各提案の実現可能性・期待収益・ターゲット

4. ⚡ 今すぐ実行できる収益改善アクション（5つ）
   - コストほぼゼロで実行できる施策
   - 期待効果と実施方法`
    };

    const systemPrompt = prompts[mode] || prompts.full;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: content.substring(0, 12000) }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "患者インサイトAPIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (result.trim()) {
      return NextResponse.json({ result });
    }
    throw new Error("Gemini応答エラー: " + JSON.stringify(data));
  } catch (e) {
    console.error("insight-dashboard error:", e);
    return NextResponse.json({ error: "患者インサイトエラー: " + e.message }, { status: 500 });
  }
}
