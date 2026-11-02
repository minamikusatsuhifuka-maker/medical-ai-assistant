import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";
import { GEMINI_MODELS, geminiTestFail } from "../../lib/gemini-models";

export const maxDuration = 800;
export const dynamic = "force-dynamic";

const SEMINAR_PROMPT = `あなたは医療クリニックの学習支援AIです。
以下のセミナー音声書き起こしを、独学・復習に使える品質の「詳細な要約・まとめ」に再構成してください。

【出力構成】
# セミナータイトル（推定）

## 📍 セミナー概要
- 講師・テーマ・主要メッセージを2-3行で

## 🎯 主要トピックと重要ポイント
（複数の見出し+詳細説明、各セクション300-500字程度で深掘り）

### トピック1: ○○
**重要ポイント**:
- ポイント1（詳細）
- ポイント2（詳細）

**詳細解説**:
（講師の説明を、聞き逃した人にも分かるよう補足込みで再構成）

### トピック2: ○○
...

## 💎 名言・印象的なフレーズ
- 「（引用）」 ← 講師の言葉そのまま
- 「（引用）」
（5-10個程度ピックアップ）

## ✅ アクションアイテム
（セミナーから持ち帰って実行すべき具体的なTo Do）
1. ...
2. ...

## 📚 補足解説（専門用語・背景知識）
（聞き手が知らなさそうな前提知識を補完）

## 📝 全体総括
（セミナー全体を1段落で総括）

【ルール】
- 議事録より深く、独学・復習に使える品質に
- 講師の生の言葉と AIの解釈を区別する
- 元の書き起こしの誤字・口語を整理しつつ、本質は保持
- マークダウン形式で構造化
- 前置きや注釈（「音声認識の精度が〜」等）は一切書かない`;

// 2026-11-02 指示書 model-display-unify §3: この画面は選択肢をなくし、共通の順番（GEMINI_MODELS＝3.8 先頭）だけを使う。
// 古い端末が送る model_preference（gemini-3-pro・gemini-3-5-flash・claude 等）はすべてこれに読み替える。
function buildGeminiModelList(model_preference) {
  return GEMINI_MODELS;
}

async function callGemini(transcript, model_preference) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
  const models = buildGeminiModelList(model_preference);
  let lastError = null;
  for (const model of models) {
    try {
      if (geminiTestFail(model)) throw new Error(`${model}: 検証のため失敗させた`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SEMINAR_PROMPT }] },
          contents: [{ parts: [{ text: transcript }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 16384 },
        }),
      });
      if (!res.ok) { lastError = `${model}: HTTP ${res.status}`; continue; }
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const summary = parts.filter(p => !p.thought).map(p => p.text || "").join("");
      if (summary.trim()) {
        return {
          summary, model,
          input_tokens: data.usageMetadata?.promptTokenCount || 0,
          output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
        };
      }
      lastError = `${model}: empty response`;
    } catch (e) { lastError = `${model}: ${e.message}`; }
  }
  throw new Error("Gemini全モデル失敗: " + lastError);
}

export async function POST(req) {
  let mp = null;
  try {
    const { transcript, model_preference = "gemini-3-pro" } = await req.json();
    mp = model_preference;
    if (!transcript || transcript.length < 100) {
      return NextResponse.json({ error: "書き起こしテキストが短すぎます（100文字以上必要）" }, { status: 400 });
    }
    // Claude の選択肢はなくした（§3）。古い端末が claude を送っても共通の順番（GEMINI_MODELS）で生成する
    const r = await callGemini(transcript, model_preference);
    const usage = await logUsage({
      route: "/api/seminar-summarize",
      model: r.model,
      context: "seminar-summary",
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      request_meta: { char_length: transcript.length, model_preference },
    });
    return NextResponse.json({ summary: r.summary, model: r.model, usage });
  } catch (e) {
    console.error("[seminar-summarize] error:", e);
    try { await logUsage({ route: "/api/seminar-summarize", model: mp || "unknown", success: false, error_message: e.message }); } catch {}
    return NextResponse.json({ error: "セミナー要約エラー: " + e.message }, { status: 500 });
  }
}
