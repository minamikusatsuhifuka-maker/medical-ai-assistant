// 書き起こしのクライアント側ノイズ除去（page.js の filterTranscriptNoise の本体）
// 2026-10-29 院長承認の設計（指示書 filter-decision-and-page-js / noise-filter-and-dict-decision）:
//   - 組み込み7件（動画配信の定型句）: その語を含む「文」だけを消す（旧: 行=チャンクごと破棄）
//   - 利用者が登録したノイズ語: その「語」だけを取り除き、文の残りは必ず残す。
//     取り除いた結果が句読点・空白だけになった文に限り、その文を消す
//   - 行（チャンク）ごと消すことはしない
//   - 記録はパターン番号と文字数のみ（本文・登録語そのものは返さない）
//   - 例外時の fail-open は呼び出し側（page.js）が担う
import { splitSentences } from "./transcript-filter.js";

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
