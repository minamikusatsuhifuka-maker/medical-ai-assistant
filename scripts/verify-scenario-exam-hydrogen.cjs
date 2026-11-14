// 検証シナリオ: 診察の要約の既定が Gemini 4 Hydrogen（指示書 exam-to-hydrogen §2・2026-11-15）。実ブラウザ
//   mode=default  … 共有の値も端末の保存も無い端末 → 設定は「いま: Gemini 4 Hydrogen（既定）」、要約の見出しは Gemini 4 Hydrogen。
//                   古い端末（mk_summaryModel=gemini / gemini-3-7-flash）も既定の Hydrogen に戻る。
//                   待っている間の画面を撮る（§4: 最初の文字まで約 8 秒の間に何が見えるか）
//   mode=fallback … dev を GEMINI_TEST_FAIL_MODELS=gemini-4-hydrogen で起動しておく →
//                   要約は 3.8 で作られ、見出しに「⚠ Gemini 4 Hydrogen が使えず Gemini 3.8 Flash で生成」
// 実行: node scripts/verify-scenario-exam-hydrogen.cjs <BASE_URL> [default|fallback] [撮った画像の置き場]
//   app_settings は 404 を返す（共有の値なし）。records などほかの表も全モック（保存しない）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
const MODE = process.argv[3] || "default";
const SHOT = process.argv[4] || "";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }
const TEXT = "患者: 2週間前から首のあたりが痒くて、赤くなってきました。市販の薬を塗っていますが良くなりません。\n医師: 湿疹ですね。ステロイドの塗り薬を出しますので、1日2回、2週間塗ってください。保湿もしっかりしてください。";

async function terminal(browser, initLocal) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(([init]) => { try { if (!sessionStorage.getItem("vexh")) {
    localStorage.setItem("mk_autoCopySum", "0");
    if (init) localStorage.setItem("mk_summaryModel", init);
    sessionStorage.setItem("vexh", "1"); } } catch {} }, [initLocal]);
  await ctx.route(/\/rest\/v1\//, (r) => {
    const u = r.request().url(); const m = r.request().method();
    if (/\/rest\/v1\/app_settings/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: m === "GET" ? "[]" : "{}" });
    return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '{"id":"verify-x"}' });
  });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/log-usage", (r) => r.fulfill({ status: 200, body: "{}" }));
  const sent = [];
  await ctx.route("**/api/summarize", async (r) => { try { sent.push(JSON.parse(r.request().postData()).model_preference); } catch {} await r.continue(); });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('button[title="AIで要約する"]:visible').first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(2000);
  return { ctx, page, errs, sent };
}

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  try {
    if (MODE === "default") {
      for (const init of [null, "gemini", "gemini-3-7-flash"]) {
        const t = await terminal(browser, init);
        assert(await t.page.evaluate(() => localStorage.getItem("mk_summaryModel")) === (init ? "exam-hydrogen" : null) || !init, `端末の保存 ${init || "なし"} → 既定（Hydrogen）`);
        const next = await t.page.locator('[data-exam-model-next="1"]').first().innerText().catch(() => "");
        assert(/要約モデル: Gemini 4 Hydrogen/.test(next), `要約する前から見出しに「要約モデル: Gemini 4 Hydrogen」（端末の保存 ${init || "なし"}）`);
        if (init === null) {
          await t.page.locator("textarea:visible").first().fill(TEXT);
          const t0 = Date.now();
          await t.page.locator('button[title="AIで要約する"]:visible').first().click();
          // §4: 押した直後〜最初の文字が出るまでに見えるもの
          await t.page.waitForTimeout(1500);
          const waiting = await t.page.evaluate(() => {
            const b = document.querySelector('button[title="AIで要約する"]');
            const st = Array.from(document.querySelectorAll("header span")).map((e) => e.innerText).join(" | ");
            return { button: b ? b.innerText : "", disabled: b ? b.disabled : null, header: st.slice(0, 200) };
          });
          console.log("   待っている間（1.5 秒後）:", JSON.stringify(waiting));
          if (SHOT) await t.page.screenshot({ path: SHOT + "/exam-waiting-1500ms.png" });
          await t.page.waitForTimeout(3000);
          if (SHOT) await t.page.screenshot({ path: SHOT + "/exam-waiting-4500ms.png" });
          await t.page.waitForFunction(() => /要約完了/.test(document.body.innerText), null, { timeout: 120000 });
          console.log("   完了まで", Date.now() - t0, "ms");
          await t.page.waitForTimeout(800);
          if (SHOT) await t.page.screenshot({ path: SHOT + "/exam-done.png" });
          assert(await t.page.locator("span", { hasText: /^\s*Gemini 4 Hydrogen\s*$/ }).count() >= 1, "要約結果の見出しに「Gemini 4 Hydrogen」");
          assert(await t.page.locator('[data-exam-fallback="1"]').count() === 0, "切り替わりの注意は出ない");
          assert(t.sent.includes("exam-hydrogen"), `送ったキーは exam-hydrogen（${t.sent.join(",")}）`);
          for (let k = 0; k < 6; k++) { await t.page.locator("button:visible").filter({ hasText: /^\s*⚙️\s*設定\s*$/ }).first().click().catch(() => {}); try { await t.page.getByText("🤖 要約AIモデル").first().waitFor({ state: "visible", timeout: 3000 }); break; } catch {} }
          const st = await t.page.locator('[data-exam-model-status="1"]').first().innerText();
          assert(/いま: Gemini 4 Hydrogen（既定）/.test(st), `設定は「${st.split("\n")[0]}」`);
        }
        assert(t.errs.length === 0, "pageerror ゼロ" + (t.errs.length ? ": " + t.errs.join(" | ") : ""));
        await t.ctx.close();
      }
    } else {
      const t = await terminal(browser, null);
      await t.page.locator("textarea:visible").first().fill(TEXT);
      await t.page.locator('button[title="AIで要約する"]:visible').first().click();
      await t.page.waitForFunction(() => /要約完了/.test(document.body.innerText), null, { timeout: 120000 });
      await t.page.waitForTimeout(800);
      if (SHOT) await t.page.screenshot({ path: SHOT + "/exam-fallback.png" });
      const note = t.page.locator('[data-exam-fallback="1"]');
      assert(await note.count() === 1 && /Gemini 4 Hydrogen が使えず Gemini 3\.8 Flash で生成/.test(await note.innerText()), "見出しに「⚠ Gemini 4 Hydrogen が使えず Gemini 3.8 Flash で生成」");
      assert(await t.page.locator("span", { hasText: /^\s*Gemini 3\.8 Flash\s*$/ }).count() >= 1, "使ったモデルの表示は Gemini 3.8 Flash");
      assert(t.errs.length === 0, "pageerror ゼロ" + (t.errs.length ? ": " + t.errs.join(" | ") : ""));
    }
  } finally { await browser.close(); }
  console.log(`✅ [${MODE}] PASS（Supabase は全モック＝保存していない）`);
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
