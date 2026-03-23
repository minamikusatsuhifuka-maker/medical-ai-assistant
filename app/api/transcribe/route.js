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
      /ご覧いただ/,
      /最後までご視聴/,
      /チャンネル登録/,
      /高評価/,
      /グッドボタン/,
      /良い1日を/,
      /本日はご覧/,
      /ご清聴ありがとう/,
      /お疲れ様でした/,
      /それではまた/,
      /バイバイ/,
      /See you/i,
      /Thank you for watching/i, /Thanks for watching/i,
      /Please subscribe/i,
      /ぶひろ/,
      /びらん.*ありがとう/,
      /いただれ/,
      /チャンネル/,
      /コメント欄/,
      /いいねボタン/,
      /いいね押して/,
      /フォローして/,
      /リツイート/,
      /シェアして/,
      /概要欄/,
      /プロフィール/,
      /サブスク/,
      /メンバーシップ/,
      /スーパーチャット/,
      /投げ銭/,
      /配信/,
      /ライブ配信/,
      /生配信/,
      /動画を見て/,
      /次の動画/, /前回の動画/,
      /コラボ/,
      /案件/,
      /プロモーション/,
      /アフィリエイト/,
      /リンクは概要欄/,
      /草$/,
      /^草$/,
      /^ｗ+$/,
      /^w+$/i,
      /やばくね/,
      /まじ卍/,
      /ぴえん/,
      /ぱおん/,
      /しか勝たん/,
      /〜しか勝たん/,
      /てぇてぇ/,
      /尊い$/,
      /推しが/,
      /ガチ恋/,
      /沼にハマ/,
      /それな$/,
      /わかりみ/,
      /よき$/,  /すこ$/,
      /おけまる/,
      /り$/,
      /あーね$/,
      /ワロタ/,
      /ンゴ/,
      /陽キャ/,
      /陰キャ/,
      /パリピ/,
      /タピる/,
      /エモい/,
      /きゅんです/,
      /好きぴ/,
      /つらたん/,
      /おはようございまーす/,
      /どうも[ー〜]+/,
      /はいどうも/,
      /やっほー/,
      /最初にお断り/,
      /お知らせがあります/,
      /字幕.*設定/,
      /翻訳.*字幕/,
      /視聴.*ありがとう/,
      /ご覧.*ありがとう/,
      /ありがとうございました$/,
      /お願いします$/,
      /登録/,
      /びらん/,
      /ビラン/,
      /本当にありがとう/,
      /最後まで/,
      /次回も/,
      /また会いましょう/,
      /お楽しみに/,
      /よろしくお願い/,
      /お元気で/,
      /さようなら/,
      /おやすみなさい/,
      /こんにちは[。、！]?$/,
      /どうもありがとう/,
      /はじめしゃちょー/,
      /エンディング/,
      /マイクを上げて/,
      /じゃあマイクを/,
      /リンク.*貼って/,
      /動画.*見て/,
      /チャンネル.*登録/,
      /サブスクライブ/,
      /ベルマーク/,
      /通知.*オン/,
      /YouTub/i,
      /Twitch/i,
      /TikTok/i,
      /Instagram/i,
      /Twitter/i,
      /ポッドキャスト/,
      /生放送/,
      /BGM/,
      /字幕/,
      /テロップ/,
      /編集/,
      /撮影/,
      /カメラ/,
      /スポンサー/,
      /提供/,
      /タイアップ/,
      /^[\s]*[【\[（\(].+[】\]）\)][\s]*$/,
      /^[\s]*＊.+$/,

      // 感謝・挨拶系（無音時に頻出）
      /見てくれてありがとう/,
      /見てくれて/,
      /ありがとうございます[。！\s]*$/,
      /ありがとうございました[。！\s]*$/,
      /どうもありがとうございます/,
      /ご視聴ありがとう/,
      /聴いてくれてありがとう/,
      /聞いてくれてありがとう/,
      /応援ありがとう/,
      /いつもありがとう/,

      // 英語幻聴（Whisperが無音時に英語を生成するパターン）
      /happens with most of the/i,
      /most of the drugs/i,
      /with most of/i,
      /that's all for/i,
      /see you next time/i,
      /see you in the next/i,
      /stay safe everyone/i,
      /take care everyone/i,
      /have a good/i,
      /thanks for listening/i,
      /thank you for listening/i,
      /i'll see you/i,
      /we'll see you/i,
      /don't forget to/i,
      /make sure to/i,
      /if you enjoyed/i,
      /if you liked/i,
      /let me know in the comments/i,
      /in the comments below/i,
      /click the link/i,
      /check out/i,
      /\.\.\.$/,
      /^\s*\.\s*$/,
      /^[\s\.]+$/,

      // 締め・終了系（日本語）
      /以上です[。！\s]*$/,
      /終わります[。！\s]*$/,
      /これで終わり/,
      /それでは失礼/,
      /失礼します[。！\s]*$/,
      /よろしくお願いいたします[。！\s]*$/,
      /どうぞよろしく[。！\s]*$/,
      /また次回/,
      /次回もよろしく/,
      /またお会いしましょう/,
      /またね[。！\s]*$/,
      /じゃあね[。！\s]*$/,
      /またいつか/,
      /ではでは/,
      /それでは皆さん/,
      /みなさんまた/,
      /皆さんまた/,
      /お楽しみに[。！\s]*$/,
      /行ってらっしゃい/,
      /お気をつけて/,
      /お大事に[。！\s]*$/,
      /お元気で[。！\s]*$/,

      // ノイズ・無意味系
      /^[あーうーえーおー\s]+$/,
      /^[アーウーエーオー\s]+$/,
      /^ん[ー～\s]*$/,
      /^はい[。、\s]*$/,
      /^うん[。、\s]*$/,
      /^えー+[。、\s]*$/,
      /^まあ[。、\s]*$/,
      /^なるほど[。、\s]*$/,
      /^そうですね[。、\s]*$/,
      /^[silence]/i,
      /^\[.*\]$/,
      /^\(.*\)$/,
      /^♪.*♪$/,
      /^♫.*$/,
      /music playing/i,
      /background music/i,
      /\[音楽\]/,
      /\[拍手\]/,
      /\[笑い\]/,
      /\[無音\]/,
    ];
    let filteredText = HALLUCINATION_PATTERNS.some(p => p.test(transcribedText)) ? "" : transcribedText;
    // 短すぎるテキスト（5文字以下）もフィルタ
    if(filteredText.length <= 5) filteredText = "";
    // 同じ短いフレーズが繰り返される場合もフィルタ（Whisperの幻聴パターン）
    const words = filteredText.split(/[。、\s]+/).filter(w => w.length > 0);
    if(words.length >= 3) {
      const unique = new Set(words);
      if(unique.size <= Math.ceil(words.length * 0.3)) filteredText = "";
    }
    return NextResponse.json({ text: filteredText });
  } catch (e) {
    console.error("Transcribe error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
