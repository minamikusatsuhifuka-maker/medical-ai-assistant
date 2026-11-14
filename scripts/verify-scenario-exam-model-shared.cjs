// 検証シナリオ: 診察の「要約AIモデル」が全端末に効く（指示書 exam-to-hydrogen §1・2026-11-14）。実ブラウザ・2 つの端末
//   端末A（設定で選ぶ）と端末B（別のブラウザ＝localStorage は別）を用意する。
//   1) A で「Gemini 3.8 Flash」を選ぶ → Supabase の app_settings に入る → B を開くと設定に「Gemini 3.8 Flash（全端末の設定）」
//   2) B が古い値（gemini＝今までの既定）を送っても、サーバーは共有の値で 3.8 を使う（API を直接呼んで確かめる）
//   3) B で診察の要約を実行 → 結果の見出しに使ったモデル「Gemini 3.8 Flash」が出る
//   4) A で「Gemini 4 Hydrogen」に戻す → B の画面に戻ると（focus）Hydrogen に変わり、次の要約は Hydrogen
//   5) Supabase が読めない端末（app_settings を 500 にする）は、端末の保存分で動き「全端末の設定を読めていません」と出る
// 実行: node scripts/verify-scenario-exam-model-shared.cjs <BASE_URL> [keep]
//   app_settings だけは本物（本番と同じ DB）。records などほかの表は全モック（保存しない）。
//   最後に共有の値を「始める前の値」に戻す（始める前に行が無かったときは exam-hydrogen を書いてから、行の削除は手で行う＝anon では消せない）。
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }
const TEXT = "患者: 2週間前から首のあたりが痒くて、赤くなってきました。市販の薬を塗っていますが良くなりません。\n医師: 湿疹ですね。部位は首、体部湿疹として扱います。ステロイドの塗り薬を出しますので、1日2回、2週間塗ってください。保湿もしっかりしてください。";

async function newTerminal(browser, { failShared = false, initLocal = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(([init]) => { try { if (!sessionStorage.getItem("vexam")) {
    localStorage.setItem("mk_topMenuVisible", JSON.stringify(["hist", "settings", "minutes", "summary_lab", "tasks"]));
    localStorage.setItem("mk_autoCopySum", "0");
    if (init) localStorage.setItem("mk_summaryModel", init);
    sessionStorage.setItem("vexam", "1"); } } catch {} }, [initLocal]);
  await ctx.route(/\/rest\/v1\//, (r) => {
    const u = r.request().url(); const m = r.request().method();
    if (/\/rest\/v1\/app_settings/.test(u)) return failShared ? r.fulfill({ status: 500, contentType: "application/json", body: '{"message":"verify: 読めない"}' }) : r.continue();
    return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '{"id":"verify-x"}' });
  });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/log-usage", (r) => r.fulfill({ status: 200, body: "{}" }));
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  return { ctx, page, errs };
}
async function openSettings(page) {
  for (let k = 0; k < 6; k++) { await page.locator("button:visible").filter({ hasText: /^\s*⚙️\s*設定\s*$/ }).first().click().catch(() => {}); try { await page.getByText("🤖 要約AIモデル").first().waitFor({ state: "visible", timeout: 3000 }); return; } catch {} }
  throw new Error("設定が開けない");
}
async function openRecord(page) {
  // 要約ボタンは最初の画面にある。読み直して戻る（端末の保存は残る・共有の値も読み直す）
  if (await page.locator('button[title="AIで要約する"]:visible').count()) return;
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('button[title="AIで要約する"]:visible').first().waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(1500);
}
const statusText = (page) => page.locator('[data-exam-model-status="1"]').first().innerText();
async function runSummary(page) {
  await openRecord(page);
  const ta = page.locator("textarea:visible").first();
  await ta.fill(TEXT);
  await page.locator('button[title="AIで要約する"]:visible').first().click();
  await page.waitForFunction(() => /要約完了/.test(document.body.innerText), null, { timeout: 120000 });
  await page.waitForTimeout(800);
}

(async () => {
  const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!U || !K) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY が要る（vercel env run で渡す）");
  const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };
  const readShared = async () => (await (await fetch(`${U}/rest/v1/app_settings?select=value&key=eq.exam_summary_model`, { headers: H })).json())[0]?.value || null;
  const before = await readShared();
  console.log("始める前の共有の値:", before);
  const browser = await pw.chromium.launch({ headless: true });
  try {
    // 1) A で 3.8 を選ぶ
    const A = await newTerminal(browser);
    await openSettings(A.page);
    await A.page.locator('[data-exam-model-option="exam-3-8"]').first().click();
    await A.page.waitForFunction(() => /全端末に反映しました/.test(document.body.innerText), null, { timeout: 10000 });
    assert(/全端末に反映しました（Gemini 3\.8 Flash）/.test(await statusText(A.page)), "A: 「✓ 全端末に反映しました（Gemini 3.8 Flash）」");
    assert(await readShared() === "exam-3-8", "Supabase の app_settings が exam-3-8");
    const optTexts = await A.page.locator("[data-exam-model-option]").allInnerTexts();
    assert(optTexts.length === 2 && /Gemini 4 Hydrogen/.test(optTexts[0]) && /Gemini 3\.8 Flash/.test(optTexts[1]), "選択肢は Gemini 4 Hydrogen と Gemini 3.8 Flash の 2 つ");

    // B: 別の端末。端末の保存は exam-hydrogen（違う値）にしておく
    const B = await newTerminal(browser, { initLocal: "exam-hydrogen" });
    await openSettings(B.page);
    await B.page.waitForFunction(() => /いま: Gemini 3\.8 Flash（全端末の設定）/.test(document.querySelector('[data-exam-model-status="1"]')?.innerText || ""), null, { timeout: 15000 });
    assert(true, "B: 設定を開くと「いま: Gemini 3.8 Flash（全端末の設定）」（端末の保存 exam-hydrogen より共有が優先）");
    assert(await B.page.evaluate(() => localStorage.getItem("mk_summaryModel")) === "exam-3-8", "B: 端末の保存も exam-3-8 に上書き（次に読めないときの控え）");

    // 2) 古い値を送る端末でも、サーバーは共有の値を使う
    const r = await B.page.evaluate(async (t) => { const res = await fetch("/api/summarize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, mode: "gemini", prompt: "以下をSOAPで短く要約", model_preference: "gemini", stream: true }) }); const tx = await res.text(); const ev = tx.split("\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6))); return ev.find((e) => e.done) || ev; }, TEXT);
    assert(r.model === "gemini-3.8-flash" && r.primary === "gemini-3.8-flash", `古い値（gemini）を送ってもサーバーは共有の 3.8 で生成（model=${r.model}）`);

    // 3) B で診察の要約 → 見出しに使ったモデル
    await runSummary(B.page);
    const badge = await B.page.locator("span", { hasText: /^\s*Gemini 3\.8 Flash\s*$/ }).count();
    assert(badge >= 1, "B: 要約結果の見出しに「Gemini 3.8 Flash」");
    assert(await B.page.locator('[data-exam-fallback="1"]').count() === 0, "B: 切り替わりの注意は出ない（3.8 で生成）");

    // 4) A で Hydrogen に戻す → B は画面に戻ると変わる
    await A.page.locator('[data-exam-model-option="exam-hydrogen"]').first().click();
    await A.page.waitForFunction(() => /全端末に反映しました（Gemini 4 Hydrogen）/.test(document.body.innerText), null, { timeout: 10000 });
    assert(await readShared() === "exam-hydrogen", "A で戻す → app_settings が exam-hydrogen");
    await B.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await B.page.waitForFunction(() => localStorage.getItem("mk_summaryModel") === "exam-hydrogen", null, { timeout: 10000 });
    assert(true, "B: 画面に戻る（focus）と端末の設定も exam-hydrogen に変わる");
    await runSummary(B.page);
    assert(await B.page.locator("span", { hasText: /^\s*Gemini 4 Hydrogen\s*$/ }).count() >= 1, "B: 次の要約の見出しは「Gemini 4 Hydrogen」");

    // 5) 共有が読めない端末は端末の保存で動く
    const C = await newTerminal(browser, { failShared: true, initLocal: "exam-3-8" });
    await openSettings(C.page);
    const ct = await statusText(C.page);
    assert(/いま: Gemini 3\.8 Flash/.test(ct) && /全端末の設定を読めていません/.test(ct), `C（読めない端末）: 端末の保存 3.8 で「全端末の設定を読めていません」（${ct.replace(/\n/g, " ")}）`);

    for (const [n, t] of [["A", A], ["B", B], ["C", C]]) assert(t.errs.length === 0, `${n}: pageerror ゼロ` + (t.errs.length ? ": " + t.errs.join(" | ") : ""));
  } finally {
    // 共有の値を始める前に戻す
    if (before) await fetch(`${U}/rest/v1/app_settings?on_conflict=key`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "exam_summary_model", value: before, updated_at: new Date().toISOString() }) });
    console.log("終わった後の共有の値:", await readShared(), before ? "（始める前の値に戻した）" : "（始める前は行なし＝行の削除は手で）");
    await browser.close();
  }
  console.log("✅ PASS（records などは全モック＝作っていない）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
