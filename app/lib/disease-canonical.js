// 疾患見出しの名寄せ v3（指示書 disease-heading-normalization-v3。v1/v2を置き換え・院長決定 2026-07-26）
// 要約LLMの自由記述見出し（過去90日で385種・出現1件が71.9%）を正規化キーに寄せる。
// v3の要点: 湿疹・皮膚炎は部位を残して5カテゴリ（頭部/顔面/手/体部/陰部・臀部）に正規化する。
//           脂漏性皮膚炎は湿疹に統合しない（独立・院長決定）。包括語括弧（かゆみ（皮膚炎）等）は括弧外を採る。
// サーバ/クライアント両用の純関数のみを置く。エイリアス辞書（disease_aliases）はaliasMap引数で適用する。

// 診察SOAP要約プロンプトへ追記する疾患見出しの書式ルール（上流の固定。過去データは直らない）
export const DISEASE_HEADING_PROMPT_RULES = `

【疾患見出しの書式(厳守)】
1. 見出し行には疾患名のみを書く。A)S)O)P) の内容を同じ行に続けて書かない。

2. 書式は「通称（正式病名）」とする。通称がない、または通称と正式病名が同じ場合は
   括弧を付けず正式病名のみを書く。
   誤: 湿疹（湿疹） / 皮膚炎（皮膚炎） / 円形脱毛症（円形脱毛症）
   正: 湿疹 / 円形脱毛症

3. 「湿疹」と「皮膚炎」を言い換えて併記しない。
   誤: 湿疹（皮膚炎） / 皮膚炎（湿疹） / 湿疹（湿疹皮膚炎） / 湿疹・皮膚炎

4. 括弧内には具体的な病名だけを書く。「湿疹」「皮膚炎」のような包括的な語を
   括弧内に書いてはならない。
   病名が特定できない場合は、括弧を付けず症状名のみを書く。
   誤: かゆみ（皮膚炎） / 頭皮の不快感（頭皮湿疹） / お尻の痒み（臀部湿疹）
       / ただれ（皮膚炎） / 腕・首の湿疹（詳細不明の皮膚炎）
   正: かゆみ / 頭皮の不快感 / ただれ
   ※「かゆみ（皮膚瘙痒症）」のように括弧内が具体的な病名であれば可。

5. 湿疹・皮膚炎の見出しは「〈部位〉湿疹」の形で書き、部位は次の5つから必ず1つ選ぶ。
   頭部 / 顔面 / 手 / 体部 / 陰部・臀部
   例: 頭部湿疹 / 顔面湿疹 / 手湿疹 / 体部湿疹 / 陰部・臀部湿疹
   複数部位にまたがる場合は主たる部位を1つ選ぶ。
   ※病型名のつくもの(脂漏性皮膚炎、接触性皮膚炎、アトピー性皮膚炎、皮脂欠乏性湿疹、
     眼瞼皮膚炎、うっ滞性皮膚炎、汗疱など)はこの規則の対象外。病型名をそのまま書く。

6. 疾患が特定できない場合も「疾患名」「疾患名不明」「記載なし」とは書かない。

7. ニキビ跡・ざ瘡の瘢痕は「ざ瘡瘢痕」と書く。
   「尋常性ざ瘡瘢痕」「ざ瘡後瘢痕」「ニキビ跡」等の表記は使わない。
   ※活動性のざ瘡(尋常性ざ瘡)とは別の疾患として書き分けること。`;

// ===== 部位語→5カテゴリのマッピング（院長決定 2026-07-26。変更はこの表だけ） =====
// ※「耳→頭部」「足→体部」は暫定判断。院長が別カテゴリを希望した場合はこの表を書き換える。
export const BODY_CATEGORY_MAP = [
  { category: "頭部", parts: ["後頭部", "頭部", "頭皮", "頭", "耳介", "耳"] },
  { category: "顔面", parts: ["顔面", "顔", "前額", "額部", "額", "頬", "鼻", "口周り", "口唇"] },
  { category: "手", parts: ["手掌", "手指", "指先", "手", "指"] },
  { category: "体部", parts: ["体幹部", "体幹", "体部", "胸部", "腹部", "背部", "背中", "上肢", "下肢", "腕", "脚", "足部", "足", "頸部", "首", "全身", "体"] },
  { category: "陰部・臀部", parts: ["陰部", "股部", "鼠径", "臀部", "殿部", "お尻"] },
];
const ALL_PARTS = BODY_CATEGORY_MAP.flatMap((c) => c.parts).sort((a, b) => b.length - a.length);
const PART_ALT = ALL_PARTS.join("|");
// 「(部位[・、部位…])の?(湿疹|皮膚炎)」→ 5カテゴリの「〈部位〉湿疹」へ。複数部位は最初の部位のカテゴリを採る
const BODY_ECZEMA_RE = new RegExp(`^((?:${PART_ALT})(?:[・、](?:${PART_ALT}))*)の?(湿疹|皮膚炎)$`);
const PART_ONLY_RE = new RegExp(`^(?:${PART_ALT})(?:[・、](?:${PART_ALT}))*$`);
const categoryOfPart = (part) => (BODY_CATEGORY_MAP.find((c) => c.parts.includes(part)) || {}).category || "体部";

// 部位が判別できない裸の包括語（湿疹/皮膚炎/湿疹・皮膚炎 等）は「体部湿疹」に寄せる（最も一般的な部位のため・院長決定）
const GENERIC_ECZEMA_RE = /^(湿疹|皮膚炎|湿疹皮膚炎|湿疹・皮膚炎|皮膚炎・湿疹)$/;

// 括弧内が包括語（具体病名でない）の場合は括弧内を採らず括弧外を主キーにする（§2-C例外。過去データにこの型が残っている）
const isGenericInner = (s) => GENERIC_ECZEMA_RE.test(s) || /詳細不明/.test(s);

// 病型名（部位正規化の対象外・独立。前置の部位語つき（殿部接触皮膚炎 等）はこの正規形に切り出す）
export const PHENOTYPE_NAMES = [
  "脂漏性皮膚炎", "接触性皮膚炎", "アトピー性皮膚炎", "皮脂欠乏性湿疹", "眼瞼皮膚炎",
  "うっ滞性皮膚炎", "貨幣状湿疹", "日光皮膚炎", "花粉皮膚炎", "炎症性皮膚炎", "慢性湿疹", "汗疱",
];

// 同義の病名をコード側で統一する（院長決定 D-3: 脂漏性湿疹=脂漏性皮膚炎 / 眼瞼湿疹=眼瞼皮膚炎 / 汗疱系は相互統合可）
export const UNIFY_MAP = {
  "脂漏性湿疹": "脂漏性皮膚炎",
  "眼瞼湿疹": "眼瞼皮膚炎",
  "汗疱状湿疹": "汗疱",
  "異汗性湿疹": "汗疱",
  "接触皮膚炎": "接触性皮膚炎",
};

// 字体ゆれの統一（実データに出たもののみ。今後見つけたらここに追加）
export const VARIANT_MAP = [
  ["掻痒", "瘙痒"], // 医学用語の正式表記は「瘙痒症」（院長決定・alias-final-decisions §7。カルテ・スタッフ画面に出る名称のため正式表記に揃える）
];
const normalizeVariant = (s) => VARIANT_MAP.reduce((t, [from, to]) => t.split(from).join(to), s);

// プレースホルダ（疾患として扱わない。「未分類」として件数のみ集計する。今後の追加はこの2定数へ）
// 含有判定: この語を含む行はプレースホルダ（「疾患名不明」「記載なし# 皮膚炎」等を包含）
const PLACEHOLDER_RE = /疾患名|記載なし/;
// 完全一致判定: 行全体がこの語のときだけプレースホルダ（含有にすると「びらん（詳細不明）」等の正当な見出しまで死ぬため）
const PLACEHOLDER_EXACT = ["カルテ要約", "記載不能", "詳細病名不明", "病名不明", "不明"];

// 非疾患の見出し（事前問診の抽出対象から外す。削除はせず件数集計には残す。正規化キー基準・定数1箇所）
export const NON_DISEASE_KEYS = new Set([
  // 美容・自費メニュー
  "医療脱毛", "医療脱毛希望", "医療脱毛相談", "顔脱毛", "ヒゲ脱毛", "髭脱毛", "美肌治療", "小じわ", "妊娠線", "紫外線対策",
  // 皮膚科以外の疾患・処置（アレルギー性鼻炎は当院で診療あり・採用薬にナゾネックス等があるため対象に戻した=院長決定）
  "緑内障", "膀胱炎", "頸部痛", "末梢神経障害", "シェーグレン症候群", "アレルギー性結膜炎", "ワクチン接種",
  // 症状名のみ・部位のみで疾患が特定できないもの
  "かゆみ", "痒み", "赤み", "紅斑", "発疹", "腋窩", "顔と爪の症状", "足の症状", "頭部・耳の症状", "頬・背中の皮膚症状", "皮膚病変", "外傷後の爪の変化・足底の角化",
]);
export const isNonDiseaseKey = (k) => NON_DISEASE_KEYS.has(k);

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
  // プレースホルダは疾患として扱わない（含有=疾患名/記載なし、完全一致=カルテ要約/記載不能/詳細病名不明 等）
  if (PLACEHOLDER_RE.test(h) || PLACEHOLDER_EXACT.includes(h)) return null;
  // 構造ガード: 2文字以下で ）)：: を含む見出しは疾患ではない（空見出し行の次行「S）」等が拾われた残骸の再発防止）
  if ([...h].length <= 2 && /[）)：:]/.test(h)) return null;
  // 半角括弧→全角に統一
  h = h.replace(/\(/g, "（").replace(/\)/g, "）");

  let key = h;
  const m = h.match(/（([^（）]+)）/);
  if (m) {
    const innerRaw = m[1].trim();
    const outer = h.replace(/（[^（）]*）/g, "").replace(/[／/].*$/, "").trim();
    // 括弧内を主キーとして採る（括弧内一致479組と最多・医学用語として最も安定）
    // ・、/ 区切りは最初の1つ。「〜疑い」「〜など」の言い回しは落とす
    let inner = innerRaw.split(/[・、,／/]/)[0].trim().replace(/(の)?疑い$/, "").replace(/など$/, "").trim();
    if (!inner || isGenericInner(innerRaw) || isGenericInner(inner) || inner === "詳細不明" || PART_ONLY_RE.test(inner)) {
      key = outer || h; // 包括語（かゆみ（皮膚炎）等）・部位のみ（湿疹（体幹）等）・不明語は括弧外を採る
    } else if (normalizeVariant(inner) === normalizeVariant(outer)) {
      key = outer; // 括弧重複（湿疹（湿疹）→湿疹）
    } else if (!hasKanji(inner) && hasKanji(outer)) {
      key = outer; // 「正式名（読み仮名/略号）」型（胼胝（たこ）・爪囲炎（そういえん）・男性型脱毛症（AGA））
    } else {
      key = inner;
    }
  }
  key = normalizeVariant(key.trim());
  if (!key) return null;
  // 同義病名の統一（脂漏性湿疹→脂漏性皮膚炎 / 眼瞼湿疹→眼瞼皮膚炎 / 汗疱系）
  if (UNIFY_MAP[key]) key = UNIFY_MAP[key];
  // 病型名で終わる見出しは病型名に切り出す（殿部接触皮膚炎→接触性皮膚炎）。部位正規化より先に行う
  const pheno = PHENOTYPE_NAMES.find((p) => key.endsWith(p)) || Object.keys(UNIFY_MAP).find((p) => key.endsWith(p));
  if (pheno) {
    key = UNIFY_MAP[pheno] || pheno;
  } else if (GENERIC_ECZEMA_RE.test(key)) {
    // 部位が判別できない裸の湿疹/皮膚炎 → 体部湿疹（最も一般的な部位のため・院長決定）
    key = "体部湿疹";
  } else {
    // 湿疹・皮膚炎の部位を5カテゴリに正規化（頭部/顔面/手/体部/陰部・臀部）。
    // 「湿疹|皮膚炎で終わる」見出しにのみ適用するため、白癬系（足白癬・爪白癬・股部白癬）や
    // 部位が病名の一部の疾患（腋窩多汗症等）は構造的に対象外
    const bm = BODY_ECZEMA_RE.exec(key);
    if (bm) key = `${categoryOfPart(bm[1].split(/[・、]/)[0])}湿疹`;
  }
  if (aliasMap && aliasMap[key]) key = aliasMap[key];
  return key || null;
}

// 要約テキストから疾患見出しを正規化キーで列挙する。
// 返り値: { names: [カノニカルキー(重複なし)], unclassified: プレースホルダ等で疾患として扱えなかった見出し行数 }
export function parseDiseaseHeadings(outputText, aliasMap) {
  const names = [];
  let unclassified = 0;
  // 注意: \s は改行にもマッチするため /^#\s+(.+?)$/ だと空見出し行「# 」の次行（S）等）を捕捉してしまう。
  // 行内空白のみ許可する（「S）」が見出し化した実バグの根治）
  for (const m of String(outputText ?? "").matchAll(/^#[ \t　]+(.+?)[ \t　]*$/gm)) {
    const key = toCanonicalDisease(m[1], aliasMap);
    if (key) { if (!names.includes(key)) names.push(key); }
    else unclassified++;
  }
  return { names, unclassified };
}
