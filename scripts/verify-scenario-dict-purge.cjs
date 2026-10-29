// 検証シナリオ: 端末(localStorage mk_dict)に残った辞書の突き合わせ（指示書 chain-deploy-and-mkdict-decision §2）
// 実行: node scripts/verify-scenario-dict-purge.cjs [BASE_URL]   BASE_URL 省略時は http://localhost:3100
//   A) 端末に [れも→でも, 古い語→旧い語, ニキビ→痤瘡, 既定辞書の1組]、Supabase は [ニキビ→ざ瘡]（読み込み成功）
//      → 端末の辞書は「Supabase＋最新の既定辞書」に置き換わり、外れた3組を理由つきで表示・使用ログに送る
//      → 表示は メイン・履歴・（メインに戻って）設定 のどの画面でも出たまま。「確認しました」で閉じる
//   B) 再読み込み → 表示は二度と出ない
//   C) Supabase の読み込みが失敗(500) → 端末の辞書に触らない（fail-open）
//   Supabase・APIは全モック（作成データなし）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const fs = require("fs");
const path = require("path");
const BASE = process.argv[2] || "http://localhost:3100";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }
const src = fs.readFileSync(path.join(__dirname, "../app/page.js"), "utf8");
const a = src.indexOf("const DEFAULT_DICT=[");
const DEFAULT_DICT = eval(src.slice(src.indexOf("[", a), src.indexOf("];", a) + 1));
const DEF0 = DEFAULT_DICT.find(([f]) => f !== "ニキビ");

async function run(browser, { seed, sbFail }) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((seed) => { try { if (!sessionStorage.getItem("__seeded")) { localStorage.setItem("mk_dict", JSON.stringify(seed)); sessionStorage.setItem("__seeded", "1"); } } catch {} }, seed);
  await ctx.route(/\/rest\/v1\//, (r) => {
    const req = r.request(); const table = new URL(req.url()).pathname.split("/rest/v1/")[1]; const m = req.method();
    if (table === "dictionary" && m === "GET") return sbFail ? r.fulfill({ status: 500, contentType: "application/json", body: '{"message":"injected"}' }) : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ from_text: "ニキビ", to_text: "ざ瘡" }]) });
    return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: "[{}]" });
  });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  const logs = [];
  await ctx.route("**/api/log-usage", (r) => { try { logs.push(JSON.parse(r.request().postData())); } catch {} r.fulfill({ status: 200, body: "{}" }); });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  return { ctx, page, pageErrors, logs };
}
const ls = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("mk_dict") || "null"));

(async () => {
  const browser = await pw.chromium.launch({ headless: true });

  console.log("── A) 端末に古い辞書・Supabase は1件");
  const seed = [["れも", "でも"], ["古い語", "旧い語"], ["ニキビ", "痤瘡"], DEF0];
  let { ctx, page, pageErrors, logs } = await run(browser, { seed, sbFail: false });
  const box = page.locator('[data-dict-purged="1"]');
  assert(await box.isVisible(), "メイン画面: 外した組の表示が出る");
  const t = await box.innerText();
  console.log("   表示:", JSON.stringify(t));
  assert(t.includes("3組") && t.includes("「れも→でも」— 既知の有害な登録") && t.includes("「古い語→旧い語」— Supabase にも最新の既定辞書にもない") && t.includes("「ニキビ→痤瘡」— 行き先を Supabase・既定辞書の「ざ瘡」に揃えた"), "3組と理由が表示される（有害・どこにもない・行き先を揃えた）");
  assert(!t.includes(`${DEF0[0]}→${DEF0[1]}`), "既定辞書にある組は外れない");
  const d = await ls(page);
  const want = [["ニキビ", "ざ瘡"], ...DEFAULT_DICT.filter(([f]) => f !== "ニキビ")];
  assert(JSON.stringify(d) === JSON.stringify(want), `端末の辞書は Supabase＋最新の既定辞書（${want.length}組）に置き換わる`);
  const pl = logs.filter((l) => l.route === "/api/dict-purge-client");
  assert(pl.length === 1 && pl[0].request_meta.removed_count === 3 && pl[0].request_meta.has_remo === true, "使用ログに route=/api/dict-purge-client・3組・has_remo=true が1回送られる: " + JSON.stringify(pl[0] && pl[0].request_meta));
  await page.getByRole("button", { name: /📂 履歴/ }).first().click();
  await page.waitForTimeout(800);
  assert(await box.isVisible(), "履歴画面に移っても表示は出たまま");
  await page.getByRole("button", { name: "✕ 閉じる" }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /⚙️ 設定/ }).first().click();
  await page.waitForTimeout(800);
  assert(await box.isVisible(), "設定画面でも表示は出たまま");
  await box.getByRole("button", { name: "確認しました" }).click();
  await page.waitForTimeout(500);
  assert((await box.count()) === 0, "「確認しました」で閉じる");

  console.log("── B) 再読み込み");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  assert((await page.locator('[data-dict-purged="1"]').count()) === 0, "同じ内容の表示は二度と出ない");
  assert(JSON.stringify(await ls(page)) === JSON.stringify(want), "端末の辞書は置き換わったまま");
  assert(pageErrors.length === 0, "A・B pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await ctx.close();

  console.log("── C) Supabase の読み込みが失敗");
  ({ ctx, page, pageErrors, logs } = await run(browser, { seed: [["古い語", "旧い語"]], sbFail: true }));
  assert(JSON.stringify(await ls(page)) === '[["古い語","旧い語"]]', "読み込み失敗時は端末の辞書に触らない（fail-open）");
  assert((await page.locator('[data-dict-purged="1"]').count()) === 0, "表示も出ない");
  assert(logs.filter((l) => l.route === "/api/dict-purge-client").length === 0, "使用ログも送らない");
  assert(pageErrors.length === 0, "C pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await ctx.close();

  await browser.close();
  console.log("✅ 全シナリオ PASS（Supabase・APIは全モック＝作成データなし）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
