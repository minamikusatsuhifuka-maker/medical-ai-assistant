// 事前問診項目の抽出機能の共通ロジック（指示書 intake-question-extraction）
// 説明ナレッジ機能(explain-knowledge.js)と同じ3段構成・同じ個人情報排除・同じdedupをテンプレとして流用する。
// サーバ(抽出route)とクライアント(page.js)の両方から使う純関数のみを置く（サーバ専用依存を入れないこと）。

import { scrubPII, isSameKnowledge, normalizeForSim } from "./explain-knowledge.js";

export const INTAKE_CATEGORIES = [
  { id: "発症・経過", icon: "🕒" },
  { id: "症状の性状", icon: "🔍" },
  { id: "悪化因子・生活環境", icon: "🌤" },
  { id: "既往・治療歴", icon: "📋" },
  { id: "薬剤・アレルギー", icon: "💊" },
  { id: "その他", icon: "📌" },
];
export const INTAKE_CATEGORY_IDS = INTAKE_CATEGORIES.map((c) => c.id);

// スタッフ閲覧・印刷の画面上部に置く固定文言（指示書§3-F）
export const INTAKE_DISCLAIMER = "この問診は診察の補助です。判断が必要な内容は医師に確認してください。";

// 要約テキストから「# 疾患名」見出しを列挙する（複数疾患SOAPは複数見出し）
export function extractDiseaseHeadings(outputText) {
  const names = [];
  for (const m of String(outputText ?? "").matchAll(/^#\s+(.+?)\s*$/gm)) {
    const name = m[1].trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

// 疾患名の同一視（説明ナレッジの findTopicMatch と同じ正規化比較。aliasesは持たない）
export function findIntakeTopicMatch(name, topics) {
  const key = normalizeForSim(name);
  if (!key) return null;
  return (topics || []).find((t) => normalizeForSim(t.name) === key) || null;
}

// 抽出結果を既存 intake_items（同一疾患topic内）と突き合わせ、実行計画を返す（DB書き込みは行わない）。
// extractedItems: [{category, question, intent}] / existingItems: [{id, category, question, seen_count, status}]
// 返り値: {newItems:[{category,question,intent}], increments:[itemId]}
//  - 実質同内容(bigram類似0.8・rejected含む)は新規登録せず increments（rejected済みの再出現を draft に復活させない）
//  - 頻度1でも捨てない（却下されたものだけが消える）
export function planIntakeMerge(extractedItems, existingItems) {
  const newItems = [];
  const increments = [];
  for (const it of Array.isArray(extractedItems) ? extractedItems : []) {
    const category = INTAKE_CATEGORY_IDS.includes(it?.category) ? it.category : null;
    const question = String(it?.question ?? "").trim();
    const intent = String(it?.intent ?? "").trim();
    if (!category || !question) continue;
    // 既存の同categoryと実質同内容 → seen_count加算のみ
    const dup = (existingItems || []).find((x) => x.category === category && isSameKnowledge(x.question, question));
    if (dup) {
      if (!increments.includes(dup.id)) increments.push(dup.id);
      continue;
    }
    // 同一バッチ内の重複も1件に畳む
    if (newItems.some((n) => n.category === category && isSameKnowledge(n.question, question))) continue;
    newItems.push({ category, question, intent });
  }
  return { newItems, increments };
}

// 個人情報の機械チェック（説明ナレッジの scrubPII をそのまま流用。新規実装しない）
export { scrubPII };
