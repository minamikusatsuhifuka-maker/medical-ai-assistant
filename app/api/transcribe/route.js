import { NextResponse } from "next/server";

const WHISPER_PROMPT = "皮膚科・美容皮膚科診療の会話。頻出用語：アトピー性皮膚炎、接触性皮膚炎、蕁麻疹、乾癬、帯状疱疹、足白癬、爪白癬、尋常性ざ瘡、酒さ、脂漏性皮膚炎、円形脱毛症、男性型脱毛症、デュピクセント、ミチーガ、プロトピック、コレクチム、モイゼルト、デルモベート、リンデロン、ロコイド、ヒルドイド、アレグラ、ザイザル、ビラノア、ラミシール、バルトレックス、ディフェリン、エピデュオ、プロペシア、ミノキシジル、トラネキサム酸、ボトックス、ヒアルロン酸、ピコレーザー、ダーマペン、液体窒素、ナローバンドUVB、プロアクティブ療法";

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
    const finalPrompt = (WHISPER_PROMPT + (dictTerms ? "、" + dictTerms : "")).slice(0, 500);
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
