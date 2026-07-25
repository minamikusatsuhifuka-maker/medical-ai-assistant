// 説明ナレッジ機能の共通ロジック（指示書 explain-knowledge-feature）
// サーバ(抽出route)とクライアント(page.js)の両方から使う純関数のみを置く（サーバ専用依存を入れないこと）。

export const EXPLAIN_CATEGORIES = [
  { id: "treatment", label: "治療内容", icon: "💊" },
  { id: "explanation", label: "説明の仕方（この順で説明する）", icon: "🗣" },
  { id: "skincare", label: "スキンケア指導", icon: "🧴" },
  { id: "qa", label: "よくある質問と回答", icon: "❓" },
  { id: "caution", label: "注意点", icon: "⚠️" },
];
export const EXPLAIN_CATEGORY_IDS = EXPLAIN_CATEGORIES.map((c) => c.id);

// ===== 個人情報の機械チェック（プロンプト厳守の後段に置く1枚のガード） =====
// 敬称付きでも一般語として温存するもの（末尾一致で判定）
const HONORIFIC_KEEP = [
  "患者さん", "患者様", "看護師さん", "看護婦さん", "お医者さん", "医者さん", "薬剤師さん", "業者さん", "スタッフさん", "メーカーさん",
  "皆さん", "皆様", "みなさん", "みなさま", "たくさん",
  "お母さん", "お父さん", "お兄さん", "お姉さん", "お婆さん", "お爺さん", "おかあさん", "おとうさん", "おにいさん", "おねえさん", "おばあさん", "おじいさん", "おばさん", "おじさん",
  "おばあちゃん", "おじいちゃん", "お母ちゃん", "お父ちゃん", "お兄ちゃん", "お姉ちゃん", "坊っちゃん", "坊ちゃん", "赤ちゃん",
  "奥さん", "奥様", "旦那さん", "娘さん", "息子さん", "お子さん", "お嬢さん", "お客さん", "お客様",
  "王様", "神様", "仏様", "殿様", "同様", "多様", "一様", "異様", "模様", "仕様", "有様", "左様",
];

// 氏名らしきパターン（敬称付き固有名・ID/カルテ番号）を一般化する。
// 敬称の直後が漢字/々の場合は複合語（様子・様々・たくさん飲む 等）とみなし対象外。
export function scrubPII(text) {
  let t = String(text ?? "");
  // 「◯◯さん/様/さま/ちゃん/くん」→「患者さん」（一般語は HONORIFIC_KEEP で温存）
  // 名前部は怠惰マッチ必須: 貪欲だと「佐藤様とお子さん」を丸ごと1マッチにして keep 語尾で温存し氏名が漏れる
  t = t.replace(/([一-龯ァ-ヶーぁ-ん]{2,6}?)(さん|様|さま|ちゃん|くん)(?![一-龯々])/g, (m) =>
    HONORIFIC_KEEP.some((w) => m.endsWith(w)) ? m : "患者さん"
  );
  // ID・カルテ番号・診察券番号らしき数字列を伏せる
  t = t.replace(/((?:ID|カルテ(?:番号)?|診察券(?:番号)?|患者番号|No\.?)\s*[:：#]?\s*)\d{2,}/gi, "$1***");
  return t;
}

// ===== 重複マージ（正規化テキストのbigram類似で実質同内容を判定） =====
export function normalizeForSim(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\s、。・,．.，!！?？:：;；「」『』()（）[\]【】\-ー~〜*■□◆●○]/g, "");
}

const bigrams = (s) => {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
};

export function textSimilarity(a, b) {
  const na = normalizeForSim(a);
  const nb = normalizeForSim(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const A = bigrams(na);
  const B = bigrams(nb);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

// 実質同内容の判定しきい値。同一文=1.0、語順・助詞の揺れ程度は0.8以上に乗る。
export function isSameKnowledge(a, b) {
  return textSimilarity(a, b) >= 0.8;
}

// 疾患名のマッチ（名前・カッコ除去形・aliases を正規化して同一視）
const stripParen = (s) => String(s ?? "").replace(/[（(].*?[)）]/g, "").trim();
export function findTopicMatch(name, topics) {
  const keys = new Set([normalizeForSim(name), normalizeForSim(stripParen(name))].filter(Boolean));
  for (const t of topics || []) {
    const cand = [t.name, stripParen(t.name), ...(Array.isArray(t.aliases) ? t.aliases : [])];
    if (cand.some((c) => keys.has(normalizeForSim(c)) && normalizeForSim(c))) return t;
  }
  return null;
}

// 抽出結果を既存データと突き合わせ、実行計画を返す（DB書き込みは行わない）。
// extractedTopics: [{name, aliases?, items:[{category, content}]}]
// existingTopics: [{id, name, aliases}] / existingItems: [{id, topic_id, category, content}]
// 返り値: {newTopics:[{tmpKey,name,aliases}], newItems:[{topicRef,category,content}], increments:[itemId]}
//  - topicRef は既存topicのid、または "tmp:<tmpKey>"（新規作成後に実idへ差し替える）
//  - 既存と実質同内容（rejected含む）は新規登録せず increments（rejected済みの再出現を draft に復活させない）
export function planMerge(extractedTopics, existingTopics, existingItems) {
  const newTopics = [];
  const newItems = [];
  const increments = [];
  for (const et of Array.isArray(extractedTopics) ? extractedTopics : []) {
    const name = String(et?.name ?? "").trim();
    if (!name) continue;
    // 有効項目（正当なcategory・非空content）を先に確定。ゼロなら空topicを作らない
    const validItems = (Array.isArray(et.items) ? et.items : [])
      .map((it) => ({ category: EXPLAIN_CATEGORY_IDS.includes(it?.category) ? it.category : null, content: String(it?.content ?? "").trim() }))
      .filter((it) => it.category && it.content);
    if (validItems.length === 0) continue;
    const pool = [...(existingTopics || []), ...newTopics.map((t) => ({ id: "tmp:" + t.tmpKey, name: t.name, aliases: t.aliases }))];
    const match = findTopicMatch(name, pool);
    let topicRef;
    if (match) {
      topicRef = match.id;
    } else {
      const tmpKey = "t" + newTopics.length;
      const aliases = (Array.isArray(et.aliases) ? et.aliases : [])
        .map((a) => String(a ?? "").trim())
        .filter((a) => a && normalizeForSim(a) !== normalizeForSim(name));
      newTopics.push({ tmpKey, name, aliases });
      topicRef = "tmp:" + tmpKey;
    }
    for (const { category, content } of validItems) {
      // 既存の同topic同categoryと実質同内容 → seen_count加算のみ
      const dup = (existingItems || []).find((x) => x.topic_id === topicRef && x.category === category && isSameKnowledge(x.content, content));
      if (dup) {
        if (!increments.includes(dup.id)) increments.push(dup.id);
        continue;
      }
      // 同一バッチ内の重複も1件に畳む
      if (newItems.some((n) => n.topicRef === topicRef && n.category === category && isSameKnowledge(n.content, content))) continue;
      newItems.push({ topicRef, category, content });
    }
  }
  return { newTopics, newItems, increments };
}
