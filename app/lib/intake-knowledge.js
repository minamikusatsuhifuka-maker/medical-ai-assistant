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

// 初診/再診の区分（intake_items.visit_type。カラム未作成環境ではフォールバックで「共通」扱い）
export const INTAKE_VISIT_TYPES = ["初診", "再診", "共通"];

// 全疾患共通の固定基本問診セット（intake-quality-fix §E）。
// 抽出とは独立してすべての疾患の問診票の冒頭に表示し、抽出対象からは除外する（重複防止）。
// ※妊娠・授乳の確認は必須: 採用薬にイソトレチノイン・ミノマイシン・ビブラマイシン・ネオーラル等があり投与可否に直結する。
// 院長が編集する場合はこの配列を直接書き換える（UIからの編集は未対応・2026-07時点）。
export const INTAKE_FIXED_QUESTIONS = [
  { question: "現在、妊娠中・授乳中ですか。妊娠の可能性はありますか", intent: "催奇形性のある薬剤（イソトレチノイン等）の投与可否判断" },
  { question: "薬や食べ物で、アレルギーが出たことはありますか", intent: "薬剤アレルギー歴の確認" },
  { question: "現在治療中の病気や、飲んでいるお薬はありますか", intent: "併用薬・基礎疾患の確認" },
  { question: "本日、医師に相談したいことはありますか", intent: "受診目的・主訴の確認" },
];

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

// 抽出応答（LLMの同義判定つき）を既存項目と突き合わせ、実行計画を返す（DB書き込みは行わない）。
// intake-dedup-fix §A: 抽出プロンプトに既存項目を番号つきで渡し、同義なら {"existing": 番号} が返る。
// extractedItems: [{category, question, intent, visit_type} | {existing: 番号}]
// existingItems: 番号順の既存項目 [{id, category, question, seen_count, status}]（APIに渡した列挙と同じ順序であること）
// 返り値: {newItems, increments(既存id・rejected除く), rejectedSkips(復活させず加算もしない件数)}
//  - LLMが同義を見逃した場合の保険として、新規判定の項目も従来のbigram類似0.8で既存と突き合わせる
//  - 既存が approved でも seen_count 加算のみ（status/question は変更しない=呼び出し側の責務だが増分計画はここで区別しない）
//  - 既存が rejected なら復活させない・seen_count も加算しない（院長が却下したものを蒸し返さない）
export function planIntakeMergeV2(extractedItems, existingItems) {
  const newItems = [];
  const increments = [];
  let rejectedSkips = 0;
  const list = Array.isArray(existingItems) ? existingItems : [];
  const markIncrement = (ex) => {
    if (!ex) return;
    if (ex.status === "rejected") { rejectedSkips++; return; }
    if (!increments.includes(ex.id)) increments.push(ex.id);
  };
  for (const it of Array.isArray(extractedItems) ? extractedItems : []) {
    // LLMが既存と同義と判定した項目（1始まりの番号）
    if (it && it.existing !== undefined && it.existing !== null) {
      const n = Number(it.existing);
      if (Number.isInteger(n) && n >= 1 && n <= list.length) markIncrement(list[n - 1]);
      continue;
    }
    const category = INTAKE_CATEGORY_IDS.includes(it?.category) ? it.category : null;
    const question = String(it?.question ?? "").trim();
    const intent = String(it?.intent ?? "").trim();
    const visit_type = INTAKE_VISIT_TYPES.includes(it?.visit_type) ? it.visit_type : "共通";
    if (!category || !question) continue;
    // 保険: LLMが見逃した実質同内容（bigram類似0.8）も既存へ寄せる
    const dup = list.find((x) => x.category === category && isSameKnowledge(x.question, question));
    if (dup) { markIncrement(dup); continue; }
    // 同一バッチ内の重複も1件に畳む
    if (newItems.some((n2) => n2.category === category && isSameKnowledge(n2.question, question))) continue;
    newItems.push({ category, question, intent, visit_type });
  }
  return { newItems, increments, rejectedSkips };
}

// 個人情報の機械チェック（説明ナレッジの scrubPII をそのまま流用。新規実装しない）
export { scrubPII };
