// 疾患見出しの名寄せ（指示書 disease-heading-normalization）
// 要約LLMの自由記述見出し（過去90日で385種・出現1件が71.9%）を正規化キーに寄せる。
// サーバ/クライアント両用の純関数のみを置く（サーバ専用依存を入れないこと）。
// エイリアス辞書（disease_aliases テーブル）はDB由来のため、適用はaliasMap引数で行う。

// 診察SOAP要約プロンプトへ追記する疾患見出しの書式ルール（今後の記録の汚れを止める上流対策。過去データは直らない）
export const DISEASE_HEADING_PROMPT_RULES = `

【疾患見出しの書式(厳守)】
- 見出し行には疾患名のみを書く。A)S)O)P) の内容を同じ行に続けて書かない。
- 書式は「通称（正式病名）」とする。通称がない、または通称と正式病名が同じ場合は
  括弧を付けず正式病名のみを書く。
  誤: 湿疹（湿疹） / 皮膚炎（皮膚炎） / 円形脱毛症（円形脱毛症）
  正: 湿疹 / 皮膚炎 / 円形脱毛症
- 部位は見出しに含めない。部位はO)に書く。
  誤: 顔の湿疹（顔面湿疹） / 頭皮湿疹（頭部湿疹）
  正: 湿疹
  ただし部位によって疾患が異なる場合(足白癬・爪白癬・股部白癬など)は正しく書き分ける。
- 疾患が特定できない場合も「疾患名」「疾患名不明」「記載なし」とは書かない。
  推定病名を書くか、症状名(例: 発疹)を書く。`;

// 部位語（〜湿疹/〜皮膚炎の部位除去と、括弧内が部位のみのケースの判定に使う）。
// 「手」「足」「眼瞼」は入れない: 手湿疹・眼瞼皮膚炎は独立疾患として扱われることがあり、寄せるかは院長判断。
export const BODY_PART_WORDS = ["顔面", "顔", "頭部", "頭皮", "頭", "耳介", "耳", "体幹部", "体幹", "体部", "背中", "背部", "額部", "額", "頸部", "首", "臀部", "腕", "体"];
const BP_ALT = BODY_PART_WORDS.join("|");
// 部位語（・、連結可）+「の」? +（湿疹|皮膚炎） → 基幹だけ残す。脂漏性/接触性/アトピー性等の修飾語は部位語でないため対象外
const BP_STRIP_RE = new RegExp(`^(?:(?:${BP_ALT})(?:[・、](?:${BP_ALT}))*)の?(湿疹|皮膚炎)$`);
const BP_ONLY_RE = new RegExp(`^(?:${BP_ALT})(?:[・、](?:${BP_ALT}))*$`);

// 字体ゆれの統一（実データに出たもののみを持つ。今後見つけたらここに追加）
export const VARIANT_MAP = [
  ["瘙痒", "掻痒"], // かゆみ（皮膚瘙痒症）↔（皮膚掻痒症）
];
const normalizeVariant = (s) => VARIANT_MAP.reduce((t, [from, to]) => t.split(from).join(to), s);

// プレースホルダ（疾患として扱わない。「未分類」として件数のみ集計する）
const PLACEHOLDER_RE = /疾患名|記載なし/;

const hasKanji = (s) => /[一-龯々]/.test(s);

// 見出し1行を正規化キーに変換する。疾患として扱えない行（プレースホルダ・空）は null を返す。
// aliasMap: {alias: canonical}（disease_aliases テーブル由来。省略可）
export function toCanonicalDisease(heading, aliasMap) {
  let h = String(heading ?? "").trim();
  if (!h) return null;
  // 「記載なし# 皮膚炎」のように # が行内に再出現する場合は後半を見出しとして採る
  const hashIdx = h.lastIndexOf("#");
  if (hashIdx >= 0) h = h.slice(hashIdx + 1).trim();
  // 評価文の混入を切り落とす（全角/半角スペース + A)S)O)P) 以降。全角・半角括弧の両方）
  h = h.replace(/[\s　]+[ASOP][）)].*$/, "").trim();
  if (!h) return null;
  // プレースホルダは疾患として扱わない
  if (PLACEHOLDER_RE.test(h)) return null;
  // 半角括弧→全角に統一
  h = h.replace(/\(/g, "（").replace(/\)/g, "）");

  let key = h;
  const m = h.match(/（([^（）]+)）/);
  if (m) {
    // 括弧内を主キーとして採る（調査で括弧内一致が最多479組・医学用語として最も安定）
    // ・、/ 区切りで複数ある場合は最初の1つ。「〜疑い」「〜など」の言い回しは落とす
    let inner = m[1].split(/[・、,／/]/)[0].trim().replace(/(の)?疑い$/, "").replace(/など$/, "").trim();
    const outer = h.replace(/（[^（）]*）/g, "").replace(/[／/].*$/, "").trim();
    if (!inner || inner === "詳細不明" || BP_ONLY_RE.test(inner)) {
      key = outer || h; // 括弧内が部位・不明語のみ（湿疹（体幹）等）は括弧外を採る
    } else if (normalizeVariant(inner) === normalizeVariant(outer)) {
      key = outer; // 括弧重複（湿疹（湿疹）→湿疹）
    } else if (!hasKanji(inner) && hasKanji(outer)) {
      key = outer; // 「正式名（読み仮名/略号）」型（胼胝（たこ）・爪囲炎（そういえん）・男性型脱毛症（AGA））は括弧外を採る
    } else {
      key = inner;
    }
  }
  key = normalizeVariant(key.trim());
  if (!key) return null;
  // 部位語の除去は「湿疹」「皮膚炎」で終わる語にのみ適用（足白癬→白癬 のような除去を構造的に防ぐ）
  const bp = BP_STRIP_RE.exec(key);
  if (bp) key = bp[1];
  if (aliasMap && aliasMap[key]) key = aliasMap[key];
  return key || null;
}

// 要約テキストから疾患見出しを正規化キーで列挙する。
// 返り値: { names: [カノニカルキー(重複なし)], unclassified: プレースホルダ等で疾患として扱えなかった見出し行数 }
export function parseDiseaseHeadings(outputText, aliasMap) {
  const names = [];
  let unclassified = 0;
  for (const m of String(outputText ?? "").matchAll(/^#\s+(.+?)\s*$/gm)) {
    const key = toCanonicalDisease(m[1], aliasMap);
    if (key) { if (!names.includes(key)) names.push(key); }
    else unclassified++;
  }
  return { names, unclassified };
}
