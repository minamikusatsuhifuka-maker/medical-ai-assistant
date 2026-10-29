// 検証: page.js 側の書き起こしノイズ除去（app/lib/noise-filter.js）の単体 assert
// 実行: node scripts/verify-noise-filter.mjs
import { filterNoiseCore, BUILTIN_NOISE_RULES } from "../app/lib/noise-filter.js";

let pass = 0;
const eq = (got, want, msg) => {
  if (got !== want) { console.error(`❌ ${msg}\n   期待: ${JSON.stringify(want)}\n   実際: ${JSON.stringify(got)}`); process.exit(1); }
  pass++; console.log("  ✓ " + msg);
};
const f = (t, reg = []) => filterNoiseCore(t, reg).text;

console.log("── 組み込み7件: その語を含む文だけ消す（行ごと消さない）");
eq(BUILTIN_NOISE_RULES.length, 7, "組み込みは7件");
const samples = {
  N1: "次の映像でお会いしましょう。", N2: "ご視聴ありがとうございました。", N3: "チャンネル登録お願いします。", N4: "高評価とチャンネルをよろしく。",
  N5: "Please subscribe!", N6: "See you next time!", N7: "次回もよろしくお願いします、チャンネルも。",
};
for (const [id, re] of BUILTIN_NOISE_RULES) {
  const s = samples[id];
  eq(re.test(s), true, `${id} ${re} はサンプル「${s}」に当たる`);
  eq(f(`${s} 二週間前から首が痒いです。`), "二週間前から首が痒いです。", `${id} 当たった文だけ消え、同じ行の会話は残る`);
}
eq(f("ご視聴ありがとうございました。"), "", "組み込みに当たる文しかない行は空");
eq(f("次回もよろしくお願いします。"), "次回もよろしくお願いします。", "N7 はチャンネルを含まなければ当たらない（診察の挨拶は残る）");

console.log("── 登録語: その語だけを取り除き、文の残りは必ず残す");
eq(f("えーっと、かゆいんです", ["えーっと"]), "、かゆいんです", "「えーっと」だけ除き、文の残りは残す");
eq(f("えーっと。 背中が痒いです。", ["えーっと"]), "背中が痒いです。", "語を除いて句読点だけになった文は消す");
eq(f("えーっと", ["えーっと"]), "", "行が語だけなら空（残りが句読点・空白だけ）");
eq(f("あのー、えーっと、ステロイドを塗ってます", ["えーっと", "あのー"]), "、、ステロイドを塗ってます", "複数の登録語をそれぞれ語だけ除く");
eq(f("かゆみは続いています", ["かゆ"]), "みは続いています", "登録語が医療語の一部でも行ごとは消さない（語だけ除く）");
eq(f("一行目です。\nえーっと\n三行目です。", ["えーっと"]), "一行目です。\n三行目です。", "複数行: 語だけの行は消え、他の行はそのまま");
eq(f("長い語えーっとね", ["えーっと", "えー"]), "長い語ね", "長い語を先に除く（短い語が長い語の一部を先に削らない）");
eq(f("普通の会話です", [null, "", "  "]), "普通の会話です", "空・null の登録語は無視");

console.log("── 記録（本文・登録語を含まない）");
const r = filterNoiseCore("ご視聴ありがとうございました。 えーっと、痒いです", ["あのー", "えーっと"]);
eq(JSON.stringify(r.dropped), JSON.stringify([{ rule: "N2", len: 15 }, { rule: "U2", len: 4 }]), "dropped はパターン番号（N1〜/U1〜）と文字数だけ");
eq(JSON.stringify(r.dropped).includes("えーっと"), false, "登録語そのものは記録に含まれない");

console.log(`\n✅ 全 ${pass} 件 PASS`);
