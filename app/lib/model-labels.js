// 画面に出すモデルの表示名（2026-11-02 指示書 model-display-unify）
// モデル名を画面に固定文字列で書かないための共通部品。並び順は app/lib/gemini-models.js が正で、ここはそれを読むだけ。
import { GEMINI_MODELS, EXAM_SUMMARY_MODELS } from "./gemini-models.js";

// API のモデル名（gemini-3.8-flash など）→ 表示名。知らない名前はそのまま返す
export function modelLabel(id) {
  const s = String(id || "").toLowerCase();
  if (!s) return "";
  if (s.includes("claude")) return "Claude Sonnet 4.6";
  if (s.includes("3.1-flash-lite")) return "Gemini 3.1 Flash-Lite";
  if (s.includes("3.1-pro") || s.includes("3-pro-preview")) return "Gemini 3.1 Pro";
  const m = s.match(/gemini-(\d+)\.(\d+)-(flash-lite|flash|pro)/);
  if (m) return `Gemini ${m[1]}.${m[2]} ${m[3] === "flash-lite" ? "Flash-Lite" : m[3] === "pro" ? "Pro" : "Flash"}`;
  return String(id);
}

// 共通の順番の先頭（36ルート・分析系の画面・議事録）
export const COMMON_PRIMARY_MODEL = GEMINI_MODELS[0];
export const COMMON_PRIMARY_LABEL = modelLabel(GEMINI_MODELS[0]);
// 診察の要約の既定の先頭（速さの安定を優先して 3.6 先頭・8/14 の判断）
export const EXAM_PRIMARY_LABEL = modelLabel(EXAM_SUMMARY_MODELS[0]);
// 「3.8 → 3.7 → 3.6」のような順番の表示（先頭から n 個）
export const chainLabel = (models = GEMINI_MODELS, n = 3) =>
  models.slice(0, n).map((m, i) => (i === 0 ? modelLabel(m) : modelLabel(m).replace(/^Gemini /, "").replace(/ Flash$/, ""))).join(" → ");

// 生の API エラーを画面に出さないための言い換え（中身はコンソールにだけ残す・2026-11-02 exam-model-decision）
export function friendlyModelError(err) {
  const s = String(err || "");
  if (/abort/i.test(s)) return "停止しました";
  const h = s.match(/HTTP (\d{3})/);
  return "生成に失敗しました。時間をおいてもう一度お試しください" + (h ? `（HTTP ${h[1]}）` : "");
}
