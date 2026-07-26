// disease_aliases への一括登録（指示書 normalization-addendum §3。alias単位のupsertで冪等・何度実行しても安全）
// 前提: 院長が Supabase SQL Editor で add_disease_aliases.sql（combined-setup.sql）を実行済みであること。
// 実行: NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY を環境変数に入れて
//   node scripts/setup-disease-aliases.cjs
// （本番envは `npx vercel env pull` した一時ファイルを source する。.env.local は使わない=破損しているため）
const { ALIASES } = require("./disease-aliases-data.cjs");

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

(async () => {
  if (!SUPA_URL || !SUPA_KEY) { console.error("❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が必要です"); process.exit(1); }
  const rows = Object.entries(ALIASES).map(([alias, canonical]) => ({ alias, canonical }));
  console.log(`disease_aliases へ ${rows.length}行を一括登録します（upsert・冪等）`);
  const res = await fetch(`${SUPA_URL}/rest/v1/disease_aliases?on_conflict=alias`, {
    method: "POST",
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) console.error("❌ disease_aliases テーブルが未作成です。先に combined-setup.sql（add_disease_aliases.sql）をSQL Editorで実行してください");
    else console.error(`❌ 登録失敗: HTTP ${res.status} ${body.slice(0, 300)}`);
    process.exit(1);
  }
  const data = await res.json();
  console.log(`✓ ${data.length}行を登録しました`);
  // 登録後の全行を表示（確認用）
  const chk = await fetch(`${SUPA_URL}/rest/v1/disease_aliases?select=alias,canonical&order=canonical,alias`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  const all = await chk.json();
  console.log(`── 登録済み全${all.length}行 ──`);
  all.forEach((r) => console.log(`  ${r.alias} → ${r.canonical}`));
})();
