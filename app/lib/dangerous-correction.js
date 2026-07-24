// 「汚染型の修正候補」を提案段階で弾く共通フィルタ（指示書 typo-scan-contamination-guard）
// 4月の「ただ」→「ただれ（びらん）」汚染は、スキャン提案の採用が dictAddEntry 経由で
// 辞書(mk_dict/Supabase dictionary)へ自動登録される経路から混入した。
// 本モジュールは fix-typos / minutes-typos の提案生成(サーバ)と、採用・手動登録(クライアント)の
// 両方から使う純関数のみを置く（サーバ専用依存を入れないこと）。

// 過去に誤置換事故を起こした・報告済みの危険from（sanitizeDictのブロックリスト ただ/たこ/べんち ＋
// 5835a76 で報告済みの危険エントリ れも/イブ）。
// 注意: sanitizeDict(page.js)の既存辞書からの「除去」対象は院長判断待ちのため拡張しない。
// ここは新規の提案・登録の入口だけを塞ぐリスト。
export const KNOWN_DANGEROUS_FROMS = new Set(["ただ", "たこ", "べんち", "れも", "イブ"]);

// 高頻度日常語の小リスト。before がこれらを含む/一致する修正候補は、
// 部分一致置換（split/join・境界なし）で日常会話を破壊するため弾く。
export const COMMON_EVERYDAY_WORDS = ["ただ", "また", "でも", "から", "こと", "もの", "ため", "まで", "など", "これ", "それ", "ここ", "そこ", "うん", "はい"];

// 危険な修正候補なら理由文字列を返し、安全なら null を返す。
// before=誤りとされた語句 / after=修正先。
export function isDangerousCorrection(before, after) {
  const from = String(before ?? "").trim();
  const to = String(after ?? "").trim();
  if (!from) return "変換前が空";

  // 1) 2文字以下のひらがな（「ただ」「れも」型）は助詞・日常語と区別不能なため一律弾く
  if (/^[ぁ-んー]{1,2}$/.test(from)) return "2文字以下のひらがな";

  // 2) 高頻度日常語を含む/一致
  for (const w of COMMON_EVERYDAY_WORDS) {
    if (from.includes(w)) return `日常語「${w}」を含む`;
  }

  // 3) after が before を内包する拡張置換（「ただ」→「ただれ（びらん）」型）。
  //    境界なし置換では既存の正しい語の内部でも暴発する部分一致の典型形。
  if (to && to !== from && to.includes(from)) return "変換前を内包する拡張置換";

  // 4) 既知の危険エントリ（ブロックリスト＋報告済み）
  if (KNOWN_DANGEROUS_FROMS.has(from)) return "既知の危険エントリ";

  return null;
}

// スキャンAPIが返した corrections（[{from,candidates:[{to,reason}]}]）から危険候補を除外する。
// 除外は無言で捨てず console.info に残す（UIには出さない・将来の調査用）。
export function filterDangerousCorrections(corrections) {
  if (!Array.isArray(corrections)) return [];
  const safe = [];
  for (const c of corrections) {
    if (!c || typeof c.from !== "string") continue;
    const candidates = Array.isArray(c.candidates) ? c.candidates : [];
    const safeCandidates = candidates.filter((cand) => {
      const danger = isDangerousCorrection(c.from, cand?.to);
      if (danger) {
        console.info(`危険候補を抑制: ${c.from}→${cand?.to}（${danger}）`);
        return false;
      }
      return true;
    });
    // 候補が全滅した from ごと落とす（from 自体が危険な場合もここで消える）
    if (safeCandidates.length === 0) {
      if (candidates.length === 0) {
        const danger = isDangerousCorrection(c.from, "");
        if (danger) { console.info(`危険候補を抑制: ${c.from}（${danger}）`); continue; }
        // 候補ゼロだが from は安全 → 元々表示できない候補なので落とすだけ
      }
      continue;
    }
    safe.push({ ...c, candidates: safeCandidates });
  }
  return safe;
}

// スキャンAIプロンプトに追記する抑制ブロック（fix-typos / minutes-typos 共用）
export const CORRECTION_PROMPT_GUARD = `
【修正候補の禁止事項】
- 2〜3文字の一般的なひらがな語（「ただ」「でも」「また」等）を医療用語へ置換する候補を出さない。
- 元の語を含んだまま語尾や注記を足すだけの置換（例: ただ→ただれ(びらん)）を出さない。
- 確信が持てない場合は候補にしない（誤検出より見逃しを優先）。`;

// ===== ノイズスキャン(scan-noise)用の削除型候補ガード =====
// ノイズパターンは filterTranscriptNoise で「その語を含む行を丸ごと削除」する（部分一致・無境界）。
// 医療内容を含む語が登録されると診察の記述行が全滅するため、提案・登録の入口で弾く。

// 医療内容の可能性を示す語（薬剤・処置/症状/部位の小リスト）。候補textがこれらを含んだら削除候補にしない。
// 過剰ブロック（正当ノイズを見逃す）方向は安全側（誤削除より見逃しを優先）。
export const MEDICAL_CONTENT_WORDS = [
  // 薬剤・処置・診療
  "軟膏", "クリーム", "ローション", "保湿", "ステロイド", "塗", "内服", "処方", "薬", "注射", "液体窒素", "レーザー", "ピーリング", "外用", "患部", "診察", "診断", "検査", "治療", "受診", "通院", "再診",
  "ヒルドイド", "プロトピック", "コレクチム", "デュピクセント", "リンデロン", "ワセリン", "アレグラ", "ザイザル",
  // 症状
  "かゆ", "痒", "痛", "赤み", "発疹", "湿疹", "ぶつぶつ", "腫れ", "ただれ", "びらん", "乾燥", "水ぶくれ", "じんましん", "蕁麻疹", "アトピー", "ニキビ", "にきび", "白癬", "水虫", "いぼ", "イボ", "ほくろ", "かぶれ", "やけど", "火傷",
  // 部位
  "皮膚", "頭皮", "まぶた", "唇", "頬", "肘", "膝", "かかと", "背中", "お腹", "首", "顔", "腕", "指", "爪", "足", "手", "目", "耳", "鼻", "口", "頭", "胸",
];

// 危険なノイズ削除パターンなら理由文字列を返し、安全なら null を返す。
export function isDangerousNoisePattern(text) {
  const t = String(text ?? "").trim();
  if (!t) return "空パターン";

  // 1) 短すぎるパターンは部分一致で無関係な行まで大量削除する
  if ([...t].length <= 2) return "2文字以下（部分一致で大量削除の危険）";

  // 2) 日常語そのもの（「ただ」「また」等）を含む行が全て消える
  if (COMMON_EVERYDAY_WORDS.includes(t)) return "高頻度日常語そのもの";

  // 3) 医療内容（薬剤名・症状語・部位語）を含む文は診察記述の可能性がある
  const hit = MEDICAL_CONTENT_WORDS.find((w) => t.includes(w));
  if (hit) return `医療内容の可能性（「${hit}」を含む）`;

  return null;
}

// scan-noise が返した candidates（[{text,reason}]）から危険な削除候補を除外する。
// 除外は無言で捨てず console.info に残す（UIには出さない・将来の調査用）。
export function filterDangerousNoiseCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates.filter((c) => {
    if (!c || typeof c.text !== "string") return false;
    const danger = isDangerousNoisePattern(c.text);
    if (danger) {
      console.info(`危険候補を抑制: ノイズ「${c.text}」（${danger}）`);
      return false;
    }
    return true;
  });
}

// scan-noise プロンプトに追記する抑制ブロック
export const NOISE_PROMPT_GUARD = `
【削除候補の禁止事項】
- 医療用語・薬剤名・症状の記述を含む文を削除候補にしない。
- 判断に迷う文は削除候補にしない（誤削除より見逃しを優先）。
- 短い相槌の連発・明白な広告文・製品コードの羅列のみ削除候補にする。`;
