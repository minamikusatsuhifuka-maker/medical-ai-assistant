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
    ];
    const filteredText = HALLUCINATION_PATTERNS.some(p => p.test(transcribedText)) ? "" : transcribedText;
    return NextResponse.json({ text: filteredText });
  } catch (e) {
    console.error("Transcribe error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
