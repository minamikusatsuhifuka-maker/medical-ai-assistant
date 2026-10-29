// 検証シナリオ: page.js のノイズ除去が「行ごと」ではなく「文／語だけ」除くこと（実ブラウザ・診察録音経路）
// 実行: node scripts/verify-scenario-noise-filter.cjs <BASE_URL> <音声wav>
//   localStorage mk_noisePatterns に登録語「えーっと」を入れ、/api/transcribe をモックして書き起こし欄を確認する
//   /api/log-usage の送信内容（本文・登録語を含まない）も確認。Supabase・APIは全モック（作成データなし）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
const WAV = process.argv[3];
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }
const CHUNK = "えーっと、背中がかゆいんです。 ご視聴ありがとうございました。 夜も眠れません。";

(async () => {
  if (!WAV) throw new Error("音声wavのパスを第2引数に指定してください");
  const browser = await pw.chromium.launch({ headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + WAV] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, permissions: ["microphone"] });
  await ctx.addInitScript(() => { try { localStorage.setItem("mk_noisePatterns", JSON.stringify(["えーっと"])); } catch {} });
  await ctx.route(/\/rest\/v1\//, (r) => { const m = r.request().method(); return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '[{"id":"verify-x"}]' }); });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/extract-*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const logs = [];
  await ctx.route("**/api/log-usage", (r) => { try { logs.push(JSON.parse(r.request().postData())); } catch {} r.fulfill({ status: 200, body: "{}" }); });
  await ctx.route("**/api/transcribe", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: CHUNK }) }));
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const tx = page.locator('textarea[placeholder*="録音ボタン"]').first();
  await tx.waitFor({ timeout: 30000 });
  const rec = page.locator('button[title="録音開始 / 停止"]').first();
  for (let i = 0; i < 10; i++) { await rec.click(); await page.waitForTimeout(1500); if (await page.getByText(/録音中/).count()) break; }
  await page.waitForTimeout(12000);
  await rec.click();
  await page.waitForTimeout(3000);
  const v = await tx.inputValue();
  console.log("   書き起こし欄:", JSON.stringify(v));
  const first = v.split("\n")[0];
  assert(first === "、背中がかゆいんです。 夜も眠れません。", "登録語「えーっと」だけ除かれ、組み込み(ご視聴ありがとう)の文だけ消え、残りの会話は残る");
  const nl = logs.filter((l) => l.route === "/api/transcribe-noise-client");
  assert(nl.length >= 1, "除去の記録が /api/log-usage に route=/api/transcribe-noise-client で送られる");
  const body = JSON.stringify(nl[0]);
  assert(!body.includes("えーっと") && !body.includes("背中") && !body.includes("ご視聴"), "記録に本文・登録語を含まない: " + JSON.stringify(nl[0].request_meta));
  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await browser.close();
  console.log("✅ 全シナリオ PASS（Supabase・APIは全モック＝作成データなし）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
