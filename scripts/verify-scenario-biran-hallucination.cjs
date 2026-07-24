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

// --- 7. 汚染型修正候補の提案段階ブロック（指示書 typo-scan-contamination-guard） ---
console.log("■ 危険候補フィルタ isDangerousCorrection");
const libSrc = fs.readFileSync(path.join(__dirname, "../app/lib/dangerous-correction.js"), "utf8");
const libCtx = new Function(libSrc.replace(/^export /gm, "") + "; return { isDangerousCorrection, filterDangerousCorrections, KNOWN_DANGEROUS_FROMS, CORRECTION_PROMPT_GUARD };")();
const { isDangerousCorrection, filterDangerousCorrections } = libCtx;
// 危険候補は除外される
check("「ただ→ただれ（びらん）」を弾く", !!isDangerousCorrection("ただ", "ただれ（びらん）"));
check("「れも→でも」を弾く（2文字ひらがな）", !!isDangerousCorrection("れも", "でも"));
check("「イブ→イボ」を弾く（既知の危険エントリ）", !!isDangerousCorrection("イブ", "イボ"));
check("「たこ→胼胝」「べんち→胼胝」を弾く（ブロックリスト）", !!isDangerousCorrection("たこ", "胼胝") && !!isDangerousCorrection("べんち", "胼胝"));
check("「アトピ→アトピー性皮膚炎」を弾く（before内包の拡張置換）", !!isDangerousCorrection("アトピ", "アトピー性皮膚炎"));
check("「またね→また明日」を弾く（日常語を含む）", !!isDangerousCorrection("またね", "また明日"));
// 正当な医療用語修正は通る
check("「ヒルロイド→ヒルドイド」は通る", isDangerousCorrection("ヒルロイド", "ヒルドイド") === null);
check("「ボチ→亜鉛華軟膏」は通る（2文字カタカナは一律では弾かない）", isDangerousCorrection("ボチ", "亜鉛華軟膏") === null);
check("「デュビックセンター→デュピクセント」は通る", isDangerousCorrection("デュビックセンター", "デュピクセント") === null);
check("「えきたいちっそ→液体窒素」は通る（長いひらがなはOK）", isDangerousCorrection("えきたいちっそ", "液体窒素") === null);
check("「失神→湿疹」は通る", isDangerousCorrection("失神", "湿疹") === null);
// corrections 配列レベルのフィルタ
const filtered = filterDangerousCorrections([
  { from: "ただ", candidates: [{ to: "ただれ（びらん）", reason: "x" }] },
  { from: "ヒルロイド", candidates: [{ to: "ヒルドイド", reason: "薬品名" }] },
  { from: "ヨクイニ", candidates: [{ to: "ヨクイニン", reason: "拡張型(弾かれる)" }, { to: "薏苡仁", reason: "生薬名" }] },
]);
check("filterDangerousCorrections: 危険fromごと除外", !filtered.some(c => c.from === "ただ"));
check("filterDangerousCorrections: 正当候補は温存", filtered.some(c => c.from === "ヒルロイド"));
check("filterDangerousCorrections: 候補単位で拡張置換のみ除外", (() => { const c = filtered.find(x => x.from === "ヨクイニ"); return c && c.candidates.length === 1 && c.candidates[0].to === "薏苡仁"; })());

// --- 8. 全経路への配線（ソース確認） ---
console.log("■ 全経路への適用");
const fixSrc = fs.readFileSync(path.join(__dirname, "../app/api/fix-typos/route.js"), "utf8");
const minSrc = fs.readFileSync(path.join(__dirname, "../app/api/minutes-typos/route.js"), "utf8");
check("fix-typos: フィルタ適用＋プロンプト禁止事項", fixSrc.includes("filterDangerousCorrections(parsed.corrections)") && fixSrc.includes("CORRECTION_PROMPT_GUARD"));
check("minutes-typos: フィルタ適用＋プロンプト禁止事項", minSrc.includes("filterDangerousCorrections(allCorrections)") && minSrc.includes("CORRECTION_PROMPT_GUARD"));
check("プロンプト禁止事項の文言（拡張置換・見逃し優先）", libCtx.CORRECTION_PROMPT_GUARD.includes("語尾や注記を足すだけの置換") && libCtx.CORRECTION_PROMPT_GUARD.includes("見逃しを優先"));
check("dictAddEntry: 登録時警告confirm（突破可）", /dictAddEntry=\(from,to\)=>\{const danger=isDangerousCorrection\(from,to\);/.test(src) && src.includes("本当に辞書へ登録しますか？"));
check("applyAllTypos: 一括登録にも同ガード", src.includes("const toRegister=applied.filter(([f,to])=>{const danger=isDangerousCorrection(f,to)"));
check("page.js が共通フィルタを import", /import \{ isDangerousCorrection[^}]*\} from "\.\/lib\/dangerous-correction"/.test(src));
check("console.info で抑制ログ（無言で捨てない）", libSrc.includes("console.info(`危険候補を抑制:") && src.includes("console.info(`危険候補を抑制:"));

// --- 9. ノイズスキャンの汚染ガード（指示書 noise-scan-contamination-guard） ---
console.log("■ ノイズ削除候補ガード isDangerousNoisePattern");
const { isDangerousNoisePattern, filterDangerousNoiseCandidates } = libCtx2();
function libCtx2() {
  return new Function(libSrc.replace(/^export /gm, "") + "; return { isDangerousNoisePattern, filterDangerousNoiseCandidates, NOISE_PROMPT_GUARD };")();
}
// 危険な削除候補（医療内容を含む文）は除外される
check("薬剤名を含む文を弾く（ヒルドイドを塗って…）", !!isDangerousNoisePattern("かゆみが強いのでヒルドイドを塗ってください"));
check("症状語を含む文を弾く（湿疹）", !!isDangerousNoisePattern("湿疹が悪化しています"));
check("部位語を含む文を弾く（背中）", !!isDangerousNoisePattern("背中に赤いのができて"));
check("処置語を含む文を弾く（液体窒素）", !!isDangerousNoisePattern("液体窒素で焼きましょう"));
check("2文字以下を弾く（部分一致で大量削除）", !!isDangerousNoisePattern("うん") && !!isDangerousNoisePattern("は"));
check("日常語そのものを弾く（ただ）", !!isDangerousNoisePattern("ただ"));
// 正当なノイズ（相槌連発・広告文・型番羅列・動画フレーズ）は通る
check("動画フレーズは通る（次の映像でお会いしましょう）", isDangerousNoisePattern("次の映像でお会いしましょう") === null);
check("相槌連発は通る（うんうんうんうん）", isDangerousNoisePattern("うんうんうんうん") === null);
check("広告文は通る（今なら送料無料）", isDangerousNoisePattern("今なら送料無料でお届けします") === null);
check("型番羅列は通る（A-123 B-456）", isDangerousNoisePattern("A-123 B-456 C-789") === null);
check("チャンネル登録系は通る", isDangerousNoisePattern("チャンネル登録よろしくお願いします") === null);
// candidates 配列レベルのフィルタ
const noiseFiltered = filterDangerousNoiseCandidates([
  { text: "ご視聴ありがとうございました", reason: "動画由来" },
  { text: "ステロイドは怖くないですよ", reason: "誤検出(医療内容)" },
  { text: "うん", reason: "短すぎ" },
]);
check("filterDangerousNoiseCandidates: 医療文・短文を除外し正当ノイズは温存", noiseFiltered.length === 1 && noiseFiltered[0].text === "ご視聴ありがとうございました");

console.log("■ ノイズガードの全経路への適用");
const noiseSrc = fs.readFileSync(path.join(__dirname, "../app/api/scan-noise/route.js"), "utf8");
check("scan-noise: フィルタ適用＋プロンプト禁止事項", noiseSrc.includes("filterDangerousNoiseCandidates(filtered)") && noiseSrc.includes("NOISE_PROMPT_GUARD"));
check("プロンプト禁止事項の文言（医療用語・誤削除より見逃し）", libCtx2().NOISE_PROMPT_GUARD.includes("医療用語・薬剤名・症状の記述を含む文を削除候補にしない") && libCtx2().NOISE_PROMPT_GUARD.includes("誤削除より見逃しを優先"));
check("addNoisePattern: 登録時警告confirm（突破可）", src.includes("const danger=isDangerousNoisePattern(p)") && src.includes("本当に登録しますか？"));
check("page.js が isDangerousNoisePattern を import", src.includes('import { isDangerousCorrection, isDangerousNoisePattern } from "./lib/dangerous-correction"'));
check("scan-noise は失敗を500で返す（成功偽装なし）", noiseSrc.includes('{ candidates: [], error: "ノイズAI呼び出しに失敗しました" }, { status: 500 }'));
check("BtnFb: 履歴ノイズスキャンに接続", src.includes('btnFbSet("histNoise","run"') && src.includes('<BtnFb k="histNoise"/>'));
check("BtnFb: 設定ノイズスキャンに接続", src.includes('btnFbSet("noiseScan","run"') && src.includes('<BtnFb k="noiseScan"/>'));
check("日次ノイズスキャン: 部分チャンク失敗を可視化", src.includes("チャンク失敗"));

console.log(`\n結果: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
