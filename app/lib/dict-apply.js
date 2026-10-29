// 辞書置換（page.js の applyDict の本体）。2026-10-29 院長承認の A＋B:
//   A: 全エントリを1つの正規表現にまとめ、長い語を優先して1回だけ置換する。置換した結果をもう一度走査しない
//      （旧: エントリごとに順番に置換し、前の置換結果に次のエントリが再び当たって「ステロイド外用薬外用薬」等になっていた）
//   B: 本文がすでに置換後の語（正式名）になっている箇所は置換しない（「アクアチムクリーム」→「…クリームクリーム」を防ぐ）
//      後ろに語を補う組（置換後が置換前で始まる。ベピオ→ベピオゲル 等）は、直後にカタカナ・漢字・英数字が続くとき
//      （＝「ベピオローション」「ダラシンカプセル」のように別の名前の一部）も置換しない
// 照合の仕方は旧実装と同じ:
//   - 3文字以上: そのまま／カタカナ化／ひらがな化のどれにも当たる。英字は大文字小文字を区別しない
//   - 1〜2文字のカタカナ語: 前後がカタカナでないときだけ（「イブ」が「ドライブ」の中で発火しない）
//   - それ以外の短い語: そのまま一致
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 96));
const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 96));
const ciAscii = (src) => src.replace(/[A-Za-z]/g, (c) => `[${c.toUpperCase()}${c.toLowerCase()}]`);
const KATA_ONLY = /^[ァ-ヶー]+$/;
// 名前の続きとみなす文字（カタカナ・長音・漢字・英数字・全角英数字・%）
const NAME_CONT = /[ァ-ヶー一-鿿々A-Za-z0-9０-９Ａ-Ｚａ-ｚ%％]/;
// 置換後が置換前（のかな違い）で始まる＝後ろに語を補う組（ベピオ→ベピオゲル 等）か
const extendsFrom = (lit, to) => { const T = toKata(to).toLowerCase(), F = toKata(lit).toLowerCase(); return T.length > F.length && T.startsWith(F); };

// 2段の連鎖の解決（2026-10-29 院長承認）: 辞書を組む時点で、各エントリの行き先を辞書で最終形までたどっておく。
// 適用は1回のまま（実行時に多段置換はしない）。例: メピオ→ベピオ、ベピオ→ベピオゲル なら メピオ の行き先を ベピオゲル にする
//   - 行き先は2通り持つ: 直後が名前の続きでないとき(toFree)／直後にカタカナ・漢字・英数字が続くとき(toCont)
//     （「メピオローション」が「ベピオゲルローション」にならないよう、後ろに語を補う組は名前の続きの前ではたどらない）
//   - 循環（A→B→…→A）・深さ上限（MAX_CHAIN段）に当たった組はたどらず1段のまま（report に記録）
//   - 解決処理で例外が出たら、全エントリ1段のままの辞書で動かす（fail-open）
const MAX_CHAIN = 5;
const CONT_SENTINEL = "々"; // NAME_CONT に含まれ、辞書の語にならない文字。「直後が名前の続き」の文脈を作るために末尾に足す

export function buildDictMatcher(dict, { resolveChains = true } = {}) {
  const base = buildBaseMatcher(dict);
  if (!base || !resolveChains) return base;
  try {
    const report = { cycles: [], depthLimit: [] };
    const memo = new Map();
    // to を辞書で最終形までたどる。null=循環・深さ上限（1段のまま使う）
    const resolve = (start, cont) => {
      const key = (cont ? "C:" : "F:") + start;
      if (memo.has(key)) return memo.get(key);
      const seen = [start];
      let cur = start, out = null;
      for (let d = 0; d < MAX_CHAIN; d++) {
        const next = cont ? stripSentinel(applyDictOnce(cur + CONT_SENTINEL, base, { chainStep: true })) : applyDictOnce(cur, base, { chainStep: true });
        if (next === null) { out = null; break; }
        if (next === cur) { out = cur; break; }
        if (seen.includes(next)) { report.cycles.push({ to: start, path: [...seen, next] }); out = null; break; }
        seen.push(next); cur = next;
        if (d === MAX_CHAIN - 1) report.depthLimit.push({ to: start, path: seen.slice() });
      }
      memo.set(key, out);
      return out;
    };
    // すべて1段の辞書でたどってから一斉に入れる（途中で入れると、たどる途中の結果が並び順で変わるため）
    const resolved = base.alts.map((a) => [resolve(a.to, false), resolve(a.to, true)]);
    base.alts.forEach((a, k) => {
      const [f, c] = resolved[k];
      a.toFree = f == null ? a.to : f;
      a.toCont = c == null ? a.to : c;
    });
    base.report = report;
    return base;
  } catch (e) {
    console.error("[dict-apply] 連鎖の解決で例外のため1段のまま使う:", e);
    for (const a of base.alts) { delete a.toFree; delete a.toCont; }
    return base;
  }
}
const stripSentinel = (s) => (s.endsWith(CONT_SENTINEL) ? s.slice(0, -CONT_SENTINEL.length) : null);

function buildBaseMatcher(dict) {
  const alts = [];
  (Array.isArray(dict) ? dict : []).forEach((e, i) => {
    if (!Array.isArray(e)) return;
    const from = e[0] == null ? "" : String(e[0]);
    const to = e[1] == null ? "" : String(e[1]);
    if (!from || !to) return;
    // 置換前＝置換後の行は「守り」: 長い語優先の1回置換で、その語の中に短い語が当たるのを防ぎ、言ったとおりに残す
    //   書いたとおりの形だけを守る（かな違いは守らない）。同じ語にほかの置換があればそちらを優先する
    const same = from === to;
    if (same) {
      alts.push({ lit: from, src: from.length >= 3 ? ciAscii(esc(from)) : esc(from), ci: from.length >= 3, to, i, ext: false, guard: true });
    } else if (from.length >= 3) {
      const k = toKata(from);
      for (const v of new Set([from, k, toHira(k)])) alts.push({ lit: v, src: ciAscii(esc(v)), ci: true, to, i, ext: extendsFrom(v, to) });
    } else if (KATA_ONLY.test(from)) {
      alts.push({ lit: from, src: `(?<![\\u30A1-\\u30F6\\u30FC])${esc(from)}(?![\\u30A1-\\u30F6\\u30FC])`, ci: false, to, i, ext: extendsFrom(from, to) });
    } else {
      alts.push({ lit: from, src: esc(from), ci: false, to, i, ext: extendsFrom(from, to) });
    }
  });
  if (!alts.length) return null;
  // 長い語を優先。同じ長さなら守りでない行、次に辞書の並び順（旧実装で先に当たっていた方）を優先
  alts.sort((a, b) => b.lit.length - a.lit.length || (a.guard ? 1 : 0) - (b.guard ? 1 : 0) || a.i - b.i);
  const byKey = new Map();
  for (const a of alts) {
    const k = a.lit.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(a);
  }
  return { re: new RegExp(alts.map((a) => a.src).join("|"), "g"), byKey, alts };
}

// 一致した文字列から、正規表現が実際に選んだエントリ（並び順で最初に当たるもの）を引く
const pick = (matcher, m) => {
  const list = matcher.byKey.get(m.toLowerCase()) || [];
  return list.find((a) => (a.ci ? a.lit.toLowerCase() === m.toLowerCase() : a.lit === m)) || null;
};

// B: 一致箇所が、本文中にすでにある置換後の語（to）の一部なら、その to の終わり位置を返す（なければ -1）
const insideExistingTo = (text, at, m, to) => {
  const T = to.toLowerCase(), M = m.toLowerCase(), L = text.toLowerCase();
  for (let k = T.indexOf(M); k >= 0; k = T.indexOf(M, k + 1)) {
    const s = at - k;
    if (s >= 0 && L.slice(s, s + T.length) === T) return s + T.length;
  }
  return -1;
};

// 置換本体（例外はそのまま投げる。fail-open は呼び出し側が担う）
// chainStep: 連鎖の解決のときだけ true。行き先の語がすでに文字列にあるなら、その段はたどらない
//   （「AGA（男性型脱毛症）」に AGA→男性型脱毛症 が当たって「男性型脱毛症（男性型脱毛症）」になるのを防ぐ）
export function applyDictOnce(text, matcher, { chainStep = false } = {}) {
  if (!text || !matcher) return text;
  const { re } = matcher;
  re.lastIndex = 0;
  let out = "", last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === "") { re.lastIndex++; continue; }
    const a = pick(matcher, m[0]);
    if (!a) continue;
    if (chainStep && text.toLowerCase().includes(a.to.toLowerCase())) continue;
    const at = m.index;
    let keepEnd = insideExistingTo(text, at, m[0], a.to);
    if (keepEnd < 0 && a.toFree && a.toFree !== a.to) keepEnd = insideExistingTo(text, at, m[0], a.toFree);
    if (keepEnd >= 0) {
      // すでに正式名になっている → その語の終わりまで手を付けずに進める
      out += text.slice(last, keepEnd);
      last = keepEnd;
      re.lastIndex = keepEnd;
      continue;
    }
    // 直後に「（置換後の語）」の注記がすでにある（「AGA（男性型脱毛症）」の AGA）→ 置換しない（2回通しても2重にしない）
    const after = text.slice(at + m[0].length);
    if ([a.to, a.toFree].some((t) => t && (after.startsWith(`（${t}）`) || after.startsWith(`(${t})`)))) continue;
    const cont = NAME_CONT.test(text[at + m[0].length] || "");
    if (a.ext && cont) continue; // 別の名前の一部 → 補わない
    out += text.slice(last, at) + ((cont ? a.toCont : a.toFree) || a.to);
    last = at + m[0].length;
  }
  return out + text.slice(last);
}

// fail-open ラッパ: 置換で例外が出たら無加工で返す（辞書の不具合で書き起こしが壊れたり消えたりしないように）
export function applyDictSafe(text, matcher, apply = applyDictOnce) {
  try {
    return apply(text, matcher);
  } catch (e) {
    console.error("[dict-apply] 例外のため辞書置換なしで返す:", e);
    return text;
  }
}
