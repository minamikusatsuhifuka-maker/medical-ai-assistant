// Supabase dictionary の整理（2026-10-29 院長承認・1回だけ実行したもの。記録として残す）
// 実行: SB_URL=... SB_KEY=... node scripts/dict-cleanup-20261029.mjs [--dry]
//   scripts/data/dict-cleanup-20261029.json の delete(id指定)・update(id指定で to_text)・insert を順に行う
//   削除・修正は、対象行の置換前・置換後が計画どおりのときだけ行う（違えば何もせず止まる）
import fs from "node:fs";
const plan = JSON.parse(fs.readFileSync(new URL("./data/dict-cleanup-20261029.json", import.meta.url), "utf8"));
const { SB_URL, SB_KEY } = process.env;
const dry = process.argv.includes("--dry");
if (!SB_URL || !SB_KEY) throw new Error("SB_URL / SB_KEY を指定してください");
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
const api = async (method, q, body) => {
  const r = await fetch(`${SB_URL}/rest/v1/dictionary${q}`, { method, headers: H, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${q}: ${r.status} ${await r.text()}`);
  return r.json();
};
const all = await api("GET", "?select=id,from_text,to_text&limit=5000");
const byId = new Map(all.map((r) => [r.id, r]));
const bad = [...plan.delete.map((d) => [d, d.to_text]), ...plan.update.map((u) => [u, u.old_to])]
  .filter(([x, to]) => { const r = byId.get(x.id); return !r || r.from_text !== x.from_text || r.to_text !== to; });
if (bad.length) throw new Error("計画と違う行があるため止める: " + JSON.stringify(bad.map(([x]) => x.id)));
const ins = plan.insert.filter((i) => !all.some((r) => r.from_text === i.from_text && r.to_text === i.to_text));
console.log(`現在 ${all.length}行 / 削除 ${plan.delete.length} / 修正 ${plan.update.length} / 追加 ${ins.length}（既にある ${plan.insert.length - ins.length}）${dry ? "（--dry: 実行しない）" : ""}`);
if (dry) process.exit(0);
const del = await api("DELETE", `?id=in.(${plan.delete.map((d) => d.id).join(",")})`);
console.log("削除した行:", del.length);
for (const u of plan.update) { const r = await api("PATCH", `?id=eq.${u.id}`, { to_text: u.to_text }); console.log("修正:", r.map((x) => `${x.from_text}→${x.to_text}`).join(",")); }
if (ins.length) { const r = await api("POST", "", ins.map(({ from_text, to_text }) => ({ from_text, to_text }))); console.log("追加:", r.map((x) => `${x.from_text}→${x.to_text}`).join(",")); }
const after = await api("GET", "?select=id&limit=5000");
console.log(`整理後 ${after.length}行`);
