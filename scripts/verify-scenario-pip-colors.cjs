// 検証シナリオ: PiP小窓の周期更新で pipBorder/pipText の ReferenceError が出ない・テンプレートボタンの表示が更新される
// 実行: node scripts/verify-scenario-pip-colors.cjs [BASE_URL]   BASE_URL 省略時は http://localhost:3100
//   A) 小窓を開いて3秒（周期処理が6回回る）→ pageerror ゼロ
//   B) 本画面でテンプレートを切り替える → 小窓の該当ボタンが太字・2px枠に変わる（周期処理が最後まで走っている）
//   C) 小窓の要約完了画面の📋コピー → クリップボードの中身が一致（bc96663 の小窓コピーの回帰確認）
//   Supabase・APIは全モック（作成データなし）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
const SUM = "S) 顔の湿疹\nP) ステロイド外用、2週間後に再診";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route(/\/rest\/v1\//, (r) => { const m = r.request().method(); return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '[{"id":"verify-x"}]' }); });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/extract-*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' }));
  await ctx.route("**/api/summarize", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ chunk: SUM, model: "m" })}\n\ndata: ${JSON.stringify({ done: true, model: "m" })}\n\n` }));
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const tx = page.locator('textarea[placeholder*="録音ボタン"]').first();
  await tx.waitFor({ timeout: 30000 });
  const sumBtn = page.getByRole("button", { name: "⚡ 要約" });
  for (let i = 0; i < 10; i++) { await tx.fill("二週間前から赤みとかゆみが続いています。市販薬では改善しませんでした。"); await page.waitForTimeout(600); if (await sumBtn.isEnabled()) break; }

  await page.locator('button[title="フローティング小窓を開く（PiPモード）"]').first().click();
  for (let i = 0; i < 20 && ctx.pages().length < 2; i++) await page.waitForTimeout(250);
  const pip = ctx.pages().find((p) => p !== page);
  assert(!!pip, "小窓（Document PiP）が開く");
  await page.waitForTimeout(3000);
  assert(pageErrors.length === 0, "A) 小窓を開いて3秒: pageerror ゼロ（pipBorder/pipText の ReferenceError なし）" + (pageErrors.length ? ": " + pageErrors.slice(0, 2).join(" | ") : ""));

  const weight = (id) => pip.evaluate((id) => getComputedStyle(document.getElementById(id)).fontWeight, id);
  const border = (id) => pip.evaluate((id) => document.getElementById(id).style.border, id);
  // 小窓の「簡潔」ボタンでテンプレートを切り替え → 周期処理が表示を更新する
  await pip.locator("#pip-tpl-min").click();
  await page.waitForTimeout(1500);
  assert((await weight("pip-tpl-min")) === "700" && (await border("pip-tpl-min")).startsWith("2px"), "B) 選んだテンプレート（簡潔）が太字・2px枠に更新される");
  assert((await border("pip-tpl-soap")).startsWith("1px"), "B) 選んでいないボタンは1px枠（pipBorder の色で描画）");

  await page.evaluate(() => navigator.clipboard.writeText("SENTINEL"));
  await pip.evaluate(() => document.getElementById("pip-sum").onclick());
  await pip.locator("#pip-alert").waitFor({ timeout: 15000 });
  const copyBtn = pip.locator("#pip-alert button", { hasText: /コピー/ }).first();
  await page.evaluate(() => navigator.clipboard.writeText("SENTINEL2"));
  await copyBtn.click();
  await pip.waitForTimeout(800);
  assert((await page.evaluate(() => navigator.clipboard.readText())) === SUM, "C) 小窓の📋コピー → クリップボードの中身が要約と一致");

  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.slice(0, 2).join(" | ") : ""));
  await browser.close();
  console.log("✅ 全シナリオ PASS（Supabase・APIは全モック＝作成データなし）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
