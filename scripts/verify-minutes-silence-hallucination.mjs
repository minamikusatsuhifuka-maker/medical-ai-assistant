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

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("── 現状の通り抜け（§1 調査用。assert はしない）");
  for (const t of [...HALLUCINATED, ...REAL]) {
    const out = pipeline(t);
    console.log(`${out === t ? "通過" : out ? "一部" : "除去"}  「${t}」 → 「${out}」`);
  }
}
