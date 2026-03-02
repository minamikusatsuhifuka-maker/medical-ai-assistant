import { NextResponse } from "next/server";

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
