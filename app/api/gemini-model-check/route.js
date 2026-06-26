import { ACTIVE_MODELS, PREVIEW_MODELS } from "../../lib/gemini-models";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

// 新顔（known_new）判定から除外する識別子の断片。
// 当アプリが把握済みのモデルと、チャット要約に無関係なモデル種別を新版候補から外す。
const KNOWN_OR_IGNORE = [
  // 当アプリ使用中（ACTIVE/PREVIEW で別途照合するため新顔扱いしない）
  "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro",
  "gemini-3.1-pro-preview", "gemini-3-pro-preview",
  // ASR/Lite 等・把握済み
  "flash-lite",
  // 廃番・旧世代（新顔として出さない）
  "1.5", "1.0", "-2.0-", "gemini-2.0", "pro-vision", "gemini-pro",
  // エイリアスや実験版（具体的な新モデルだけ出したいので除外）
  "latest", "exp-",
  // チャット要約と無関係な種別
  "embedding", "aqa", "imagen", "image", "tts", "veo", "learnlm", "gemma", "vision",
];

function idFromName(n) {
  return (n || "").replace(/^models\//, "");
}

// ListModels で「このAPIキーで現在 generateContent に使えるモデル」一覧を取得し、
// 登録モデル（gemini-models.js）と照合して廃番疑い・新版候補を返す。
export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // キー断片は返さない。チェックが落ちても本体機能に影響させないため 200 + ok:false。
    return Response.json({ ok: false, error: "GEMINI_API_KEY未設定", checkedAt: new Date().toISOString() });
  }
  try {
    let available = [];
    let pageToken = "";
    // ページング対応（最大10ページ・安全弁）。
    for (let i = 0; i < 10; i++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        // Googleのエラー本文にAPIキーは含まれない（キーはURLクエリのみ）。本文は返さずステータスのみ。
        console.error("[gemini-model-check] ListModels error:", res.status);
        return Response.json({ ok: false, error: `ListModels HTTP ${res.status}`, checkedAt: new Date().toISOString() });
      }
      const data = await res.json();
      for (const m of (data.models || [])) {
        const methods = m.supportedGenerationMethods || m.supported_generation_methods || [];
        if (methods.includes("generateContent")) available.push(idFromName(m.name));
      }
      pageToken = data.nextPageToken || data.next_page_token || "";
      if (!pageToken) break;
    }
    available = Array.from(new Set(available)).sort();
    const availSet = new Set(available);

    // 廃番疑い: 登録しているのに一覧に無い安定版モデル。
    const missing = ACTIVE_MODELS.filter(m => !availSet.has(m));
    // プレビュー版の不在（提供流動的なので控えめ扱い）。
    const missingPreview = PREVIEW_MODELS.filter(m => !availSet.has(m));

    // 新版候補: gemini系の flash/pro で、把握済み・無関係種別に該当しない新顔。新しい世代を優先。
    const isKnown = (id) => KNOWN_OR_IGNORE.some(k => id.includes(k));
    const known_new = available
      .filter(id => id.startsWith("gemini-") && (id.includes("flash") || id.includes("pro")))
      .filter(id => !isKnown(id))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .slice(0, 6);

    return Response.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      available,
      missing,
      missingPreview,
      known_new,
    });
  } catch (e) {
    console.error("[gemini-model-check] error:", e?.message);
    return Response.json({ ok: false, error: "チェック中にエラーが発生しました", checkedAt: new Date().toISOString() });
  }
}
