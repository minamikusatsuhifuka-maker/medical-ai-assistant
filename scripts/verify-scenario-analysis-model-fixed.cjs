// 検証シナリオ: セミナー学習・カウンセリング分析・ジャーニーマップは選択肢なし（共通の順番＝3.8 先頭）。
// 古い設定が残っていても壊れず、生成すると使ったモデルが出る。フォールバックしたら注意が出る（実ブラウザ）
// 実行: node scripts/verify-scenario-analysis-model-fixed.cjs <BASE_URL> [EXPECT]
//   EXPECT … 生成で期待するモデルの表示名（既定 "Gemini 3.8 Flash"）。dev を GEMINI_TEST_FAIL_MODELS=gemini-3.8-flash,gemini-3.7-flash
//            で起動したときは "Gemini 3.6 Flash" を渡す（フォールバックの注意も確かめる）
//   Supabase は全モック（分析の行は作らない）。ジャーニーマップは記録の読み込みもモックで返す
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
const EXPECT = process.argv[3] || "Gemini 3.8 Flash";
const FALLBACK = EXPECT !== "Gemini 3.8 Flash";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }
const SEMINAR = "本日のセミナーでは、クリニックの受付業務の改善について話しました。".repeat(6) + "患者さんの待ち時間を減らすために、予約の枠を見直すことが大切です。";
const COUNSEL = "患者: シミが気になっていて、レーザー治療を考えています。費用と回数が心配です。\n医師: まず肌の状態を確認して、3回程度の照射をおすすめします。費用は1回あたりの目安をお伝えします。";
const RECORDS = [{ id: "v1", created_at: "2026-10-01T00:00:00Z", input_text: COUNSEL.repeat(3), output_text: "S: シミ O: 頬に色素斑 A: 老人性色素斑 P: レーザー", content: COUNSEL }];

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("vfix")) {
    localStorage.setItem("mk_smnSummaryModel", "claude"); localStorage.setItem("mk_csModels", JSON.stringify(["gemini-3-pro", "claude"]));
    localStorage.setItem("mk_csModel", "claude"); localStorage.setItem("mk_journeyModels", JSON.stringify(["gemini-3-5-flash", "claude"]));
    localStorage.setItem("mk_topMenuVisible", JSON.stringify(["hist", "settings", "minutes", "seminar", "counsel", "tasks"]));
    sessionStorage.setItem("vfix", "1"); } } catch {} });
  await ctx.route(/\/rest\/v1\//, (r) => { const m = r.request().method(); const u = r.request().url();
    if (m === "GET" && /\/rest\/v1\/(records|counseling_records)/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RECORDS) });
    return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '{"id":"verify-x"}' }); });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/log-usage", (r) => r.fulfill({ status: 200, body: "{}" }));
  const sent = [];
  for (const api of ["seminar-summarize", "summarize", "journey-map"]) await ctx.route(`**/api/${api}`, (r) => { try { sent.push({ api, body: JSON.parse(r.request().postData()) }); } catch {} r.continue(); });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const tab = async (label, ready) => { for (let k = 0; k < 8; k++) { await (label instanceof RegExp ? page.locator("button:visible").filter({ hasText: label }) : page.locator("button:visible", { hasText: label })).first().click().catch(() => {}); try { await page.locator(ready).first().waitFor({ state: "visible", timeout: 3000 }); return; } catch {} } throw new Error("画面を開けない: " + label); };
  const noOldChoices = async (sel, label) => {
    const box = page.locator(sel);
    assert(await box.count() === 1 && (await box.innerText()).includes("使うモデル: Gemini 3.8 Flash"), `${label}: 「使うモデル: Gemini 3.8 Flash」の表示だけ`);
    for (const old of ["Gemini 3.1 Pro", "Gemini 3.5 Flash", "Claude Sonnet 4.6"]) assert(await page.locator("button:visible", { hasText: old }).count() === 0, `${label}: 選択肢「${old}」は出ない`);
  };
  const checkFallback = async (label) => {
    const fb = page.locator('[data-model-fallback="1"]:visible');
    if (FALLBACK) assert(await fb.count() >= 1 && (await fb.first().innerText()).includes(`Gemini 3.8 Flash が使えず ${EXPECT} で生成`), `${label}: 「Gemini 3.8 Flash が使えず ${EXPECT} で生成」が出る`);
    else assert(await fb.count() === 0, `${label}: フォールバックの注意は出ない`);
  };

  console.log(`--- セミナー学習（期待: ${EXPECT}）---`);
  await tab("セミナー学習", '[data-fixed-model="seminar"]');
  await noOldChoices('[data-fixed-model="seminar"]', "セミナー");
  await page.locator("button:visible", { hasText: "📝 テキストを直接入力" }).first().click();
  await page.locator("textarea:visible").first().fill(SEMINAR);
  await page.locator("button:visible", { hasText: "📚 詳細要約を生成" }).first().click();
  await page.waitForFunction(() => [...document.querySelectorAll("h3")].some((h) => /詳細要約・まとめ.*Gemini/.test(h.textContent || "")), null, { timeout: 120000 });
  const sh = await page.locator("h3", { hasText: "詳細要約・まとめ" }).first().innerText();
  console.log("   見出し:", JSON.stringify(sh));
  assert(sh.includes(EXPECT), `セミナー: ${EXPECT} で生成`);
  await checkFallback("セミナー");

  console.log("--- カウンセリング分析 ---");
  await page.goto(BASE, { waitUntil: "domcontentloaded" }); // セミナーの画面ではメニューが出ないため、上の画面に戻る
  await tab(/^\s*🧠\s*分析\s*$/, '[data-fixed-model="counseling"]');
  await noOldChoices('[data-fixed-model="counseling"]', "カウンセリング分析");
  const csTa = page.locator("textarea:visible").first();
  await csTa.fill(COUNSEL);
  await page.locator("button:visible", { hasText: "🧠 分析開始" }).first().click();
  await page.waitForFunction(() => [...document.querySelectorAll("span")].some((s) => /📋 分析結果.*Gemini/.test(s.textContent || "")), null, { timeout: 120000 });
  const ch = await page.locator("span", { hasText: "📋 分析結果" }).first().innerText();
  console.log("   見出し:", JSON.stringify(ch));
  assert(ch.includes(EXPECT), `カウンセリング分析: ${EXPECT} で生成`);
  await checkFallback("カウンセリング分析");

  console.log("--- 患者ジャーニーマップ ---");
  await noOldChoices('[data-fixed-model="journey"]', "ジャーニーマップ");
  const jb = page.locator('[data-fixed-model="journey"]').locator("xpath=following-sibling::button[1]");
  await jb.click();
  await page.waitForFunction(() => [...document.querySelectorAll("span")].some((s) => /^Gemini [0-9.]+ Flash/.test((s.textContent || "").trim()) && s.closest("div")?.textContent?.includes("保存")), null, { timeout: 180000 }).catch(() => {});
  const jtxt = await page.locator("body").innerText();
  const jm = jtxt.match(/(Gemini [0-9.]+ Flash)(⚠[^\n]*)?\n/);
  console.log("   ジャーニーのモデル表示:", JSON.stringify(jm && jm[0]));
  const jSent = sent.filter((x) => x.api === "journey-map");
  assert(jSent.length >= 1 && jSent.every((x) => x.body.model_preference === "common"), "ジャーニーマップ: 古い設定でなく common を送る");
  await checkFallback("ジャーニーマップ");

  console.log("--- 送った設定と古い設定 ---");
  assert(sent.filter((x) => x.api !== "journey-map").every((x) => x.body.model_preference === "common"), "セミナー・カウンセリングも common を送る（古い claude 等は使わない）");
  const left = await page.evaluate(() => ["mk_smnSummaryModel", "mk_csModels", "mk_csModel", "mk_journeyModels"].filter((k) => localStorage.getItem(k) !== null));
  assert(left.length === 0, "古い設定（mk_smnSummaryModel・mk_csModels・mk_csModel・mk_journeyModels）は消える");
  assert(errs.length === 0, "pageerror ゼロ" + (errs.length ? ": " + errs.join(" | ") : ""));
  await browser.close();
  console.log(`✅ PASS（${EXPECT}・Supabase は全モック＝行は作っていない）`);
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
