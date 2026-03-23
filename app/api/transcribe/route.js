import { NextResponse } from "next/server";

const WHISPER_PROMPT = "皮膚科・美容皮膚科診療の会話。頻出用語：【疾患】アトピー性皮膚炎、接触性皮膚炎、蕁麻疹、乾癬、尋常性乾癬、掌蹠膿疱症、帯状疱疹、単純疱疹、足白癬、爪白癬、体部白癬、頭部白癬、カンジダ症、尋常性ざ瘡、酒さ、脂漏性皮膚炎、皮脂欠乏性皮膚炎、手湿疹、汗疱、皮膚掻痒症、蜂窩織炎、丹毒、伝染性膿痂疹、伝染性軟属腫、尋常性疣贅、扁平疣贅、多形紅斑、結節性紅斑、円形脱毛症、男性型脱毛症、女性型脱毛症、尋常性白斑、肝斑、日光黒子、脂漏性角化症、表皮嚢腫、粉瘤、ケロイド、疥癬、褥瘡、熱傷、凍瘡、多汗症、【ステロイド外用薬】デルモベート、ダイアコート、フルメタ、アンテベート、マイザー、トプシム、リンデロンVG、リンデロン、ベトネベート、ロコイド、キンダベート、アルメタ、ヒドロコルチゾン、【免疫抑制外用薬】プロトピック、コレクチム、モイゼルト、ジファミラスト、【生物学的製剤】デュピクセント、ミチーガ、サイバインコ、リンヴォック、オルミエント、コゼンティクス、スキリージ、トレムフィア、ルミセフ、イルミア、ネモリズマブ、トラロキヌマブ、ウパダシチニブ、アブロシチニブ、【保湿剤】ヒルドイド、ビーソフテン、ザーネ、ケラチナミン、パスタロン、【抗ヒスタミン薬】アレグラ、ザイザル、アレロック、クラリチン、ビラノア、ルパフィン、デザレックス、タリオン、エバステル、ジルテック、【抗真菌薬】ラミシール、イトリゾール、ルリコン、マイコスポール、ニゾラール、【抗ウイルス薬】バルトレックス、ファムビル、アラセナ、ゾビラックス、【ニキビ治療薬】ディフェリン、エピデュオ、ベピオ、デュアック、アクアチム、ゼビアックス、クリンダマイシン、ドキシサイクリン、ミノマイシン、【AGA治療薬】プロペシア、ザガーロ、フィナステリド、デュタステリド、ミノキシジル、【美容内服】トラネキサム酸、シナール、ハイチオール、ユベラ、ビタミンC、ビタミンE、グルタチオン、【美容外用】トレチノイン、ハイドロキノン、アゼライン酸、【美容施術】ボトックス、ヒアルロン酸、フィラー、ピコレーザー、Qスイッチレーザー、炭酸ガスレーザー、フラクショナルレーザー、IPL、フォトフェイシャル、ケミカルピーリング、グリコール酸ピーリング、サリチル酸ピーリング、ダーマペン、水光注射、メソセラピー、HIFU、ウルセラ、サーマクール、ポテンツァ、ノーリス、Vビームレーザー、ナローバンドUVB、エキシマライト、液体窒素、ダーモスコピー、【治療方針】プロアクティブ療法、スタンダード療法、保湿スキンケア、ステロイド漸減、外用指導、遮光指導、抗ヒスタミン、免疫抑制、冷凍凝固療法";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio");

    if (!audioFile) {
      return NextResponse.json({ error: "音声ファイルがありません" }, { status: 400 });
    }

    // Forward to OpenAI Whisper API
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, "audio.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "ja");
    whisperForm.append("response_format", "json");
    const dictTerms = formData.get("dict_terms") || "";
    const finalPrompt = (WHISPER_PROMPT + (dictTerms ? "、" + dictTerms : "")).slice(0, 900);
    whisperForm.append("prompt", finalPrompt);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: whisperForm,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Whisper API error:", err);
      return NextResponse.json({ error: "Whisper API エラー" }, { status: 500 });
    }

    const data = await res.json();
    const transcribedText = data.text || "";
    const HALLUCINATION_PATTERNS = [
      /ご視聴ありがとうございました/,
      /最後までご視聴/,
      /チャンネル登録/,
      /チャンネル登録お願い/,
      /高評価.*お願い/,
      /グッドボタン/,
      /Thank you for watching/i,
      /Thanks for watching/i,
      /Please subscribe/i,
      /please like and subscribe/i,
      /happens with most of the/i,
      /most of the drugs/i,
      /See you next time/i,
      /that's all for today/i,
      /コメント欄/,
      /概要欄/,
      /サブスクライブ/,
      /メンバーシップ/,
      /スーパーチャット/,
      /ライブ配信/,
      /生放送/,
      /YouTub/i,
      /TikTok/i,
      /Instagram.*フォロー/i,
      /^[\s\.。、]+$/,
      /^\[.*\]$/,
      /^♪.*♪$/,
      /music playing/i,
      /\[音楽\]/,
      /\[無音\]/,
      /^[silence]/i,
    ];
    const isHallucination = HALLUCINATION_PATTERNS.some(p => p.test(transcribedText.trim()))
      && transcribedText.trim().length < 30;
    let filteredText = isHallucination ? "" : transcribedText;
    if (filteredText.trim().length <= 3) filteredText = "";
    return NextResponse.json({ text: filteredText });
  } catch (e) {
    console.error("Transcribe error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
