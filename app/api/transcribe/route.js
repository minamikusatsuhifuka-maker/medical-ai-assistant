import { NextResponse } from "next/server";

const WHISPER_PROMPT = "皮膚科診療の会話です。以下の用語が頻出します：アトピー性皮膚炎、接触性皮膚炎、蕁麻疹、乾癬、帯状疱疹、足白癬、爪白癬、デルモベート、アンテベート、リンデロン、ロコイド、キンダベート、プロトピック、コレクチム、モイゼルト、デュピクセント、ミチーガ、ヒルドイド、ビーソフテン、アレグラ、ザイザル、アレロック、ビラノア、ルパフィン、デザレックス、ディフェリン、エピデュオ、ベピオ、ラミシール、イトリゾール、バルトレックス、液体窒素、ダーモスコピー、ナローバンドUVB、Vビームレーザー、プロペシア、ざ瘡、酒さ、脂漏性皮膚炎、掌蹠膿疱症、円形脱毛症、男性型脱毛症、プロアクティブ療法、スタンダード療法、外用、内服、処方、再診、初診";

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
    whisperForm.append("prompt", WHISPER_PROMPT);

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
      /それではまた/,
      /バイバイ/,
      /See you/i,
      /Thank you for watching/i,
      /Thanks for watching/i,
      /Please subscribe/i,
      /チャンネル/,
      /コメント欄/,
      /いいねボタン/,
      /いいね押して/,
      /フォローして/,
      /リツイート/,
      /概要欄/,
      /サブスク/,
      /メンバーシップ/,
      /スーパーチャット/,
      /配信/,
      /ライブ配信/,
      /生配信/,
      /動画を見て/,
      /次の動画/,
      /前回の動画/,
      /YouTub/i,
      /Twitch/i,
      /TikTok/i,
      /^[\s]*[【\[（\(].+[】\]）\)][\s]*$/,
      /^\[.*\]$/,
      /^♪.*♪$/,
      /music playing/i,
      /\[音楽\]/,
      /\[拍手\]/,
      /\[笑い\]/,
      /\[無音\]/,
      /happens with most of the/i,
      /most of the drugs/i,
      /See you next time/i,
      /^\s*\.\s*$/,
      /^[\s\.]+$/,
      /^[あーうーえーおー\s]+$/,
      /^[アーウーエーオー\s]+$/,
      /^ん[ー～\s]*$/,
      /^[silence]/i,
    ];
    const isHallucination = HALLUCINATION_PATTERNS.some(p => p.test(transcribedText.trim())) && transcribedText.trim().length < 30;
    let filteredText = isHallucination ? "" : transcribedText;
    if(filteredText.trim().length <= 3) filteredText = "";
    return NextResponse.json({ text: filteredText });
  } catch (e) {
    console.error("Transcribe error:", e);
    return NextResponse.json({ error: "サーバーエラー" }, { status: 500 });
  }
}
