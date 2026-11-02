// 検証: 議事録の無音区間に出る動画の決まり文句（2026-11-02 の議事録で実際に出た文）
// 経路: Whisper → /api/transcribe の filterTranscript（①②③）→ page.js の filterTranscriptNoise（組み込み7件＋登録語）
// 実行: node scripts/verify-minutes-silence-hallucination.mjs
//
// §1 調査（2026-11-02）: 11/02 の議事録はすべて Whisper（/api/transcribe・context=transcribe-minutes）で、
// サーバのフィルタ（transcribe-filter のログ 166 件）もクライアントのフィルタ（transcribe-noise-client のログ N1）も通っていた。
// 通っていたのに残ったのは、決まり文句がどのパターンにも当たらない言い回しだったため。
//   - 組み込み N1 は「次の『映像』でお会いしましょう」で、「次の『動画』で」には当たらない
//   - C1「最後までご視聴」は「最後まで視聴して」（ご なし）に当たらない
//   - P2「ご覧いただきありがとうございます」は当たるが、①は残りが敬語の語尾だけのときに限るため「最後まで」が残って消えない
import { filterTranscriptCore } from "../app/lib/transcript-filter.js";
import { filterNoiseCore, repeatChunkCheck, REPEAT_CHUNK_WINDOW } from "../app/lib/noise-filter.js";
import { matchVideoPhrase } from "../app/lib/transcript-filter.js";

// 11/02 の議事録（11:15・13:00）の書き起こしに実際に出た行
export const HALLUCINATED = [
  "最後まで視聴してくださって",
  "最後まで視聴してくださって 次の動画で会いましょう!",
  "次の動画でお会いしましょう。",
  "次の動画でしばらくお会いしましょう。",
  "最後まで視聴してくださって 次の動画でまた会いましょう!",
  "最後までご覧いただきありがとうございます。 購読していいねとコメントお願いします。",
];
// 同じ議事録の実際の会話（「動画」「ご覧」を含むが残すべき行）
export const REAL = [
  "あとちょっと動画見たりとかね そんなのもしていきたいなと思ってたりとか あと在庫のことはもう",
  "いつになったら良いかもしれませんが、 これらの動画を通常に見てもらいたいなと思いました。",
  "結構激しい一応ですね 後の動画もありますし そのバランスなんですね 日本人の方に合わない方も",
  "あと5分くらいで終わります",
  "こちらをご覧ください。",
];

export const pipeline = (t) => filterNoiseCore(filterTranscriptCore(t).text, []).text;

let pass = 0;
const eq = (got, want, msg) => {
  if (got !== want) { console.error(`❌ ${msg}\n   期待: ${JSON.stringify(want)}\n   実際: ${JSON.stringify(got)}`); process.exit(1); }
  pass++; console.log("  ✓ " + msg);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("── §2 動画の決まり文句（①P45〜P50）: 11/02 に出た行は消える");
  for (const t of HALLUCINATED) eq(pipeline(t), "", `サーバ＋page.js で消える「${t}」`);
  for (const t of HALLUCINATED) eq(filterNoiseCore(t, []).text, "", `page.js だけ（Avalon・Gemini の経路）でも消える「${t}」`);
  console.log("── §2 実際の会話は残る");
  for (const t of REAL) eq(pipeline(t), t, `残る「${t}」`);
  eq(pipeline("次の動画でお会いしましょう。 あと5分くらいで終わります"), "あと5分くらいで終わります", "同じチャンクの実際の会話は残る（決まり文句の文だけ消える）");
  console.log("── §2 句で判定（語単体では消さない）");
  for (const t of [
    "動画を最後まで視聴してください。", "最後まで視聴した方がいいですね。", "登録をお願いします。", "ご覧ください。",
    "次の動画で説明します。", "いいねと思います。", "コメントお願いします。", "購読料が上がりました。",
    "最後までご覧いただいて、質問があれば聞いてください。", "高評価でした。",
  ]) {
    eq(matchVideoPhrase(t), null, `①の動画系に当たらない「${t}」`);
    eq(pipeline(t), t, `残る「${t}」`);
  }
  eq(matchVideoPhrase("最後までご覧いただきありがとうございました。"), "P46", "お礼つきも消える（P46）");
  eq(matchVideoPhrase("高評価とチャンネル登録よろしくお願いします。"), "P50", "高評価とチャンネル登録（P50）");
  eq(matchVideoPhrase("チャンネルを購読してくださいね。"), "P48", "購読して（P48）");
  const r = filterNoiseCore("次の動画でお会いしましょう。 痒いです", []);
  eq(JSON.stringify(r.dropped), JSON.stringify([{ rule: "P47", len: 14 }]), "page.js の記録は番号と文字数だけ");

  console.log("── §3 同じ文の繰り返しだけのチャンクを落とす");
  // page.js の filterTranscriptNoise と同じ順（filterNoiseCore → repeatChunkCheck・履歴は落としたチャンクも含め直前3つ）
  const run = (chunks) => { let recent = []; const out = [];
    for (const c of chunks) { const t = filterNoiseCore(c, []).text; if (!t) continue;
      const rc = repeatChunkCheck(t, recent); recent = [...recent, t].slice(-REPEAT_CHUNK_WINDOW); if (!rc.drop) out.push(t); }
    return out; };
  const U = "会議を終了させていただきます";
  eq(JSON.stringify(run([U, U, U, U])), JSON.stringify([U, U]), "同じ文だけのチャンクは3回目から落ちる（未知の文句にも効く）");
  eq(JSON.stringify(run([U])), JSON.stringify([U]), "最初のチャンクには適用しない");
  eq(JSON.stringify(run([U, U, U + "。 " + U])), JSON.stringify([U, U]), "同じ文の繰り返しだけのチャンクも落ちる");
  eq(JSON.stringify(run([U, U, "あと5分くらいで終わります。 " + U])), JSON.stringify([U, U, "あと5分くらいで終わります。 " + U]), "他に内容があるチャンクは落とさない");
  eq(JSON.stringify(run(["そうですね", "そうですね", "そうですね"])), JSON.stringify(["そうですね", "そうですね", "そうですね"]), "6文字未満の文には適用しない");
  eq(JSON.stringify(run([U, "在庫の確認をお願いします", "次の議題に移ります", "シフトの件です", U])), JSON.stringify([U, "在庫の確認をお願いします", "次の議題に移ります", "シフトの件です", U]), "直前3チャンクより前の出現は数えない");
  eq(JSON.stringify(run([U + "。", U + "！", " " + U + " "])), JSON.stringify([U + "。", U + "！"]), "空白・句読点を除いて比較する（3回目は落ちる）");
  const conv = ["はい、わかりました。それでお願いします", "ではそれで進めましょう", "はい、わかりました。それでお願いします",
    "来週の木曜日に決めます", "はい、わかりました。それでお願いします", "はい、わかりました。 了解です"];
  eq(JSON.stringify(run(conv)), JSON.stringify(conv), "同じ相づちを含む普通の会話は落ちない");
  eq(repeatChunkCheck(U, [U, U]).len, U.length, "記録は文字数とルール名だけ");
  eq(repeatChunkCheck(U, [U, U]).rule, "REPEAT_CHUNK", "ルール名 REPEAT_CHUNK");
  eq(repeatChunkCheck("", [U, U]).drop, false, "空のチャンクは対象外");
  eq(repeatChunkCheck(U, null).drop, false, "履歴が不正でも落とさない");
  console.log(`\n✅ ${pass} 件すべて PASS`);
}
