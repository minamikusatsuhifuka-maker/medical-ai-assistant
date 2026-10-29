// 検証シナリオ: コピー機能の不具合修正（指示書 clipboard-copy-fix）
// 実行: node scripts/verify-scenario-clipboard-copy.cjs [BASE_URL]   BASE_URL 省略時は http://localhost:3100
// Playwright実ブラウザ(chromium・supabase/APIモック・records等の作成なし)で、クリップボードの中身を readText で読んで確認する:
//   A) 履歴モーダルの📋コピー → 中身一致・上部に「✓ コピーしました」
//   B) writeText を拒否させる → execCommand フォールバックで中身一致
//   C) writeText も execCommand も失敗 → 手動コピー小窓（全文が選択済み）が出る＝無言で失敗しない
//   D) 診察要約欄の📋コピー（cp）・議事録の書き起こし📋コピー → 中身一致
//   E) 要約完了後の自動コピー成功 → 中身一致＋緑の確認行
//   F) 自動コピー失敗 → 大きな「📋 要約をコピー」ボタン → 押すとコピーされる
//   G) 設定「要約完了時に自動でコピーを試みる」OFF → 自動コピーせずボタンが出る
//   pageerror ゼロ

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:3100";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }

const SUMMARY = "S) 顔の湿疹、かゆみあり\nP) ステロイド外用を継続、2週間後に再診";
const TRANSCRIPT = "二週間前から赤みとかゆみが続いています。市販薬では改善しませんでした。ステロイドの塗り薬を出しておきますね。";
const AUTO_SUMMARY = "S) 手湿疹の再燃\nP) 保湿剤とステロイド外用、1か月後に再診";

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, permissions: ["clipboard-read", "clipboard-write"] });
  // 失敗の注入: window.__clipFail = {wt: writeTextを拒否, ex: execCommand("copy")をfalseに}
  await ctx.addInitScript(() => {
    window.__clipFail = { wt: false, ex: false };
    const wt = navigator.clipboard.writeText.bind(navigator.clipboard);
    window.__wtRaw = wt; // 検証側の初期化用（失敗注入の影響を受けない）
    navigator.clipboard.writeText = (t) => window.__clipFail.wt ? Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")) : wt(t);
    const ex = document.execCommand.bind(document);
    document.execCommand = (c, ...a) => (c === "copy" && window.__clipFail.ex) ? false : ex(c, ...a);
  });
  const now = new Date().toISOString();
  await ctx.route(/\/rest\/v1\//, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const table = url.pathname.split("/rest/v1/")[1]; const m = req.method();
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (table === "records" && m === "GET") return json([{ id: "rec-1", created_at: now, room: "r1", input_text: TRANSCRIPT, output_text: SUMMARY, patient_id: "", patient_name: "" }]);
    if (m === "POST") return json([{ id: "verify-x" }], 201);
    if (m === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
    if (m === "GET") return json([]);
    return route.fulfill({ status: 204, body: "" });
  });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/summarize", (r) => r.fulfill({ status: 200, contentType: "text/event-stream",
    body: `data: ${JSON.stringify({ chunk: AUTO_SUMMARY, model: "gemini-mock" })}\n\ndata: ${JSON.stringify({ done: true, model: "gemini-mock", total: AUTO_SUMMARY })}\n\n` }));
  await ctx.route("**/api/extract-*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const clip = () => page.evaluate(() => navigator.clipboard.readText());
  const resetClip = () => page.evaluate(() => window.__wtRaw("SENTINEL"));
  const fail = (wt, ex) => page.evaluate(([wt, ex]) => { window.__clipFail = { wt, ex }; }, [wt, ex]);
  const fb = page.locator('[data-copy-fb="1"]');
  const clickUntil = async (btn, marker) => {
    for (let i = 0; i < 10; i++) { await btn.first().click(); try { await marker.first().waitFor({ timeout: 1500 }); return; } catch {} }
    throw new Error("クリックが反映されません（hydration未完了？）");
  };
  const tx = page.locator('textarea[placeholder*="録音ボタン"]').first();

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await tx.waitFor({ timeout: 30000 });

  // ---- A〜C 履歴モーダル ----
  const sumBtn1 = page.getByRole("button", { name: "📋要約" }).first();
  await clickUntil(page.getByRole("button", { name: /📂 履歴/ }), sumBtn1);
  await sumBtn1.click();
  const modalCopy = page.getByRole("button", { name: "📋 コピー" }).first();
  await modalCopy.waitFor({ timeout: 5000 });
  await resetClip();
  await modalCopy.click();
  await page.waitForTimeout(300);
  assert((await clip()) === SUMMARY, "A) 履歴モーダル📋: クリップボードの中身が要約と一致");
  assert((await fb.innerText()).includes("✓ 内容をコピーしました"), "A) 画面上部に「✓ コピーしました」が出る");

  await resetClip(); await fail(true, false);
  await modalCopy.click();
  await page.waitForTimeout(300);
  assert((await clip()) === SUMMARY, "B) writeText拒否時も execCommand フォールバックで中身一致");

  await resetClip(); await fail(true, true);
  await modalCopy.click();
  const manual = page.locator('[data-manual-copy="1"]');
  await manual.waitFor({ timeout: 3000 });
  const sel = await manual.locator("textarea").evaluate((el) => ({ v: el.value, s: el.selectionStart, e: el.selectionEnd, f: document.activeElement === el }));
  assert(sel.v === SUMMARY && sel.s === 0 && sel.e === SUMMARY.length && sel.f, "C) 両方失敗 → 手動コピー小窓に全文が選択済みで出る");
  assert((await fb.innerText()).includes("⚠ コピー失敗"), "C) 画面上部に「⚠ コピー失敗」が出る（無言で失敗しない）");
  assert((await clip()) === "SENTINEL", "C) 失敗時はクリップボードが変わっていない（偽の成功表示なし）");
  await fail(false, false);
  await manual.getByRole("button", { name: "もう一度コピーを試す" }).click();
  await page.waitForTimeout(300);
  assert((await clip()) === SUMMARY && (await manual.count()) === 0, "C) 小窓の「もう一度コピーを試す」でコピーでき小窓が閉じる");
  await page.getByRole("button", { name: "✕", exact: true }).first().click();
  await page.getByRole("button", { name: "✕ 閉じる" }).first().click();
  await tx.waitFor();

  // ---- E 要約完了後の自動コピー（成功） ----
  const sumRun = page.getByRole("button", { name: "⚡ 要約" });
  const fillTx = async () => { for (let i = 0; i < 10; i++) { await tx.fill(TRANSCRIPT + " " + Date.now()); await page.waitForTimeout(500); if (await sumRun.isEnabled()) return; } throw new Error("⚡要約が活性化しない"); };
  await resetClip();
  await fillTx();
  await sumRun.click();
  await page.locator('[data-sum-copy="ok"]').waitFor({ timeout: 10000 });
  assert((await clip()) === AUTO_SUMMARY, "E) 要約完了後の自動コピー: クリップボードの中身が要約と一致");
  assert(await page.locator('[data-sum-copy="ok"]').isVisible(), "E) 要約欄の上に「✓ 要約をクリップボードにコピーしました」");

  // ---- D 診察要約欄の📋コピー（cp）----
  await resetClip();
  await page.getByRole("button", { name: "📋 コピー", exact: true }).first().click();
  await page.waitForTimeout(300);
  assert((await clip()) === AUTO_SUMMARY, "D) 診察要約欄の📋コピー: 中身一致");
  assert((await fb.innerText()).includes("✓ 要約をコピーしました"), "D) メイン画面でも上部に「✓ コピーしました」が出る（全画面共通の表示）");
  // メイン画面で両方失敗 → 手動コピー小窓（履歴画面以外でも出ること）
  await resetClip(); await fail(true, true);
  await page.getByRole("button", { name: "📋 コピー", exact: true }).first().click();
  await manual.waitFor({ timeout: 3000 });
  assert((await manual.locator("textarea").inputValue()) === AUTO_SUMMARY, "D) メイン画面でも両方失敗 → 手動コピー小窓に全文が出る");
  await fail(false, false);
  await manual.getByRole("button", { name: "閉じる" }).click();

  // ---- F 自動コピー失敗 → 大きなボタン ----
  await resetClip(); await fail(true, true);
  await fillTx();
  await sumRun.click();
  const prompt = page.locator('[data-sum-copy="prompt"]');
  await prompt.waitFor({ timeout: 10000 });
  assert((await prompt.innerText()).includes("📋 要約をコピー"), "F) 自動コピー失敗 → 大きな「📋 要約をコピー」ボタンが出る");
  assert((await manual.count()) === 0, "F) 自動コピー失敗時は手動小窓を勝手に出さない（ボタンで知らせる）");
  assert((await clip()) === "SENTINEL", "F) 自動コピー失敗時はクリップボード不変");
  await fail(true, false); // writeTextは拒否のまま→ボタン押下(ユーザー操作)ではexecCommandが通る
  await prompt.click();
  await page.locator('[data-sum-copy="ok"]').waitFor({ timeout: 3000 });
  assert((await clip()) === AUTO_SUMMARY, "F) ボタン1タップでコピーされ緑の確認行に変わる");
  await fail(false, false);

  // ---- G 設定OFF ----
  await page.getByRole("button", { name: /⚙️ 設定/ }).first().click();
  const card = page.getByText("📋 要約完了時に自動でコピーを試みる");
  await card.waitFor({ timeout: 10000 });
  await card.locator("xpath=..").getByRole("button", { name: "ON", exact: true }).click();
  assert((await page.evaluate(() => localStorage.getItem("mk_autoCopySum"))) === "0", "G) 設定OFFで mk_autoCopySum=0 保存");
  await page.getByRole("button", { name: "✕ 閉じる" }).first().click();
  await tx.waitFor();
  await resetClip();
  await fillTx();
  await sumRun.click();
  await prompt.waitFor({ timeout: 10000 });
  assert((await prompt.innerText()).includes("自動コピーはOFF") && (await clip()) === "SENTINEL", "G) OFFでは自動コピーせず「📋 要約をコピー」ボタンを出す");
  await page.evaluate(() => localStorage.removeItem("mk_autoCopySum"));

  // ---- D 議事録の書き起こし📋コピー ----
  const minTa = page.locator('textarea[placeholder="録音開始すると自動で書き起こされます。手動入力も可能です。"]');
  for (let i = 0; i < 6; i++) { await page.locator("button:visible", { hasText: "議事録" }).first().click(); try { await minTa.waitFor({ state: "visible", timeout: 3000 }); break; } catch {} }
  await minTa.fill("議事録の検証用テキストです。次回は11月5日。");
  await resetClip();
  await page.locator('button[title="書き起こし全文をクリップボードにコピー"]').first().click();
  await page.waitForTimeout(300);
  assert((await clip()) === "議事録の検証用テキストです。次回は11月5日。", "D) 議事録の書き起こし📋コピー: 中身一致");
  await minTa.fill("");

  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await browser.close();
  console.log("✅ 全シナリオ PASS（Supabase・APIは全モック＝作成データなし）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
