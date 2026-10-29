// Whisper 応答テキストのハルシネーション除去（/api/transcribe の後処理専用）
// 2026-10-29 院長承認の設計（指示書 transcript-filter-and-repeat-guard / filter-decision-and-page-js）:
//   - 判定単位は「1文」。当たった文だけを取り除き、同じチャンクの残りの文は返す（旧: 1語でも当たるとチャンク全体を破棄）
//   - ① PHRASE  : 文からパターン部分を取り除いた残りが「空白・句読点・敬語の語尾」だけなら、その文を消す
//   - ② CONTAINS: 診察で発話されない動画・字幕・英語の定型語。その語を含む文を消す
//   - ③ FILLER  : 相づち・記号だけ。チャンク全体（または残った文すべて）がこれだけのときに限り空にする
//   - 除去の記録はパターン番号と文字数のみ（本文はサーバに残さない）
//   - fail-open: 例外時は無加工の応答テキストを返す（filterTranscript 側で保証）

// ① 文全体一致（パターン部分を除いた残りが ALLOWED_REST だけなら消す）
export const PHRASE_RULES = [
  ["P1", /ご視聴ありがとうございま(?:す|した)/],
  ["P2", /ご覧いただきありがとうございま(?:す|した)/], // 旧/ご覧いただ/。「ご覧いただけますか」を消さないため絞る
  ["P3", /高評価(?:を)?(?:よろしく)?お願い/],
  ["P4", /良い(?:1|一)日を(?:お過ごしください)?/],
  ["P5", /本日はご覧いただきありがとうございま(?:す|した)/],
  ["P6", /お疲れ様でした/],
  ["P7", /それではまた/],
  ["P8", /バイバイ/],
  ["P9", /See you/i],
  ["P10", /ご覧.*ありがとう/],
  ["P11", /ありがとうございました/],
  ["P12", /本当にありがとう/],
  ["P13", /また会いましょう/],
  ["P14", /お楽しみに/],
  ["P15", /よろしくお願い/],
  ["P16", /お元気で/],
  ["P17", /さようなら/],
  ["P18", /おやすみなさい/],
  ["P19", /こんにちは/],
  ["P20", /どうもありがとう/],
  ["P21", /見てくれてありがとう/],
  ["P22", /ありがとうございます/],
  ["P23", /ありがとうございました/],
  ["P24", /どうもありがとうございます/],
  ["P25", /聴いてくれてありがとう/],
  ["P26", /聞いてくれてありがとう/],
  ["P27", /応援ありがとう/],
  ["P28", /いつもありがとう/],
  ["P29", /以上です/],
  ["P30", /終わります/],
  ["P31", /それでは失礼/],
  ["P32", /失礼します/],
  ["P33", /よろしくお願いいたします/],
  ["P34", /どうぞよろしく/],
  ["P35", /次回もよろしく/],
  ["P36", /またお会いしましょう/],
  ["P37", /またね/],
  ["P38", /じゃあね/],
  ["P39", /ではでは/],
  ["P40", /お楽しみに/],
  ["P41", /行ってらっしゃい/],
  ["P42", /お気をつけて/],
  ["P43", /お大事に/],
  ["P44", /お元気で/],
];
// ① の「残り」として許すもの: 空白・句読点・記号と、敬語・終助詞の語尾だけ
const PUNCT = /[\s、。，．,.！!？?…・ー〜~「」『』（）()]/g;
const ALLOWED_REST = /^(?:お願いいたします|お願いします|いたします|します|して|ください|くださいね|ございます|ございました|です|でした|ます|ました|ね|よ|な|ぁ|ねぇ)*$/;

// ② 部分一致（その語を含む文を消す）
export const CONTAINS_RULES = [
  ["C1", /最後までご視聴/], ["C2", /チャンネル登録/], ["C3", /グッドボタン/], ["C4", /ご清聴ありがとう/],
  ["C5", /Thank you for watching/i], ["C6", /Thanks for watching/i], ["C7", /Please subscribe/i], ["C8", /ぶひろ/],
  ["C9", /字幕.*設定/], ["C10", /翻訳.*字幕/], ["C11", /視聴.*ありがとう/], ["C12", /はじめしゃちょー/],
  ["C13", /チャンネル.*登録/], ["C14", /サブスクライブ/], ["C15", /字幕/], ["C16", /ご視聴ありがとう/],
  ["C17", /happens with most of the/i], ["C18", /most of the drugs/i], ["C19", /with most of/i], ["C20", /that's all for/i],
  ["C21", /see you next time/i], ["C22", /see you in the next/i], ["C23", /stay safe everyone/i], ["C24", /take care everyone/i],
  ["C25", /have a good/i], ["C26", /thanks for listening/i], ["C27", /thank you for listening/i], ["C28", /i'll see you/i],
  ["C29", /we'll see you/i], ["C30", /don't forget to/i], ["C31", /make sure to/i], ["C32", /if you enjoyed/i],
  ["C33", /if you liked/i], ["C34", /let me know in the comments/i], ["C35", /in the comments below/i], ["C36", /click the link/i],
  ["C37", /check out/i],
];

// ③ 相づち・記号だけ（チャンク全体、または残った文すべてがこれだけのときに限り空にする）
export const FILLER_RULES = [
  ["F1", /^草$/], ["F2", /^ｗ+$/], ["F3", /^w+$/i], ["F4", /^[\s]*[【\[（\(].+[】\]）\)][\s]*$/], ["F5", /^[\s]*＊.+$/],
  ["F6", /^\s*\.\s*$/], ["F7", /^[\s\.]+$/], ["F8", /^[あーうーえーおー\s]+$/], ["F9", /^[アーウーエーオー\s]+$/],
  ["F10", /^ん[ー～\s]*$/], ["F11", /^はい[。、\s]*$/], ["F12", /^うん[。、\s]*$/], ["F13", /^えー+[。、\s]*$/],
  ["F14", /^まあ[。、\s]*$/], ["F15", /^なるほど[。、\s]*$/], ["F16", /^そうですね[。、\s]*$/],
  ["F17", /^\[?silence\]?$/i], // 旧 /^[silence]/i は文字クラスで s/i/l/e/n/c 始まりの文に当たっていた
  ["F18", /^\[.*\]$/], ["F19", /^\(.*\)$/], ["F20", /^♪.*♪$/], ["F21", /^♫.*$/],
  ["F22", /music playing/i], ["F23", /background music/i], ["F24", /\[音楽\]/], ["F25", /\[拍手\]/], ["F26", /\[笑い\]/], ["F27", /\[無音\]/],
];

// 文に分ける。区切り: 。！？!? の後ろ／日本語に接する空白（英文の単語間の空白では切らない）
// 戻り値は [{s:文, sep:直後の区切り空白}]。s+sep を順に連結すると元のテキストに戻る
const isAscii = (c) => /[\x21-\x7E]/.test(c || "");
const END = /[。！？!?]/;
export function splitSentences(text) {
  const out = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) {
      if (!buf) { if (out.length) out[out.length - 1].sep += c; else out.push({ s: "", sep: c }); continue; }
      if (isAscii(buf.slice(-1)) && isAscii(text[i + 1])) { buf += c; continue; } // 英文の単語間
      let sep = c;
      while (i + 1 < text.length && /\s/.test(text[i + 1])) sep += text[++i];
      out.push({ s: buf, sep }); buf = "";
      continue;
    }
    buf += c;
    if (END.test(c) && !END.test(text[i + 1] || "")) { out.push({ s: buf, sep: "" }); buf = ""; }
  }
  if (buf) out.push({ s: buf, sep: "" });
  return out.filter((x) => x.s || x.sep);
}

const matchPhrase = (s) => {
  for (const [id, re] of PHRASE_RULES) {
    if (!re.test(s)) continue;
    const rest = s.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"), "").replace(PUNCT, "");
    if (ALLOWED_REST.test(rest)) return id;
  }
  return null;
};
const matchContains = (s) => { for (const [id, re] of CONTAINS_RULES) if (re.test(s)) return id; return null; };
const matchFiller = (s) => { const t = s.trim(); for (const [id, re] of FILLER_RULES) if (re.test(t)) return id; return null; };

// 本体（例外はそのまま投げる。fail-open は filterTranscript が担う）
export function filterTranscriptCore(text) {
  const raw = typeof text === "string" ? text : "";
  const dropped = [];
  const whole = matchFiller(raw);
  if (whole) return { text: "", dropped: [{ rule: whole, len: raw.length }] };
  const kept = [];
  for (const seg of splitSentences(raw)) {
    const id = matchContains(seg.s) || matchPhrase(seg.s);
    if (id) { dropped.push({ rule: id, len: seg.s.length }); continue; }
    kept.push(seg);
  }
  let out = kept.map((k) => k.s + k.sep).join("").trim();
  // 残った文がすべて③の相づち・記号だけなら空（旧「5文字以下は空」を置き換え）
  const keptText = kept.filter((k) => k.s.trim());
  if (keptText.length && keptText.every((k) => matchFiller(k.s))) {
    dropped.push({ rule: "FILLER_ONLY", len: out.length });
    out = "";
  }
  // 同じ短いフレーズの繰り返し（種類が3割以下）は Whisper のループとして空にする（従来どおり）
  const words = out.split(/[。、\s]+/).filter((w) => w.length > 0);
  if (words.length >= 3) {
    const unique = new Set(words);
    if (unique.size <= Math.ceil(words.length * 0.3)) { dropped.push({ rule: "REPEAT", len: out.length }); out = ""; }
  }
  return { text: out, dropped };
}

// fail-open ラッパ: フィルタの失敗で書き起こしが消えることがないよう、例外時は無加工で返す
// core は単体テストで例外を注入するための差し替え口（本番は既定値のみ）
export function filterTranscript(text, core = filterTranscriptCore) {
  try {
    return core(text);
  } catch (e) {
    console.error("[transcript-filter] 例外のため無加工で返す:", e);
    return { text: typeof text === "string" ? text : "", dropped: [], failOpen: true };
  }
}
