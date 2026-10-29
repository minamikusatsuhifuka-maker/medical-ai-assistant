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

console.log("\n── fail-open・境界");
eq(applyDictSafe("診察の本文です", null), "診察の本文です", "辞書が空(matcher=null)なら無加工");
eq(applyDictSafe("診察の本文です", {}, () => { throw new Error("注入した例外"); }), "診察の本文です", "置換で例外 → 無加工で返す(fail-open)");
const m2 = buildDictMatcher([["イブ", "イボ"], ["ugh", "UGH"]]);
eq(applyDictOnce("ドライブに行きます。イブが痛い", m2), "ドライブに行きます。イボが痛い", "1〜2文字カタカナは前後がカタカナでないときだけ（ドライブは変えない）");
eq(applyDictOnce("UGH and ugh", buildDictMatcher([["abc", "ABC"]])), "UGH and ugh", "当たらない語は変えない");
eq(applyDictOnce("abc ABC Abc", buildDictMatcher([["abcd", "x"], ["abc", "エービーシー"]])), "エービーシー エービーシー エービーシー", "3文字以上の英字は大文字小文字を区別しない（旧実装と同じ）");

console.log(`\n✅ 全 ${pass} 件 PASS`);
