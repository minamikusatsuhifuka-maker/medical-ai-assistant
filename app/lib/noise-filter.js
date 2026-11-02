// 書き起こしのクライアント側ノイズ除去（page.js の filterTranscriptNoise の本体）
// 2026-10-29 院長承認の設計（指示書 filter-decision-and-page-js / noise-filter-and-dict-decision）:
//   - 組み込み7件（動画配信の定型句）: その語を含む「文」だけを消す（旧: 行=チャンクごと破棄）
//   - 利用者が登録したノイズ語: その「語」だけを取り除き、文の残りは必ず残す。
//     取り除いた結果が句読点・空白だけになった文に限り、その文を消す
//   - 動画の決まり文句（transcript-filter の ① P45〜P50）は文ごと消す（2026-11-02 追加）
//   - 行（チャンク）ごと消すことはしない
//   - 記録はパターン番号と文字数のみ（本文・登録語そのものは返さない）
//   - 例外時の fail-open は呼び出し側（page.js）が担う
import { splitSentences, matchVideoPhrase } from "./transcript-filter.js";

export const BUILTIN_NOISE_RULES = [
  ["N1", /次の映像でお会いしましょう/],
  ["N2", /ご視聴ありがとう/],
  ["N3", /チャンネル登録/],
  ["N4", /高評価.*チャンネル/],
  ["N5", /subscribe/i],
  ["N6", /see you next time/i],
  ["N7", /次回もよろしく.*チャンネル/],
];
const ONLY_PUNCT = /^[\s、。，．,.！!？?…・ー〜~「」『』（）()]*$/;

export function filterNoiseCore(text, registered = []) {
  const raw = typeof text === "string" ? text : "";
  const dropped = [];
  if (!raw.trim()) return { text: "", dropped };
  // 登録語: 重複を除き、長い語から取り除く（短い語が長い語の一部を先に削らないように）。番号は登録一覧での位置(U1〜)
  const list = Array.isArray(registered) ? registered.map((w) => String(w == null ? "" : w).trim()) : [];
  const words = [...new Set(list.filter(Boolean))].sort((a, b) => b.length - a.length);
  const lines = [];
  for (const line of raw.split("\n")) {
    let kept = "";
    for (const seg of splitSentences(line)) {
      let s = seg.s;
      if (s) {
        const hit = BUILTIN_NOISE_RULES.find(([, re]) => re.test(s));
        if (hit) { dropped.push({ rule: hit[0], len: s.length }); continue; }
        // 動画の決まり文句（①の P45〜P50 と同じ判定）。Avalon・Gemini はサーバのフィルタを通らないため、ここでも見る
        const video = matchVideoPhrase(s);
        if (video) { dropped.push({ rule: video, len: s.length }); continue; }
        for (const w of words) {
          if (!s.includes(w)) continue;
          const before = s.length;
          s = s.split(w).join("");
          dropped.push({ rule: "U" + (list.indexOf(w) + 1), len: before - s.length });
        }
        if (s !== seg.s && ONLY_PUNCT.test(s)) continue; // 語を除いたら句読点・空白だけ → その文を消す
      }
      kept += s + seg.sep;
    }
    lines.push(kept.trim());
  }
  return { text: lines.filter((l) => l).join("\n").trim(), dropped };
}

// §3 同じ文の繰り返しだけのチャンクを落とす（2026-11-02・指示書 minutes-silence-hallucination）
// 無音のハルシネーションは同じ文が何度も出るのが特徴。パターンに無い文句にも効く。
//   - 直前3チャンク（書き起こしが返ってきたチャンク）以内に同じ文（空白・句読点を除いて比較）が2回以上出ていて、
//   - かつ、そのチャンクの中身がその文だけ（同じ文の繰り返しを含む）のとき → そのチャンクを落とす
//   - 他に内容があるチャンクは落とさない。6文字未満の文には適用しない。最初のチャンク（履歴なし）には適用しない
//   - recent は呼び出し側が持つ直前のチャンクの文字列（落としたチャンクも含める）。例外は呼び出し側で fail-open
export const REPEAT_CHUNK_WINDOW = 3;
export const REPEAT_CHUNK_MIN_LEN = 6;
const SENT_PUNCT = /[\s、。，．,.！!？?…・〜~「」『』（）()]/g;
const sentenceKeys = (text) => String(text || "").split("\n")
  .flatMap((line) => splitSentences(line).map((x) => x.s.replace(SENT_PUNCT, "")))
  .filter(Boolean);
export function repeatChunkCheck(text, recent = []) {
  const keys = sentenceKeys(text);
  if (!keys.length) return { drop: false };
  const uniq = [...new Set(keys)];
  if (uniq.length !== 1) return { drop: false }; // 他に内容がある
  const key = uniq[0];
  if (key.length < REPEAT_CHUNK_MIN_LEN) return { drop: false };
  const prev = (Array.isArray(recent) ? recent : []).slice(-REPEAT_CHUNK_WINDOW);
  let count = 0;
  for (const c of prev) for (const k of sentenceKeys(c)) if (k === key) count++;
  return count >= 2 ? { drop: true, rule: "REPEAT_CHUNK", len: String(text).trim().length } : { drop: false };
}
