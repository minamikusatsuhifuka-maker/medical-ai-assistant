// 検証シナリオ: 要約テストラボの選択肢は Gemini 3.8 Flash / Gemini 3.6 Flash の2つだけ（Claude は補充しない判断で外した・2026-11-02）。
// 古い選択（Claude・3.1 Pro・3.5 Flash）が残っていても既定の2つに戻り、2つで一斉に要約できる（実ブラウザ・API は本物）
// 実行: node scripts/verify-scenario-lab-models.cjs <BASE_URL>
//   Supabase は全モック（ラボの結果は保存しない）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }
const TEXT = "患者: 2週間前から首のあたりが痒くて、赤くなってきました。市販の薬を塗っていますが良くなりません。\n医師: 湿疹ですね。ステロイドの塗り薬を出しますので、1日2回、2週間塗ってください。保湿もしっかりしてください。";

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("vlab")) {
    localStorage.setItem("mk_labModels", JSON.stringify(["claude", "gemini-3-pro", "gemini-3-5-flash"]));
    localStorage.setItem("mk_topMenuVisible", JSON.stringify(["hist", "settings", "minutes", "summary_lab", "tasks"]));
    sessionStorage.setItem("vlab", "1"); } } catch {} });
  await ctx.route(/\/rest\/v1\//, (r) => { const m = r.request().method(); return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '{"id":"verify-x"}' }); });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/log-usage", (r) => r.fulfill({ status: 200, body: "{}" }));
  const sent = [];
  const replies = {};
  await ctx.route("**/api/summarize", async (r) => { let k = "?"; try { k = JSON.parse(r.request().postData()).model_preference; sent.push(k); } catch {}
    const resp = await r.fetch(); const text = await resp.text(); replies[k] = text.slice(0, 300); await r.fulfill({ response: resp, body: text }); });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const runBtn = page.locator("button:visible", { hasText: "個のAIで" });
  for (let k = 0; k < 8; k++) { await page.locator("button:visible").filter({ hasText: /要約ラボ/ }).first().click().catch(() => {}); try { await runBtn.first().waitFor({ state: "visible", timeout: 3000 }); break; } catch {} }
  await page.waitForTimeout(1000);
  for (const want of ["Gemini 3.8 Flash", "Gemini 3.6 Flash"]) assert(await page.locator("button:visible", { hasText: want }).count() >= 1, `選択肢「${want}」がある`);
  for (const old of ["Claude Sonnet 4.6", "Gemini 3.1 Pro", "Gemini 3.5 Flash", "Gemini 2.5 Pro"]) assert(await page.locator("button:visible", { hasText: old }).count() === 0, `選択肢「${old}」は無い`);
  assert(JSON.parse(await page.evaluate(() => localStorage.getItem("mk_labModels"))).join(",") === "gemini-3-8-flash,gemini-3-6-flash", "古い選択（Claude・3.1 Pro・3.5）だけだった端末は既定の2つに戻る");
  assert((await runBtn.first().innerText()).includes("2個のAIで一斉要約"), "2つで一斉に要約するボタン");
  await page.locator("textarea:visible").first().fill(TEXT);
  await runBtn.first().click();
  await page.waitForFunction(() => (document.body.innerText.match(/✓ 完了/g) || []).length + (document.body.innerText.match(/⚠️ エラー/g) || []).length >= 2, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  const body = await page.locator("body").innerText();
  const done = (body.match(/✓ 完了/g) || []).length;
  assert(done === 2, `要約が完了した枠 ${done}（Gemini 3.8・3.6）`);
  assert(!/Claude/.test(body), "結果にも Claude の枠は無い");
  assert(!/⚠️ エラー/.test(body), "エラーの枠は無い");
  assert(!/credit balance|anthropic|invalid_request_error|HTTP \d{3}/i.test(body), "生の API エラーの文は画面に出ない");
  assert(sent.slice().sort().join(",") === "gemini-3-6-flash,gemini-3-8-flash", "Claude は送らない（送ったキー: " + sent.join(",") + "）");
  assert(await page.locator('[data-lab-actual="1"]').count() === 0, "どの枠も指定どおりのモデルで生成（「実際は」の注意なし）");
  assert(errs.length === 0, "pageerror ゼロ" + (errs.length ? ": " + errs.join(" | ") : ""));
  await browser.close();
  console.log("✅ PASS（Supabase は全モック＝保存していない）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
