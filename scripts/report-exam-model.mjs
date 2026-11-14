// 診察の要約の記録（指示書 exam-to-hydrogen §5・2026-11-15 から 2 週間）
// api_usage_logs の /api/summarize（context=exam-stream＝画面の要約ボタン）を数える。
//   - 実際の件数と金額（モデル別・日別）
//   - 空応答（本文が空・短すぎ）と途中で切れた回（finish_reason が STOP 以外）
//   - フォールバックが働いた回（選んだモデル primary と使ったモデルが違う）と全滅（success=false）
// 実行（本番の env はメモリ上だけ・docs/runbook-prod-env.md）:
//   npx vercel env run -e production --cwd <リンク情報だけのフォルダ> -- node scripts/report-exam-model.mjs [開始日 2026-11-15] [終了日]
// ※ 2026-11-15 より前の行には exam_choice / attempts が無い（記録を始めたのが 11-15）。
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, A = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!U || !A) { console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が要る"); process.exit(1); }
const from = process.argv[2] || "2026-11-15";
const to = process.argv[3] || null;
const H = { apikey: A, Authorization: `Bearer ${A}` };
const jstStart = (d) => new Date(`${d}T00:00:00+09:00`).toISOString();
let rows = [], off = 0;
while (true) {
  const q = `route=eq./api/summarize&context=eq.exam-stream&created_at=gte.${jstStart(from)}` + (to ? `&created_at=lt.${new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 864e5).toISOString()}` : "");
  const d = await (await fetch(`${U}/rest/v1/api_usage_logs?select=created_at,model,success,input_tokens,output_tokens,cost_usd,cost_jpy,request_meta&${q}&order=created_at.asc&limit=1000&offset=${off}`, { headers: H })).json();
  if (!Array.isArray(d)) { console.error("読めない:", d); process.exit(1); }
  rows.push(...d); if (d.length < 1000) break; off += 1000;
}
const ok = rows.filter((r) => r.success !== false);
const failAll = rows.filter((r) => r.success === false);
const sum = (a, f) => a.reduce((s, r) => s + (Number(f(r)) || 0), 0);
const byModel = {}; for (const r of ok) { const m = String(r.model).replace(" (fallback)", ""); (byModel[m] ??= { n: 0, usd: 0, jpy: 0 }); byModel[m].n++; byModel[m].usd += +r.cost_usd || 0; byModel[m].jpy += +r.cost_jpy || 0; }
const byDay = {}; for (const r of ok) { const d = new Date(r.created_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); (byDay[d] ??= { n: 0, jpy: 0 }); byDay[d].n++; byDay[d].jpy += +r.cost_jpy || 0; }
const attempts = rows.flatMap((r) => (r.request_meta?.attempts || []).map((a) => ({ ...a, at: r.created_at })));
const empties = attempts.filter((a) => a.fail === "empty");
const truncated = ok.filter((r) => r.request_meta?.truncated);
const fallback = ok.filter((r) => r.request_meta?.fallback);
const choice = {}; for (const r of rows) { const c = r.request_meta?.exam_choice || "(記録なし)"; const s = r.request_meta?.exam_choice_source || "-"; choice[`${c} / ${s}`] = (choice[`${c} / ${s}`] || 0) + 1; }
console.log(`■ 診察の要約の記録 ${from} 〜 ${to || "今日"}（画面の要約ボタン＝exam-stream）`);
console.log(`件数 ${ok.length} 件（全滅 ${failAll.length} 件）・金額 $${sum(ok, (r) => r.cost_usd).toFixed(3)}（約 ${Math.round(sum(ok, (r) => r.cost_jpy))} 円）`);
console.log("モデル別:", Object.entries(byModel).map(([m, v]) => `${m} ${v.n}件 約${Math.round(v.jpy)}円`).join(" / ") || "なし");
console.log("選んだ値（共有/端末/既定）:", JSON.stringify(choice));
console.log(`空応答（本文が空・短すぎ）${empties.length} 回: ` + JSON.stringify(empties.reduce((m, a) => (m[a.model] = (m[a.model] || 0) + 1, m), {})));
console.log(`途中で切れた（STOP 以外で終わった）${truncated.length} 回: ` + truncated.map((r) => `${r.created_at.slice(0, 16)} ${r.model} ${r.request_meta.finish_reason}`).join(" / "));
console.log(`フォールバックが働いた ${fallback.length} 回: ` + JSON.stringify(fallback.reduce((m, r) => { const k = `${r.request_meta.primary}→${r.model}`; m[k] = (m[k] || 0) + 1; return m; }, {})));
console.log(`失敗した試み（HTTP など・空応答を含む）${attempts.length} 回: ` + JSON.stringify(attempts.reduce((m, a) => { const k = `${a.model} ${a.fail}`; m[k] = (m[k] || 0) + 1; return m; }, {})));
console.log("日別:", Object.entries(byDay).map(([d, v]) => `${d} ${v.n}件 約${Math.round(v.jpy)}円`).join(" / ") || "なし");
