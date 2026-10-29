// 検証シナリオ: 端末(localStorage)に残ったノイズ語一覧の浄化（指示書 dict-chain-and-dup-decision §4）
// 実行: node scripts/verify-scenario-noise-purge.cjs [BASE_URL]   BASE_URL 省略時は http://localhost:3100
//   A) 端末に ["えーっと","かゆみ","はい"]、Supabase は0件（読み込み成功）
//      → 危険語(かゆみ=医療内容・はい=2文字以下)は浄化、えーっと は Supabase にないため外れる。外した3語を画面に表示
//   B) 「確認しました」後に再読み込み → 表示は二度と出ない・一覧は0件のまま
//   C) Supabase の読み込みが失敗(500) → 端末の一覧に触らない（fail-open）
//   Supabase・APIは全モック（作成データなし）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }

async function run(browser, { seed, sbFail }) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((seed) => { try { if (!sessionStorage.getItem("__seeded")) { localStorage.setItem("mk_noisePatterns", JSON.stringify(seed)); sessionStorage.setItem("__seeded", "1"); } } catch {} }, seed);
  await ctx.route(/\/rest\/v1\//, (r) => {
    const req = r.request(); const table = new URL(req.url()).pathname.split("/rest/v1/")[1]; const m = req.method();
    if (table === "noise_patterns" && m === "GET") return sbFail ? r.fulfill({ status: 500, contentType: "application/json", body: '{"message":"injected"}' }) : r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: "[{}]" });
  });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  return { ctx, page, pageErrors };
}
const ls = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mk_noisePatterns") || "null"));
const settingsCount = async (page) => {
  await page.getByRole("button", { name: /⚙️ 設定/ }).first().click();
  const h = page.getByText(/🚫 書き起こしノイズフィルター（\d+件）/).first();
  await h.waitFor({ timeout: 10000 });
  const n = Number((await h.innerText()).match(/（(\d+)件）/)[1]);
  await page.getByRole("button", { name: "✕ 閉じる" }).first().click();
  return n;
};

(async () => {
  const browser = await pw.chromium.launch({ headless: true });

  console.log("── A) 端末に古い一覧・Supabase は0件");
  let { ctx, page, pageErrors } = await run(browser, { seed: ["えーっと", "かゆみ", "はい"], sbFail: false });
  const box = page.locator('[data-noise-purged="1"]');
  assert(await box.isVisible(), "外した語の表示が出る");
  const t = await box.innerText();
  console.log("   表示:", JSON.stringify(t));
  assert(t.includes("3語") && t.includes("「かゆみ」— 医療内容") && t.includes("「はい」— 2文字以下") && t.includes("「えーっと」— Supabase の一覧にない"), "3語と理由が表示される（医療内容・2文字以下・Supabaseにない）");
  assert(JSON.stringify(await ls(page)) === "[]", "端末の一覧は Supabase を正として0件に置き換わる");
  assert((await settingsCount(page)) === 0, "設定 ▸ ノイズフィルターの件数が0件");
  await box.getByRole("button", { name: "確認しました" }).click();
  await page.waitForTimeout(500);
  assert((await box.count()) === 0, "「確認しました」で閉じる");

  console.log("── B) 再読み込み");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  assert((await page.locator('[data-noise-purged="1"]').count()) === 0, "同じ内容の表示は二度と出ない");
  assert(JSON.stringify(await ls(page)) === "[]", "一覧は0件のまま");
  assert(pageErrors.length === 0, "A・B pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await ctx.close();

  console.log("── C) Supabase の読み込みが失敗");
  ({ ctx, page, pageErrors } = await run(browser, { seed: ["えーっと"], sbFail: true }));
  assert(JSON.stringify(await ls(page)) === '["えーっと"]', "読み込み失敗時は端末の一覧に触らない（fail-open）");
  assert((await page.locator('[data-noise-purged="1"]').count()) === 0, "外した語はないので表示も出ない");
  assert((await settingsCount(page)) === 1, "設定の件数は1件のまま");
  assert(pageErrors.length === 0, "C pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await ctx.close();

  await browser.close();
  console.log("✅ 全シナリオ PASS（Supabase・APIは全モック＝作成データなし）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
