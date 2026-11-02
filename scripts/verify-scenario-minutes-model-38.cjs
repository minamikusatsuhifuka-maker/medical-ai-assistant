// 検証シナリオ: 議事録の要約モデルは Gemini 3.8 Flash だけ（選択肢なし・表示のみ）。古い設定が残っていても壊れない。
// フォールバックしたら「Gemini 3.7 Flash で生成」が画面に出る（実ブラウザ）
// 実行: node scripts/verify-scenario-minutes-model-38.cjs <BASE_URL> <mode>
//   mode=real     … /api/minutes-summarize は本物（Gemini を実際に呼ぶ）。3.8 で生成され、フォールバックの表示が出ない
//   mode=fallback … 本物を呼ぶ。dev を MINUTES_TEST_FAIL_MODELS=gemini-3.8-flash で起動しておく → 3.7 で生成・表示が出る
//   （3.8・3.7 を両方失敗させたときは EXPECT_FB="Gemini 3.6 Flash" を付けて fallback で流す）
//   mode=mockfb   … 応答をモック（3.7 で生成した形）して表示だけ確かめる（本番エイリアス用）
//   Supabase は全モック（議事録の行は作らない）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
const MODE = process.argv[3] || "real";
const FB = process.env.EXPECT_FB || "Gemini 3.7 Flash"; // フォールバックで期待するモデルの表示名
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }
const TEXT = "それでは朝礼を始めます。来週の月曜日から受付の順番を変えます。在庫の確認は木曜日に田中さんがします。新しい予約の仕組みは来月から試します。以上です。";

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  // 古い設定（Claude を選んでいた端末）
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("v38")) { localStorage.setItem("mk_minutesModel", "claude"); sessionStorage.setItem("v38", "1"); } } catch {} });
  await ctx.route(/\/rest\/v1\//, (r) => { const m = r.request().method(); return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '{"id":"verify-x"}' }); });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/log-usage", (r) => r.fulfill({ status: 200, body: "{}" }));
  await ctx.route("**/api/extract-*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const sentBodies = [];
  await ctx.route("**/api/minutes-summarize", async (r) => {
    try { sentBodies.push(JSON.parse(r.request().postData())); } catch {}
    if (MODE === "mockfb") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: "【端的な要約】\n・受付の順番を変える\n【議事録】\n■ 決定事項\n・来週から", model: "gemini-3.7-flash", models: ["gemini-3.7-flash"], fallback: true, chunks: 1 }) });
    return r.continue();
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const ta = page.locator('textarea[placeholder="録音開始すると自動で書き起こされます。手動入力も可能です。"]');
  for (let k = 0; k < 6; k++) { await page.locator("button:visible", { hasText: "議事録" }).first().click(); try { await ta.waitFor({ state: "visible", timeout: 3000 }); break; } catch {} }
  await page.waitForTimeout(1500);

  console.log(`--- [${MODE}] 画面の表示と古い設定 ---`);
  const label = page.locator('[data-minutes-model="gemini-3.8-flash"]');
  assert(await label.count() === 1 && (await label.innerText()).includes("要約モデル: Gemini 3.8 Flash"), "「要約モデル: Gemini 3.8 Flash」の表示だけ");
  const section = page.locator("div", { has: label }).last();
  for (const old of ["Gemini 3.7 Flash ✨", "Gemini 3.1 Pro", "Claude Sonnet 4.6", "Gemini 3.5 Flash", "Gemini 3.6 Flash"]) {
    assert(await page.locator("button:visible", { hasText: old }).count() === 0 || !(await section.innerText()).includes(old), `議事録の選択肢「${old}」は出ない`);
  }
  const head = await page.locator("h2", { hasText: "📝 議事録まとめ" }).locator("xpath=..").innerText();
  assert(head.includes("Gemini 3.8 Flash") && !head.includes("3.7"), "見出しの横も Gemini 3.8 Flash（古い 3.7 の表示が無い）");
  assert(await page.evaluate(() => localStorage.getItem("mk_minutesModel")) === null, "古い設定 mk_minutesModel=claude は消える（読み替えて開ける）");

  console.log(`--- [${MODE}] 議事録を作る ---`);
  await ta.fill(TEXT);
  await page.locator("button:visible", { hasText: "✨ 要約作成" }).first().click();
  const badge = page.locator("span", { hasText: "📋 議事録" }).first();
  await page.waitForFunction(() => [...document.querySelectorAll("span")].some((s) => /📋 議事録.*Gemini/.test(s.textContent || "")), null, { timeout: 120000 });
  const bt = await badge.innerText();
  console.log("   見出し:", JSON.stringify(bt));
  assert(sentBodies.length >= 1 && sentBodies[0].model === "gemini-3-8-flash", "送るモデルは gemini-3-8-flash（古い設定 claude は使わない）");
  const fb = page.locator('[data-minutes-fallback="1"]');
  if (MODE === "real") {
    assert(bt.includes("Gemini 3.8 Flash"), "3.8 で生成された（見出しのモデル表示）");
    assert(await fb.count() === 0, "フォールバックの表示は出ない");
  } else {
    assert(bt.includes(FB), `${FB} で生成された（見出しのモデル表示）`);
    assert(await fb.count() === 1 && (await fb.innerText()).includes(`Gemini 3.8 Flash が使えず ${FB} で生成`), `画面に「Gemini 3.8 Flash が使えず ${FB} で生成」が出る`);
  }
  const out = await page.locator("textarea").evaluateAll((els) => els.map((e) => e.value).find((v) => v.includes("【議事録】") || v.includes("■")) || "");
  assert(out.length > 20, `議事録の本文が出ている（${out.length}字）`);
  assert(errs.length === 0, "pageerror ゼロ" + (errs.length ? ": " + errs.join(" | ") : ""));
  await browser.close();
  console.log(`✅ [${MODE}] PASS（Supabase は全モック＝議事録の行は作っていない）`);
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
