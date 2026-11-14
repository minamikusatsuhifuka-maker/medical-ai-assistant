// 検証シナリオ: 診察の要約の比較を 3 列（3.6 / 3.8 / 4 Hydrogen）に（指示書 three-way-compare・2026-11-15）。実ブラウザ・API は本物
//   mode=all  … ボタンは「⚖ 3.6/3.8/4 比較」、3 列とも生成・金額の表示、比較だけでは extract-rx 0 回・records 0 件、
//               2 列目（3.8）を採用 → 要約欄がその列の本文・extract-rx 1 回・records の保存 1 回（モック）、
//               広い幅で横並び・狭い幅で縦積み
//   mode=fail … dev を GEMINI_TEST_FAIL_MODELS=gemini-3.8-flash で起動しておく → 3.8 の列だけ「⚠ 失敗」、ほかの 2 列は出て採用できる
// 実行: node scripts/verify-scenario-exam-compare.cjs <BASE_URL> [all|fail]
//   Supabase は全モック（records は作らない）。サーバー側の利用ログ（context=exam-compare / extract-rx）は本番 DB に残るので、検証のあとで消す
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
const MODE = process.argv[3] || "all";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }
const TEXT = "患者: 2週間前から首のあたりが痒くて、赤くなってきました。市販の薬を塗っていますが良くなりません。\n医師: 湿疹ですね。ステロイドの塗り薬を出しますので、1日2回、2週間塗ってください。保湿もしっかりしてください。";
const COLS = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-4-hydrogen"];

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1000 } });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("vcmp")) { localStorage.setItem("mk_autoCopySum", "0"); sessionStorage.setItem("vcmp", "1"); } } catch {} });
  const counts = { rx: 0, recordsPost: 0, summarize: [] };
  const recordBodies = [];
  await ctx.route(/\/rest\/v1\//, (r) => {
    const u = r.request().url(); const m = r.request().method();
    if (/\/rest\/v1\/records/.test(u) && m === "POST") { counts.recordsPost++; try { recordBodies.push(JSON.parse(r.request().postData())); } catch {} }
    if (/\/rest\/v1\/app_settings/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: m === "GET" ? "[]" : "{}" });
    return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '[{"id":"verify-x"}]' });
  });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/log-usage", (r) => r.fulfill({ status: 200, body: "{}" }));
  await ctx.route("**/api/extract-rx", async (r) => { counts.rx++; await r.continue(); });
  await ctx.route("**/api/summarize", async (r) => { try { counts.summarize.push(JSON.parse(r.request().postData()).model_preference); } catch {} await r.continue(); });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('button[title="AIで要約する"]:visible').first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator("textarea:visible").first().fill(TEXT);
  const btn = page.locator("button:visible", { hasText: "⚖" }).first();
  assert((await btn.innerText()).trim() === "⚖ 3.6/3.8/4 比較", `ボタンは「⚖ 3.6/3.8/4 比較」（${(await btn.innerText()).trim()}）`);
  assert(counts.summarize.length === 0, "押す前は何も走らない（自動では走らない）");
  await btn.click();
  await page.waitForFunction(() => /比較完了/.test(document.body.innerText) && !/比較（実行中）/.test(document.body.innerText), null, { timeout: 180000 });
  await page.waitForTimeout(800);
  const cols = await page.locator("[data-ab-col]").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-ab-col"), text: e.innerText, rect: e.getBoundingClientRect().toJSON() })));
  assert(cols.map((c) => c.id).join(",") === COLS.join(","), `列は ${COLS.join(" / ")}（${cols.map((c) => c.id).join(",")}）`);
  assert(cols[0].text.includes("Gemini 3.6 Flash") && cols[1].text.includes("Gemini 3.8 Flash") && cols[2].text.includes("Gemini 4 Hydrogen"), "列の名前は Gemini 3.6 Flash / Gemini 3.8 Flash / Gemini 4 Hydrogen");
  assert(counts.summarize.slice().sort().join(",") === COLS.map((c) => "exact:" + c).sort().join(","), `送ったのは 3 列ぶん（${counts.summarize.join(",")}）`);
  const failCol = MODE === "fail" ? "gemini-3.8-flash" : null;
  for (const c of cols) {
    if (c.id === failCol) { assert(/⚠ 失敗/.test(c.text), `${c.id}: 「⚠ 失敗」が出る`); continue; }
    assert(/完了 [\d.]+秒/.test(c.text) && /初回 [\d.]+秒/.test(c.text), `${c.id}: 初回・完了の秒数`);
    assert(/約[\d.]+円/.test(c.text), `${c.id}: 金額（${(c.text.match(/約[\d.]+円/) || [])[0]}）`);
    assert(/📋 コピー/.test(c.text) && /この結果を採用/.test(c.text), `${c.id}: コピーと採用のボタン`);
  }
  const total = await page.locator('[data-ab-cost-total="1"]').innerText();
  console.log("   " + total + " / 列ごと: " + cols.map((c) => c.id + " " + ((c.text.match(/約[\d.]+円/) || [])[0] || "-")).join("・"));
  assert(/この比較 約[\d.]+円/.test(total), "見出しに「この比較 約〇円」");
  assert(counts.rx === 0 && counts.recordsPost === 0, `比較しただけでは extract-rx ${counts.rx} 回・records の保存 ${counts.recordsPost} 回（どちらも 0）`);
  // 並び（広い幅）
  const okCols = cols;
  assert(Math.abs(okCols[0].rect.y - okCols[2].rect.y) < 2 && okCols[0].rect.x < okCols[1].rect.x && okCols[1].rect.x < okCols[2].rect.x, `広い幅（1920px・比較の欄 約880px）では横に 3 列（x=${okCols.map((c) => Math.round(c.rect.x)).join(",")}）`);
  // 採用（2 列目＝3.8。fail のときは 3 列目＝Hydrogen）
  const pick = MODE === "fail" ? 2 : 1;
  const want = await page.locator("[data-ab-col]").nth(pick).locator("div").filter({ hasText: /\S/ }).evaluateAll((els) => { const box = els.find((e) => e.style.whiteSpace === "pre-wrap"); return box ? box.innerText : ""; });
  await page.locator("[data-ab-col]").nth(pick).locator("button", { hasText: "この結果を採用" }).click();
  await page.waitForFunction(() => /要約完了/.test(document.body.innerText), null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  const outVal = await page.evaluate(() => { const t = Array.from(document.querySelectorAll("textarea")).find((x) => /要約結果がここに表示されます|要約中/.test(x.placeholder || "")); return t ? t.value : ""; });
  const norm = (s) => String(s || "").replace(/⚠/g, "").replace(/\s+/g, "");
  assert(want && norm(outVal) === norm(want), `採用した列（${COLS[pick]}）の本文が要約欄に入る`);
  assert(counts.rx === 1, `extract-rx は採用した 1 列にだけ走る（${counts.rx} 回）`);
  assert(counts.recordsPost === 1 && norm(recordBodies[0]?.output_text || recordBodies[0]?.[0]?.output_text) === norm(outVal), `records の保存は 1 回で、中身は採用した本文（モック・${counts.recordsPost} 回）`);
  assert(await page.locator("[data-ab-col]").count() === 0, "採用すると比較の欄は閉じる");
  // 狭い幅で縦積み（もう一度比較して並びだけ見る）
  if (MODE === "all") {
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.waitForTimeout(500);
    await page.locator("button:visible", { hasText: "⚖" }).first().click();
    await page.locator("[data-ab-col]").first().waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(500);
    const r2 = await page.locator("[data-ab-col]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    assert(Math.abs(r2[0].x - r2[2].x) < 2 && r2[0].y < r2[1].y && r2[1].y < r2[2].y && r2[0].width > 200, `狭い幅（900px）では縦に積む（1列250px未満になる幅＝画面1600px以下も縦）（y=${r2.map((r) => Math.round(r.y)).join(",")}・幅 ${Math.round(r2[0].width)}px）`);
    await page.waitForFunction(() => /比較完了/.test(document.body.innerText) && !/比較（実行中）/.test(document.body.innerText), null, { timeout: 180000 });
    await page.locator("button:visible", { hasText: "✕ 閉じる" }).first().click();
    assert(counts.rx === 1 && counts.recordsPost === 1, "閉じただけでは extract-rx も保存も増えない");
  }
  assert(errs.length === 0, "pageerror ゼロ" + (errs.length ? ": " + errs.join(" | ") : ""));
  await browser.close();
  console.log(`✅ [${MODE}] PASS（Supabase は全モック＝records は作っていない）`);
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
