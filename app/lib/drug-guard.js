// 「音源のない薬剤名」を要約から検出して⚠を付けるガード（指示書 drug-name-hallucination-guard 段階1）
// 2026/07/25 の実例: 書き起こしに音として存在しない「クリンダマイシンゲル」を要約LLMが
// 疾患名(ざ瘡)+「ウォッシュゲル」から連想して生成した。誤字辞書・誤字スキャンは無関係。
// 本モジュールは dangerous-correction.js と同じ「提案フィルタ」構造で、
// サーバ(要約route)とクライアント(page.js)の両方から使える純関数のみを置く（サーバ専用依存を入れないこと）。
// 段階2(院内採用薬マスタでの書き起こし正規化)までの暫定対策。

import { DRUG_MASTER } from "./drug-master.js";

// 要約プロンプトへ追記する薬剤名ルール（診察SOAP要約のみ。議事録・カウンセリングには入れない）
// 段階2: 院内採用薬マスタを全件注入し、マスタ一致は正式名称での断定を許可（根拠がマスタにあるため）。
// ルール3が核心: マスタを与えると「一覧から選んで埋める」方向に振れやすいので、補完禁止を明示する。
export const DRUG_NAME_PROMPT_RULES = `

【薬剤名の記載ルール(厳守)】
以下は当院の採用薬一覧である。
<採用薬一覧>
${DRUG_MASTER.map((d) => d.name).join("\n")}
</採用薬一覧>

1. 書き起こしに薬剤名らしき語があり、それが上記採用薬一覧のいずれかと音として明らかに対応する場合、
   正式名称で断定して書いてよい。
   例: 「ゼビア靴」→ ゼビアックスローション / 「ディフェインゲール」「リフェリンゲル」→ ディフェリンゲル
2. 書き起こしに薬剤名らしき語があるが、採用薬一覧に対応がない場合は、
   原文表記(推定) の形式で書き、正式名称に確定させない。他院処方・市販薬の可能性があるため削除もしない。
3. 疾患名・症状・一般的な治療方針からの推測で、書き起こしにない薬剤名を補ってはならない。
   採用薬一覧に載っていることは、その薬が会話に出た根拠にはならない。
   例: 「ざ瘡」「ウォッシュゲル」という語から「クリンダマイシンゲル」等を補うことは禁止。
4. 薬剤の言及が書き起こしに一切ない場合、P) には「処方の言及なし」と書く。
   空欄にしたり、標準治療を推測して埋めたりしない。`;

// 一般語のため未照合でも警告しない除外リスト（剤形・一般名詞・日常外来語。薬剤名ではない語だけを置く）。
// 院長が後から追加する場合はこの配列に1語ずつ足す（音韻正規化して完全一致で比較するため、
// 濁点・長音・促音・ひらがな/カタカナの表記ゆれはある程度吸収される）。
export const DRUG_GUARD_EXCLUDED_TERMS = [
  // 剤形・洗浄料などの一般名詞（単体で薬剤を特定しない）
  "ウォッシュゲル", "ジェル", "ゲル", "ローション", "クリーム", "テープ", "カプセル", "スプレー", "フォーム",
  "シャンプー", "リンス", "ボディソープ", "ソープ", "オイル", "バーム", "ミスト", "パウダー",
  // 医療一般語（成分・分類であって商品名ではない）
  "アレルギー", "ステロイド", "ワセリン", "ビタミン", "コラーゲン", "セラミド", "ヒアルロン",
  "ノンコメドジェニック", "コメドジェニック", "コメド", "アルコール", "エタノール",
  // 日常外来語・スキンケア一般
  "スキンケア", "メイク", "ファンデーション", "クレンジング", "コットン", "ティッシュ", "マスク", "タオル",
  "プール", "サウナ", "シャワー", "ストレス", "ホルモン", "バランス", "ドラッグストア", "クリニック",
  "レーザー", "ピーリング", "フェイス", "ボディ", "デリケート", "テクスチャー", "テクスチャ",
  "パッチテスト", "フォローアップ", "コントロール", "メンテナンス", "トラブル", "ポイント", "タイミング",
  "リバウンド", "アドバイス", "サプリメント",
];

// カタカナ剤形語尾（この語尾を含むカタカナ3文字以上の連なりを薬剤名候補にする）
const DOSAGE_SUFFIX_KATA = /(ゲル|ローション|クリーム|テープ|カプセル|スプレー|フォーム)/;
// カタカナ連なりの直後に続く漢字剤形（リンデロン軟膏 等。照合はカタカナ部分で行う）
const DOSAGE_KANJI_AFTER = /^(軟膏|液|錠|散)/;

// 音韻正規化: ひらがな→カタカナ、濁点半濁点・長音・促音・中黒・空白を除去。
// 音声認識の崩れ（ゼ/セ、ゲール/ケル等）を吸収して比較するための表現。
export function normalizePhonetic(s) {
  let t = String(s ?? "");
  t = t.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  t = t.normalize("NFD").replace(/[\u3099\u309A]/g, "").normalize("NFC");
  t = t.replace(/[ーッ・\s]/g, "");
  return t;
}

const EXCLUDED_NORMALIZED = new Set(DRUG_GUARD_EXCLUDED_TERMS.map(normalizePhonetic));

// レーベンシュタイン距離（比較対象は高々十数文字なので素朴なDPで十分）
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// 要約テキストから薬剤名候補（カタカナ連なり）を位置つきで抽出する。
// 「推定:」直後の語は既に推定と明示されているため候補にしない（プロンプトルール2の出力形式）。
export function extractDrugCandidates(summaryText) {
  const text = String(summaryText ?? "");
  const out = [];
  const re = /[ァ-ヶー]{3,}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const run = m[0];
    const after = text.slice(m.index + run.length);
    const before = text.slice(Math.max(0, m.index - 4), m.index);
    if (/推定[:：]\s*$/.test(before)) continue; // 「原文(推定: 正式名称)」の正式名称部は警告対象外
    const isCandidate =
      DOSAGE_SUFFIX_KATA.test(run) ||           // 剤形カタカナ語尾を含む（3文字以上）
      DOSAGE_KANJI_AFTER.test(after) ||         // 直後に漢字剤形が続く（〜軟膏/液/錠/散）
      run.length >= 4;                          // 語尾条件なしのカタカナ4文字以上
    if (!isCandidate) continue;
    const norm = normalizePhonetic(run);
    if (!norm || norm.length < 3) continue;
    if (EXCLUDED_NORMALIZED.has(norm)) continue;      // 一般語のため未照合でも警告しない
    if (/^(..)\1+$/.test(norm)) continue;             // カサカサ/ヒリヒリ等のオノマトペ（2音繰り返し）
    out.push(run);
  }
  return [...new Set(out)];
}

// 候補が書き起こしに音として存在するか（音韻近似含む）
// 1) 正規化完全包含 → OK
// 2) 先頭3音の一致 → OK（「ゼビア靴」型: 後半が漢字等に化けてレーベンシュタインが届かないケース）
// 3) スライディングウィンドウ（候補長±2）のレーベンシュタイン距離 / 候補長 <= 0.34 → OK
export function isGroundedInTranscript(candidate, normTranscript) {
  const nc = normalizePhonetic(candidate);
  if (!nc || nc.length < 3) return true; // 照合不能な短音は警告しない（安全側=見逃し優先）
  if (normTranscript.includes(nc)) return true;
  if (nc.length >= 4 && normTranscript.includes(nc.slice(0, 3))) return true;
  const L = nc.length;
  const maxD = Math.floor(L * 0.34);
  if (maxD > 0) {
    for (let w = Math.max(2, L - 2); w <= L + 2; w++) {
      for (let i = 0; i + w <= normTranscript.length; i++) {
        if (levenshtein(nc, normTranscript.substr(i, w)) <= maxD) return true;
      }
    }
  }
  return false;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 候補を採用薬マスタで解決し、照合語（一致した薬剤の name＋全 keys）を返す。未解決なら null。
// 一致判定は音韻正規化のうえ「候補がキーと等価 or キーを包含」（例: 候補「ゼビアックスローション」は key「ゼビアックス」で解決）。
// 複数エントリに当たる場合（ヘパリン系・剤形違い等）は全エントリの keys を合算する（照合が広がる=警告されにくい安全側）。
export function resolveDrugProbes(candidate) {
  const nc = normalizePhonetic(candidate);
  if (!nc) return null;
  const probes = new Set();
  for (const d of DRUG_MASTER) {
    const allKeys = [d.name, ...(d.keys || [])];
    if (allKeys.some((k) => { const nk = normalizePhonetic(k); return nk && (nc === nk || nc.includes(nk)); })) {
      allKeys.forEach((k) => probes.add(k));
    }
  }
  return probes.size ? [...probes] : null;
}

// 要約中の薬剤名候補を書き起こしと照合し、未照合語の直前に⚠を付けて返す。
// 削除はしない（医療情報を機械判断で消すのは危険。院長が見て判断する）。
// 段階2: 候補をマスタで解決できた場合は、その薬剤の keys のいずれかが書き起こしに音韻近似すればOK
// （「ゼビアックスローション」全長より key「ゼビアックス」の方が崩れた音「ゼビア靴」に当たりやすい）。
// マスタで解決できない候補は従来どおり候補文字列そのもので照合する。
// fail-open 必須: 例外時は summaryText を無加工で返す（ガードの失敗で要約を落とさない規約）。
export function markUngroundedDrugs(summaryText, transcriptText) {
  try {
    const summary = String(summaryText ?? "");
    if (!summary.trim()) return { text: summary, flagged: [] };
    const normT = normalizePhonetic(String(transcriptText ?? ""));
    const isGrounded = (c) => {
      const probes = resolveDrugProbes(c);
      if (probes) return probes.some((p) => isGroundedInTranscript(p, normT));
      return isGroundedInTranscript(c, normT);
    };
    const flagged = extractDrugCandidates(summary).filter((c) => !isGrounded(c));
    let text = summary;
    // 長い候補から付与（短い候補が長い候補の部分文字列でも二重付与しない）。
    // 既に⚠が付いている語には重ねない（再生成時の多重付与防止）。
    for (const w of [...flagged].sort((a, b) => b.length - a.length)) {
      text = text.replace(new RegExp("(⚠)?" + escapeRegExp(w), "g"), (m, warn) => (warn ? m : "⚠" + w));
    }
    return { text, flagged };
  } catch (e) {
    console.error("drug-guard error (fail-open):", e);
    return { text: summaryText, flagged: [] };
  }
}
