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
import { filterNoiseCore } from "../app/lib/noise-filter.js";
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
  console.log(`\n✅ ${pass} 件すべて PASS`);
}
