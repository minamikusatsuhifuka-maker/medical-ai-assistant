// 検証: 「(びらん)」誤置換の修正とハルシネーション対策（指示書 hallucination-and-biran-fix）
// - 汚染辞書エントリ（ただ→ただれ（びらん））のサニタイズ
// - 独立した「ただれ」のみ注記（「いただれ…」「まぶただれ…」内部では発火しない）
// - カタカナ短エントリの境界ガード（ドライブ内部の「イブ」で発火しない）
// - collapseRepeats の行内スペース区切り同語反復の畳み
// 実行: node scripts/verify-scenario-biran-hallucination.cjs
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "../app/page.js"), "utf8");
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? " → " + detail : ""}`); }
};

// --- 1. sanitizeDict（ソースから抽出して実行） ---
console.log("■ 辞書サニタイズ");
const mSan = src.match(/const DICT_BANNED_FROM=new Set\(\[[^\]]*\]\);\nconst sanitizeDict=[^\n]*;/);
check("sanitizeDict がソースに存在", !!mSan);
if (mSan) {
  const ctx = {};
  new Function("ctx", mSan[0].replace(/const DICT_BANNED_FROM/, "ctx.DICT_BANNED_FROM").replace(/new Set/, "new Set").replace(/const sanitizeDict/, "ctx.sanitizeDict").replace(/DICT_BANNED_FROM\.has/, "ctx.DICT_BANNED_FROM.has"))(ctx);
  const dirty = [["ただ", "ただれ（びらん）"], ["たこ", "胼胝"], ["べんち", "胼胝"], ["失神", "湿疹"], ["びらん", "びらん"]];
  const cleaned = ctx.sanitizeDict(dirty);
  check("「ただ」→ただれ（びらん）を除去", !cleaned.some(e => e[0] === "ただ"));
  check("「たこ」「べんち」も除去", !cleaned.some(e => e[0] === "たこ" || e[0] === "べんち"));
  check("正当な「失神」→湿疹は温存", cleaned.some(e => e[0] === "失神"));
}
check("mk_dict 読み込みにサニタイズ適用", /setDict\(sanitizeDict\(JSON\.parse\(d\)\)\)/.test(src));
check("Supabaseマージにサニタイズ適用", /const merged=sanitizeDict\(\[\.\.\.sbEntries,\.\.\.localOnly\]\)/.test(src));

// --- 2. ただれ→ただれ（びらん）の境界安全ルール（page.jsと同一の正規表現で検証） ---
console.log("■ 「ただれ」注記の単語境界");
const RE = /(?<![いぶ])ただれ(?!（びらん）)(?=[てたがるはもにのでやをへ、。！？\s]|$)/g;
const annotate = (s) => s.replace(RE, "ただれ（びらん）");
// リンターが正規表現リテラルをユニコードエスケープに正規化するため両形式を許容
check("ソースに同一の安全ルールが存在", src.includes("(?<![いぶ])ただれ(?!（びらん）)") || src.includes("(?<![\\u3044\\u3076])\\u305F\\u3060\\u308C(?!\\uFF08\\u3073\\u3089\\u3093\\uFF09)"));
check("「ご処理申し上げていただれきました」は不変", annotate("ご処理申し上げていただれきました") === "ご処理申し上げていただれきました");
check("「うまく使っていただれけたら」は不変", annotate("うまく使っていただれけたら") === "うまく使っていただれけたら");
check("「まぶただれけは」は不変", annotate("まぶただれけは") === "まぶただれけは");
check("「いただければ」は不変", annotate("いただければ") === "いただければ");
check("「まぶたが」は不変", annotate("まぶたが") === "まぶたが");
check("「そこがただれてますね」は注記される", annotate("そこがただれてますね") === "そこがただれ（びらん）てますね");
check("「皮膚がただれる」は注記される", annotate("皮膚がただれる") === "皮膚がただれ（びらん）る");
check("既に注記済みは二重化しない", annotate("ただれ（びらん）て") === "ただれ（びらん）て");

// --- 3. カタカナ短エントリの境界ガード ---
console.log("■ カタカナ短エントリ境界");
const kataGuard = (text, from, to) => text.replace(new RegExp(`(?<![ァ-ヶー])${from}(?![ァ-ヶー])`, "g"), to);
check("「ドライブで来院」の内部イブは置換しない", kataGuard("ドライブで来院", "イブ", "イボ") === "ドライブで来院");
check("「ライブの後に悪化」も不変", kataGuard("ライブの後に悪化", "イブ", "イボ") === "ライブの後に悪化");
check("独立した「イブが増えた」は置換される", kataGuard("イブが増えた", "イブ", "イボ") === "イボが増えた");
check("ソースにカタカナ境界ガードが存在", /ァ-ヶー\]\)\$\{esc\}/.test(src) || src.includes("(?<![ァ-ヶー])") || src.includes("(?<![\\u30A1-\\u30F6\\u30FC])"));

// --- 4. collapseRepeats（ソースから抽出して実行） ---
console.log("■ collapseRepeats 行内反復");
const start = src.indexOf("const collapseRepeats=");
const end = src.indexOf("const foldAccum=");
check("collapseRepeats を抽出可能", start !== -1 && end !== -1 && end > start);
if (start !== -1 && end > start) {
  const fnSrc = src.slice(start, end);
  const collapseRepeats = new Function(fnSrc + "; return collapseRepeats;")();
  const t1 = collapseRepeats("1号だったら真っ赤月分 真っ赤月 真っ赤月");
  check("スペース区切り同語反復を畳む", t1.includes("真っ赤月（×2）"), t1);
  const t2 = collapseRepeats("痛い 痛い 痛い");
  check("同語3連続 → （×3）", t2 === "痛い（×3）", t2);
  const t3 = collapseRepeats("はい わかりました 次へ");
  check("異なる語の並びは畳まない", t3 === "はい わかりました 次へ", t3);
  const t4 = collapseRepeats("水虫 水虫薬を出します");
  check("前方一致2回（正当な並び）は畳まない", t4 === "水虫 水虫薬を出します", t4);
  const t5 = collapseRepeats("うん。\nうん。\nうん。");
  check("行単位の畳みは従来どおり", /うん。?（×3）/.test(t5), t5);
  const t6 = collapseRepeats("今日は蕁麻疹の経過を診ます");
  check("通常文は不変", t6 === "今日は蕁麻疹の経過を診ます", t6);
}

// --- 5. プロンプト側の防波堤 ---
console.log("■ プロンプト強化");
check("FORBIDDEN_RULES に無関係文無視の指示", src.includes("広告文・キャッチコピー・製品コード"));
const cleanSrc = fs.readFileSync(path.join(__dirname, "../app/api/transcript-clean/route.js"), "utf8");
check("transcript-clean に広告文/製品コード削除の明示", cleanSrc.includes("製品コード・型番") && cleanSrc.includes("キャッチコピー"));
check("transcript-clean にスペース区切り同語連続の統合明示", cleanSrc.includes("スペース区切りの同語連続"));

// --- 6. 無音判定の独立性（構造確認） ---
console.log("■ 無音判定");
check("lvゲート素通り後もisSilentChunkが実行される（診察）", /lvRef\.current<1\)\{return;\}bumpDiag\("lv"\);if\(await isSilentChunk\(b\)\)\{return\}/.test(src.replace(/\s+/g, "")) || (src.includes('bumpDiag("lv");if(await isSilentChunk(b))')));
check("isSilentChunk はRMSベース＋判定不能時は送信（安全側）", src.includes("rms<silenceThrRef.current") && src.includes("catch{return false}"));

console.log(`\n結果: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
