import { NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは皮膚科・美容皮膚科の専門医です。音声書き起こしテキストに含まれる医療用語の誤認識を積極的に検出してください。

【皮膚科頻用薬品名（正しい表記）】
外用ステロイド: デルモベート、ダイアコート、アンテベート、フルメタ、マイザー、トプシム、リンデロン、ベトネベート、ボアラ、フルコート、エクラー、メサデルム、レダコート、ケナコルト、アドコルチン、ロコイド、キンダベート、グリメサゾン、アルメタ、クロベタゾン、ヒドロコルチゾン
保湿剤: ヒルドイド、ビーソフテン、ケラチナミン、パスタロン、ウレパール、NMF
抗アレルギー: アレグラ、クラリチン、ザイザル、アレロック、ジルテック、エバステル、ビラノア、デザレックス、ルパフィン、タリオン
免疫抑制: プロトピック、コレクチム、モイゼルト
生物学的製剤: デュピクセント、ミチーガ、ネモリズマブ、アドトラーザ
ニキビ: ディフェリン、エピデュオ、デュアック、アクアチム、ダラシン、ゼビアックス、オキシテトラサイクリン、スピロノラクトン
真菌: ラミシール、イトリゾール、ルリコン、ニゾラール、アスタット、マイコスポール
ウイルス: バルトレックス、ファムビル、アラセナ、ゾビラックス
その他: プロペシア、ザガーロ、リアップ、ミノキシジル、ベピオ、ロゼックス、スキンケア

【皮膚科頻用疾患名（正しい表記）】
アトピー性皮膚炎、接触性皮膚炎、脂漏性皮膚炎、貨幣状湿疹、皮脂欠乏性湿疹、蕁麻疹、血管性浮腫、尋常性乾癬、掌蹠膿疱症、扁平苔癬、円形脱毛症、男性型脱毛症、尋常性ざ瘡、酒さ、脂漏性角化症、老人性色素斑、肝斑、白斑、帯状疱疹、単純ヘルペス、伝染性膿痂疹、足白癬、爪白癬、カンジダ、毛包炎、癤、蜂窩織炎、粉瘤、脂肪腫、基底細胞癌、有棘細胞癌、悪性黒色腫、ダーモスコピー

【処置名（正しい表記）】
液体窒素凍結療法、ダーモスコピー、ナローバンドUVB、エキシマライト、Vビームレーザー、炭酸ガスレーザー、フラクセル、ケミカルピーリング、ボトックス、ヒアルロン酸、イオン導入、光線力学療法

【検出ルール】
- 上記リストの用語と音が近いが表記が異なる語句を誤りとして検出する
- 音声認識特有の誤り（似た音の単語への誤変換）を積極的に検出する
- 誤りが疑われる場合は確信度が低くても候補を挙げる
- 1〜3個の候補を必ず提示する
- 結果はJSON形式のみで返す（説明文不要）
- 形式: {"corrections":[{"from":"誤りの語句","candidates":[{"to":"候補1","reason":"理由"},{"to":"候補2","reason":"理由"}]}]}`;

export async function POST(request) {
  try {
    const body = await request.json();
    const text = body.text;
    const dictionary = body.dictionary;
    if (!text || !text.trim()) {
      return NextResponse.json({ corrections: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY が設定されていません" }, { status: 500 });
    }

    let userPrompt = `以下の書き起こしテキストの医療用語の誤字脱字を検出:\n${text}`;
    if (dictionary && Array.isArray(dictionary) && dictionary.length > 0) {
      const dictText = dictionary.map(d => `${d.from}→${d.to}`).join("\n");
      userPrompt += `\n\n【登録済み辞書（参考）】\n${dictText}`;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "AI校正APIエラー" }, { status: 500 });
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";

    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const objMatch = content.match(/\{[\s\S]*"corrections"[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0];
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("fix-typos JSON parse error:", parseErr, "raw:", content);
      return NextResponse.json({ corrections: [], error: "AIレスポンスの解析に失敗しました" });
    }
    if (!parsed.corrections || !Array.isArray(parsed.corrections)) {
      return NextResponse.json({ corrections: [] });
    }
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("fix-typos error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
