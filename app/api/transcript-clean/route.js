import { logUsage } from "../../lib/log-usage";
import { GEMINI_MODELS } from "../../lib/gemini-models";

export const maxDuration = 120;

// 皮膚科の用語辞書（文脈補正の参照用）。辞書置換(applyDict)で既に直る単語の重複処理が主目的ではなく、
// 「音声認識の誤変換を正しい専門用語に寄せる」ための参照リスト。将来追加しやすいよう定数で保持。
const DERM_TERMS = {
  diseases: ["アトピー性皮膚炎","尋常性乾癬","掌蹠膿疱症","酒皶","酒皶様皮膚炎","脂漏性皮膚炎","尋常性痤瘡","化膿性汗腺炎","類天疱瘡","天疱瘡","扁平苔癬","円形脱毛症","帯状疱疹","伝染性膿痂疹","結節性痒疹","日光角化症","基底細胞癌","有棘細胞癌","悪性黒色腫","ボーエン病","菌状息肉症","尋常性疣贅","伝染性軟属腫","白癬","カンジダ症","蕁麻疹","多形滲出性紅斑","結節性紅斑","ジベルばら色粃糠疹","貨幣状湿疹","自家感作性皮膚炎","鬱滞性皮膚炎","汗疱","異汗性湿疹","毛孔性苔癬","脂漏性角化症","光線過敏症","環状肉芽腫","壊疽性膿皮症"],
  topical: ["デルモベート","アンテベート","マイザー","フルメタ","リンデロン","ロコイド","キンダベート","プロトピック","タクロリムス","コレクチム","デルゴシチニブ","モイゼルト","ジファミラスト","ドボベット","マーデュオックス","オキサロール","ベピオ","デュアック","エピデュオ","ディフェリン","アダパレン","ゼビアックス","ダラシン","アクアチム","ヒルドイド","ニゾラール","ラミシール","ルリコン","ゼフナート"],
  oral: ["ネオーラル","シクロスポリン","オテズラ","アプレミラスト","リンヴォック","ウパダシチニブ","サイバインコ","アブロシチニブ","オルミエント","バリシチニブ","コルヒチン","ダプソン","チガソン","ビラノア","デザレックス","ザイザル","アレグラ","ビラスチン","ファムビル","バルトレックス","アメナリーフ","イトラコナゾール","ネイリン"],
  injection: ["デュピクセント","デュピルマブ","ミチーガ","ネモリズマブ","アドトラーザ","トラロキヌマブ","イブグリース","レブリキズマブ","コセンティクス","セクキヌマブ","トルツ","イキセキズマブ","ルミセフ","ブロダルマブ","ステラーラ","ウステキヌマブ","トレムフィア","グセルクマブ","スキリージ","リサンキズマブ","ヒュミラ","アダリムマブ","ビンゼレックス","ビメキズマブ","ゾレア","オマリズマブ","ヌーカラ"],
};

const CLEAN_PROMPT = `あなたは皮膚科クリニックの音声書き起こしの校正係です。以下の書き起こしテキストを、次のルールで補正してください。

【主目的】捏造（ハルシネーション）の除去 と 文脈に沿った誤変換補正の2点です（単純な単語の辞書置換は別処理で済んでいるため、ここでは文脈判断が必要な補正に集中してください）。

【ルール】
1. 明らかに会話と無関係な文（ハルシネーション）を削除する: 動画由来の定型句（「ご視聴ありがとうございました」「最後までご視聴いただき…」「チャンネル登録」等）、広告文・キャッチコピー（例:「世界一のブランディッシュ!」）、製品コード・型番の羅列（例:「AS-640フィルムFS-850を入力します」）、診療の文脈と繋がらない意味不明な文。
2. 同一文・同一フレーズ・同一単語の不自然な繰り返し（スペース区切りの同語連続を含む）を1つに統合する。
3. 皮膚科の疾患名・薬剤名の誤変換を、下記の用語辞書を参考に、文脈上ふさわしい正しい表記へ直す（例: 「ざ瘡」→「痤瘡」、「酒さ」→「酒皶」、薬剤名のカタカナ崩れを正規名へ）。確信が持てない場合は変更しない。
4. 話者の発言内容そのものは変えない。【要約・圧縮・省略を一切しない。1文も削らない】。聞き取れた内容は全て保持し、入力とほぼ同じ分量で返す。捏造除去と誤変換補正のみ行う。
5. 不確実な箇所を勝手に創作しない。判断できない部分はそのまま残す。
6. 前置き・注釈・お願い文（「以下が補正後です」等）は一切書かず、補正後のテキストのみを返す。

【用語辞書（参考）】
（疾患名）${DERM_TERMS.diseases.join("、")}
（外用薬）${DERM_TERMS.topical.join("、")}
（内服薬）${DERM_TERMS.oral.join("、")}
（注射薬）${DERM_TERMS.injection.join("、")}

【補正対象の書き起こし】
`;

// モデルは gemini-models.js に集約（3.6 Flash 第一候補）
const MODELS = GEMINI_MODELS;

async function callGemini(model, text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 未設定");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: CLEAN_PROMPT + "\n\n" + text }] }],
      // 補正なので低温度。出力は素のテキスト（枠固定JSONではない）。
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const out = parts.filter(p => !p.thought).map(p => p.text || "").join("");
  try {
    await logUsage({
      route: "/api/transcript-clean",
      model,
      context: "transcript-clean",
      input_tokens: data.usageMetadata?.promptTokenCount || 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      request_meta: { char_length: text.length },
    });
  } catch (e) { console.error("[logUsage] transcript-clean:", e); }
  if (!out.trim()) throw new Error(`${model}: empty response`);
  return out.trim();
}

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text || !text.trim()) {
      return Response.json({ text: text || "" });
    }
    let lastErr = null;
    for (const m of MODELS) {
      try {
        const cleaned = await callGemini(m, text);
        return Response.json({ text: cleaned, model: m });
      } catch (e) {
        lastErr = e.message;
      }
    }
    // 補正失敗時は元テキストを返す（書き起こしを失わない・安全側）
    console.error("transcript-clean all models failed:", lastErr);
    return Response.json({ text, failed: true, error: lastErr });
  } catch (e) {
    console.error("transcript-clean error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
