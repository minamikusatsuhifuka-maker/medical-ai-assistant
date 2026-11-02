// 検証シナリオ: モデル名の表示（§2・§5）。診察の要約は既定 3.6 のまま、2 つめの選択肢は「Gemini 3.8 Flash」と表示。
// 比較ボタンは「3.6/3.8」。説明資料・タスク管理の見出しは生成前は共通の先頭（Gemini 3.8 Flash）。古い「3.7」「3.5 ✨最新」が出ない（実ブラウザ）
// 実行: node scripts/verify-scenario-model-display.cjs <BASE_URL> [ab]
//   ab を付けると診察の「⚖ 3.6/3.8 比較」を本物の API で実行し、2 列とも完了することも確かめる（records は作らない＝Supabase は全モック）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
const RUN_AB = process.argv[3] === "ab";
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }
const EXAM = "2週間前から首のあたりが痒くて赤くなってきました。市販の薬を塗っていますが良くなりません。湿疹ですね。リンデロンVG軟膏を1日2回、2週間塗ってください。かゆみが強いのでビラノア錠20mgを1日1回、14日分出します。";

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("mk_topMenuVisible", JSON.stringify(["hist", "settings", "doc", "minutes", "tasks"])); } catch {} });
  await ctx.route(/\/rest\/v1\//, (r) => { const m = r.request().method(); return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '[{"id":"verify-x"}]' }); });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/log-usage", (r) => r.fulfill({ status: 200, body: "{}" }));
  await ctx.route("**/api/extract-*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const ab = page.locator("button:visible", { hasText: "比較" }).filter({ hasText: "⚖" });
  await ab.first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);

  console.log("--- 診察の画面 ---");
  const abText = await ab.first().innerText();
  assert(abText.includes("3.6/3.8") && !abText.includes("3.7"), `比較ボタンは「${abText.trim()}」（3.7 の表示なし）`);
  const top = await page.locator("body").innerText();
  assert(!/3\.6 \/ 3\.7|3\.6\/3\.7/.test(top), "「3.6 / 3.7」の表示が無い");
  if (RUN_AB) {
    await page.locator('textarea[placeholder*="録音ボタン"]').first().fill(EXAM);
    await ab.first().click();
    await page.waitForFunction(() => /⚖ Gemini 3\.6 \/ 3\.8 比較/.test(document.body.innerText) && !/比較（実行中）/.test(document.body.innerText), null, { timeout: 180000 });
    const t = await page.locator("body").innerText();
    assert(/⚖ Gemini 3\.6 \/ 3\.8 比較/.test(t), "比較の見出しは「Gemini 3.6 / 3.8 比較」");
    assert(t.includes("Gemini 3.6 Flash") && t.includes("Gemini 3.8 Flash"), "2 列の名前は Gemini 3.6 Flash と Gemini 3.8 Flash");
  }

  console.log("--- 設定（診察の要約AIモデル）---");
  for (let k = 0; k < 6; k++) { await page.locator("button:visible").filter({ hasText: /^\s*⚙️\s*設定\s*$/ }).first().click().catch(() => {}); try { await page.getByText("🤖 要約AIモデル").first().waitFor({ timeout: 3000 }); break; } catch {} }
  const card = page.locator("div", { has: page.getByText("🤖 要約AIモデル") }).last();
  const ct = await card.innerText();
  console.log("   要約AIモデル:", JSON.stringify(ct.slice(0, 160)));
  assert(ct.includes("Gemini 3.6 Flash ✨") && ct.includes("Gemini 3.8 Flash") && !ct.includes("3.7"), "診察の選択肢は「Gemini 3.6 Flash ✨（既定）」と「Gemini 3.8 Flash」（3.7 の表示なし）");
  const st = await page.locator("body").innerText();
  assert(!/3\.5 Flash ✨|最新・超高速/.test(st), "「3.5 Flash ✨最新」が無い");
  // 案内・フッター（help / about の画面）は共通部品から出す。ソースに固定の「3.6 / 3.7」が残っていないことで確かめる
  const src = require("fs").readFileSync(require("path").join(__dirname, "../app/page.js"), "utf8");
  assert(!/Gemini 3\.6 \/ 3\.7|3\.6\/3\.7 比較|3\.6 と 3\.7/.test(src), "page.js に固定の「3.6 / 3.7」が残っていない（案内・フッター・比較）");
  assert(await page.evaluate(() => localStorage.getItem("mk_summaryModel") || "gemini") === "gemini", "診察の既定（gemini＝3.6 先頭）は変わっていない");

  console.log("--- 説明資料・タスク管理の見出し ---");
  for (const [label, h] of [["資料作成", "📄 説明資料の作成"], ["タスク", "✅ タスク管理"]]) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    for (let k = 0; k < 6; k++) { await page.locator("button:visible").filter({ hasText: new RegExp(`^\\s*\\S+\\s*${label}\\s*$`) }).first().click().catch(() => {}); try { await page.getByText(h).first().waitFor({ timeout: 3000 }); break; } catch {} }
    const head = await page.locator("h2", { hasText: h }).locator("xpath=..").innerText();
    console.log(`   ${h}:`, JSON.stringify(head.slice(0, 80)));
    assert(head.includes("Gemini 3.8 Flash") && !head.includes("3.7"), `${h} の横は生成前 Gemini 3.8 Flash（固定の 3.7 なし）`);
  }
  assert(errs.length === 0, "pageerror ゼロ" + (errs.length ? ": " + errs.join(" | ") : ""));
  await browser.close();
  console.log("✅ PASS（Supabase は全モック＝records は作っていない）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
