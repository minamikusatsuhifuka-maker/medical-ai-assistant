// 検証: 辞書置換 A＋B（app/lib/dict-apply.js）の単体 assert
// 実行: node scripts/verify-dict-apply.mjs [Supabase辞書のJSON]
//   第1引数を省略すると page.js の既定辞書(DEFAULT_DICT)だけで検証する。
//   Supabase の dictionary を [{from_text,to_text}] の JSON で渡すと、アプリと同じ「Supabase＋既定辞書の残り」をつないだ実効辞書でも検証する
import fs from "node:fs";
import { buildDictMatcher, applyDictOnce, applyDictSafe } from "../app/lib/dict-apply.js";
import { DRUG_MASTER } from "../app/lib/drug-master.js";

const src = fs.readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const a = src.indexOf("const DEFAULT_DICT=[");
const DEFAULT_DICT = eval(src.slice(src.indexOf("[", a), src.indexOf("];", a) + 1));
const dicts = [["既定辞書", DEFAULT_DICT]];
if (process.argv[2]) {
  const sb = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).map((r) => [r.from_text, r.to_text]);
  const localOnly = DEFAULT_DICT.filter(([f]) => !sb.some(([sf]) => sf === f));
  dicts.push([`実効辞書(Supabase ${sb.length}件＋既定の残り ${localOnly.length}件)`, [...sb, ...localOnly]]);
}

let pass = 0;
const eq = (got, want, msg) => {
  if (got !== want) { console.error(`❌ ${msg}\n   期待: ${JSON.stringify(want)}\n   実際: ${JSON.stringify(got)}`); process.exit(1); }
  pass++; console.log("  ✓ " + msg);
};

for (const [label, dict] of dicts) {
  console.log(`\n══ ${label}: ${dict.length}件`);
  const m = buildDictMatcher(dict);
  const ap = (t) => applyDictOnce(t, m);

  console.log("── 指示書のケース");
  eq(ap("ステロイドの塗り薬"), "ステロイド外用薬の塗り薬", "「ステロイドの塗り薬」→「ステロイド外用薬の塗り薬」（2重にならない）");
  eq(ap("すてろいどを塗ってください"), "ステロイド外用薬を塗ってください", "ひらがなの「すてろいど」も1回だけ置換");
  eq(ap("ステロイド外用薬を塗ってください"), "ステロイド外用薬を塗ってください", "すでに「ステロイド外用薬」ならそのまま");
  eq(ap("アクアチムクリームを塗ってください"), "アクアチムクリームを塗ってください", "「アクアチムクリームを塗ってください」→そのまま（クリームクリームにならない）");
  eq(ap("ゼビアックスローションに変えます").includes("ローションローション"), false, "「ゼビアックスローション」→2重にならない");
  eq(ap("プロペトを塗って").includes("（白色白色") || ap("プロペト（白色ワセリン）を塗って").includes("）（"), false, "「プロペト」→2重にならない");

  console.log("── 後ろに語を補う組の直後の6形（を・は・、・。は補う／塗・外用は補わない＝許容済みの副作用）");
  for (const [base, full] of [["アクアチム", "アクアチムクリーム"], ["ベピオ", "ベピオゲル"]]) {
    if (ap(base + "を") === base + "を") { console.log(`   （${label} に「${base}→${full}」がないため省略）`); continue; }
    for (const tail of ["を", "は", "、", "。"]) eq(ap(`${base}${tail}`), `${full}${tail}`, `「${base}${tail}」→「${full}${tail}」（補う）`);
    eq(ap(`${base}塗ってます`), `${base}塗ってます`, `「${base}塗ってます」→そのまま（直後が漢字のため補わない）`);
    eq(ap(`${base}外用で`), `${base}外用で`, `「${base}外用で」→そのまま（直後が漢字のため補わない）`);
  }

  console.log("── 冪等（同じ文を2回通しても結果が変わらない）");
  const samples = ["ステロイドの塗り薬を出しておきます", "アクアチムを出します", "アクアチムクリームを出します", "ゼビアックスローションに変えます", "プロペトを塗って",
    "ディフェリンゲルとベピオゲルを併用", "液体窒素で焼きます", "エキシマライトを当てます", "かゆみ止めを出します", ...dict.map(([, t]) => String(t || "")).filter(Boolean)];
  let notIdem = [];
  for (const s of samples) { const o = ap(s); if (ap(o) !== o) notIdem.push([s, o, ap(o)]); }
  if (notIdem.length) console.log("   冪等でない例（辞書データの連鎖 A→B, B→C）:", JSON.stringify(notIdem.slice(0, 8)));
  eq(notIdem.filter(([s, o, o2]) => /(.{2,})\1/.test(o2) && !/(.{2,})\1/.test(o)).length, 0, `2回通しても語が2重にならない（${samples.length}文）`);

  console.log("── 薬剤マスタ132剤を正式名で通す");
  eq(DRUG_MASTER.length, 132, "薬剤マスタは132剤");
  let changed = [], broken = [];
  for (const d of DRUG_MASTER) {
    const o = ap(d.name);
    if (o !== d.name) changed.push([d.name, o]);
    if (!o.includes(d.name) || ap(o) !== o || /(ローション|クリーム|ゲル|軟膏|外用薬|ワセリン){2,}/.test(o)) broken.push([d.name, o]);
  }
  if (changed.length) console.log("   正式名に補記が付いた剤（壊れてはいない）:", JSON.stringify(changed));
  eq(broken.length, 0, `132剤とも壊れない（正式名が残る・2回通しても同じ・剤形の2重なし）${broken.length ? " 壊れた: " + JSON.stringify(broken) : ""}`);
  const changedInSentence = DRUG_MASTER.filter((d) => !ap(`今日は${d.name}を出します`).includes(d.name));
  eq(changedInSentence.length, 0, "文の中に置いても132剤とも正式名が残る");
}

console.log("\n── 置換前＝置換後の行は守り（その語の中に短い語が当たらない・言ったとおりに残す）");
{
  const g = buildDictMatcher([["ミチーガ", "ミチーガ"], ["ミチ", "道"], ["わせりん", "白色ワセリン"], ["サリチル酸ワセリン", "サリチル酸ワセリン"]]);
  eq(applyDictOnce("ミチーガを試す", g), "ミチーガを試す", "「ミチーガ→ミチーガ」があれば中の「ミチ」は置換されない");
  eq(applyDictOnce("ひるどいどを", buildDictMatcher([["ヒルドイド", "ヒルドイド"], ["ひるどいど", "ヒルドイド"]])), "ヒルドイドを", "守りは書いたとおりの形だけ（同じ語のかな違いの置換は従来どおり効く）");
  eq(applyDictOnce("プロペトを", buildDictMatcher([["プロペト", "プロペト"], ["プロペト", "プロペト（白色ワセリン）"]])), "プロペト（白色ワセリン）を", "同じ語にほかの置換があれば守りより優先（並び順によらず従来の結果）");
  eq(applyDictOnce("サリチル酸ワセリンを塗る", g), "サリチル酸ワセリンを塗る", "「サリチル酸ワセリン」の中の「ワセリン」は白色ワセリンにならない");
  eq(applyDictOnce("ワセリンを塗る", g), "白色ワセリンを塗る", "守りの外の「ワセリン」は従来どおり置換");
  eq(applyDictOnce("ミチの先", buildDictMatcher([["ミチ", "道"]])), "道の先", "守りがなければ従来どおり");
}

console.log("\n── 2段の連鎖の解決（辞書を組む時点で最終形まで。適用は1回）");
{
  const chainDict = [["メピオ", "ベピオ"], ["ベピオ", "ベピオゲル"], ["冷たいチーズ", "液体窒素"], ["液体窒素", "液体窒素凍結療法"], ["ネクティ", "ニキビ"], ["ニキビ", "ざ瘡"],
    ["あああ", "いいい"], ["いいい", "ううう"], ["ううう", "あああ"]];
  const m = buildDictMatcher(chainDict);
  eq(applyDictOnce("メピオを塗って", m), "ベピオゲルを塗って", "メピオ → ベピオゲル（2段目までたどる）");
  eq(applyDictOnce("冷たいチーズで焼きます", m), "液体窒素凍結療法で焼きます", "冷たいチーズ → 液体窒素凍結療法");
  eq(applyDictOnce("ネクティがあります", m), "ざ瘡があります", "ネクティ → ざ瘡");
  eq(applyDictOnce("メピオローションに変更", m), "ベピオローションに変更", "直後が名前の続きなら、後ろに語を補う組はたどらない（ベピオゲルローションにならない）");
  eq(applyDictOnce("あああ", m), "いいい", "循環（あああ→いいい→ううう→あああ）はたどらず1段のまま");
  eq(m.report.cycles.length > 0, true, "循環は report.cycles に記録される");
  const o = applyDictOnce("メピオを塗って", m);
  eq(applyDictOnce(o, m), o, "連鎖解決後も2回通して変わらない（冪等）");
  const deep = buildDictMatcher([["a1x", "a2x"], ["a2x", "a3x"], ["a3x", "a4x"], ["a4x", "a5x"], ["a5x", "a6x"], ["a6x", "a7x"], ["a7x", "a8x"]]);
  eq(deep.report.depthLimit.length > 0, true, "深さ上限（5段）に当たった組は report.depthLimit に記録され1段のまま");
  eq(applyDictOnce("a1x", deep), "a2x", "深さ上限に当たった組は1段のまま");
  eq(applyDictOnce("メピオを", buildDictMatcher(chainDict, { resolveChains: false })), "ベピオを", "resolveChains:false なら1段（解決処理で例外が出たときも同じ扱い）");
}

console.log("\n── fail-open・境界");
eq(applyDictSafe("診察の本文です", null), "診察の本文です", "辞書が空(matcher=null)なら無加工");
eq(applyDictSafe("診察の本文です", {}, () => { throw new Error("注入した例外"); }), "診察の本文です", "置換で例外 → 無加工で返す(fail-open)");
const m2 = buildDictMatcher([["イブ", "イボ"], ["ugh", "UGH"]]);
eq(applyDictOnce("ドライブに行きます。イブが痛い", m2), "ドライブに行きます。イボが痛い", "1〜2文字カタカナは前後がカタカナでないときだけ（ドライブは変えない）");
eq(applyDictOnce("UGH and ugh", buildDictMatcher([["abc", "ABC"]])), "UGH and ugh", "当たらない語は変えない");
eq(applyDictOnce("abc ABC Abc", buildDictMatcher([["abcd", "x"], ["abc", "エービーシー"]])), "エービーシー エービーシー エービーシー", "3文字以上の英字は大文字小文字を区別しない（旧実装と同じ）");

console.log(`\n✅ 全 ${pass} 件 PASS`);
