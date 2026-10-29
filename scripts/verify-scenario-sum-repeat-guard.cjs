// 検証シナリオ: 要約の連打ガード（10/29 11:52 F2押しっぱなしで要約が約40秒に900回走った障害の再発防止）
// 実行: node scripts/verify-scenario-sum-repeat-guard.cjs [BASE_URL]   BASE_URL 省略時は http://localhost:3100
//   A) F2 を押しっぱなし相当（repeat付き keydown 40回）→ 要約は1回
//   B) 要約中に F2 を別々に2回押す（repeatなし）→ 実行中は受け付けず1回
//   C) 要約中に ⚡要約ボタンを2連打 → 1回（要約中はボタンが disabled）
//   D) 通常の1回押し（ボタン・F2）は従来どおり動く
//   E) extract-rx は最新の要約の分だけ反映（古い応答が後から届いても上書きしない）
//   pageerror ゼロ・Supabase/APIは全モック（作成データなし）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.route(/\/rest\/v1\//, (r) => { const m = r.request().method(); return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '[{"id":"verify-x"}]' }); });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/extract-*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  let nSum = 0;
  await ctx.route("**/api/summarize", async (r) => {
    const n = ++nSum;
    await new Promise((z) => setTimeout(z, 1200));
    r.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ chunk: "S）検証の要約 #" + n, model: "m" })}\n\ndata: ${JSON.stringify({ done: true, model: "m" })}\n\n` });
  });
  // extract-rx: 1回目は遅く(2.5s)・2回目は速く返し、古い応答が後から届く状況を作る
  let nRx = 0;
  await ctx.route("**/api/extract-rx", async (r) => {
    const n = ++nRx;
    await new Promise((z) => setTimeout(z, n === 1 ? 2500 : 100));
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ name: n === 1 ? "古い応答の薬" : "新しい応答の薬", usage: "1日2回", duration: "" }] }) });
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const tx = page.locator('textarea[placeholder*="録音ボタン"]').first();
  await tx.waitFor({ timeout: 30000 });
  const idleBtn = page.getByRole("button", { name: "⚡ 要約" });
  const sumBtn = page.locator('button[title="AIで要約する"]');
  for (let i = 0; i < 10; i++) { await tx.fill("二週間前から赤みとかゆみが続いています。市販薬では改善しませんでした。"); await page.waitForTimeout(600); if (await idleBtn.isEnabled()) break; }
  const waitIdle = () => idleBtn.waitFor({ timeout: 15000 });
  const blurTextarea = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
  const key = (repeat) => page.evaluate((repeat) => window.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", repeat, bubbles: true })), repeat);

  // D) 通常の1回押し（ボタン）
  nSum = 0;
  await sumBtn.click();
  await page.waitForTimeout(100);
  assert(await sumBtn.isDisabled(), "D) 要約中は ⚡要約ボタンが disabled");
  await waitIdle(); await page.waitForTimeout(300);
  assert(nSum === 1, `D) ボタン1回押し → 要約1回（実測 ${nSum}）`);

  // A) F2 押しっぱなし（1回目 repeat=false、以降 repeat=true を30ms間隔で39回）
  await blurTextarea();
  nSum = 0;
  for (let i = 0; i < 40; i++) { await key(i > 0); await page.waitForTimeout(30); }
  await waitIdle(); await page.waitForTimeout(500);
  assert(nSum === 1, `A) F2 押しっぱなし相当(keydown 40回) → 要約1回（実測 ${nSum}）`);

  // B) 要約中に別々の F2 押下（repeatなし）
  nSum = 0;
  await key(false); await page.waitForTimeout(200); await key(false); await page.waitForTimeout(200); await key(false);
  await waitIdle(); await page.waitForTimeout(500);
  assert(nSum === 1, `B) 要約中に F2 を別々に3回 → 要約1回（実測 ${nSum}）`);

  // C) 要約中のボタン2連打（disabled を無視して DOM の click を2回送る＝最悪の連打）
  nSum = 0;
  await page.evaluate(() => { const b = document.querySelector('button[title="AIで要約する"]'); b.click(); setTimeout(() => b.click(), 30); setTimeout(() => b.click(), 60); });
  await page.waitForTimeout(200);
  await waitIdle(); await page.waitForTimeout(500);
  assert(nSum === 1, `C) 要約中のボタン連打 → 要約1回（実測 ${nSum}）`);

  // E) extract-rx: 1回目(遅い)より後の2回目(速い)の結果が残る。各要約の完了後に1回ずつ呼ぶ
  //    （A〜D で extract-rx は既に呼ばれているため、ここで数え直して遅延順を作る）
  nRx = 0;
  await sumBtn.click(); await waitIdle(); // 要約1 → extract-rx #1（2.5s で返る）
  await sumBtn.click(); await waitIdle(); // 要約2 → extract-rx #2（0.1s で返る）
  await page.waitForTimeout(3500);
  const rxText = await page.evaluate(() => document.body.innerText);
  assert(rxText.includes("新しい応答の薬") && !rxText.includes("古い応答の薬"), "E) 処方リストは最新の要約の抽出結果だけ（古い応答が後から来ても上書きしない）");
  assert(!(await page.getByText("💊 処方リスト抽出中...").count()), "E) 「処方リスト抽出中…」が出っぱなしにならない");

  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await browser.close();
  console.log("✅ 全シナリオ PASS（Supabase・APIは全モック＝作成データなし）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
