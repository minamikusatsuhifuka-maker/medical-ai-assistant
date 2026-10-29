// 検証シナリオ: 診断カウンタの是正（録音開始で0に戻す・最終チャンクも録音に数える・空応答を分けて表示）
// 実行: node scripts/verify-scenario-diag-counter.cjs <BASE_URL> <音声wav>
//   wav は擬似マイクに流す日本語音声（例: macOS `say -v Kyoko -o x.aiff ...` → afconvert -f WAVE -d LEI16@48000）
//   /api/transcribe はモック（2回目の応答だけ空文字）。Supabase・その他APIも全モック（作成データなし）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
const WAV = process.argv[3];
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }

(async () => {
  if (!WAV) throw new Error("音声wavのパスを第2引数に指定してください");
  const browser = await pw.chromium.launch({ headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + WAV] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, permissions: ["microphone"] });
  await ctx.route(/\/rest\/v1\//, (r) => { const m = r.request().method(); return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '[{"id":"verify-x"}]' }); });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/log-usage", (r) => r.fulfill({ status: 200, body: "{}" }));
  await ctx.route("**/api/extract-*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/summarize", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ chunk: "S）検証", model: "m" })}\n\ndata: ${JSON.stringify({ done: true, model: "m" })}\n\n` }));
  let nT = 0;
  await ctx.route("**/api/transcribe", (r) => { nT++; r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: nT === 2 ? "" : `チャンク${nT}の書き起こしです。痒みが続いています。` }) }); });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 30000 });
  const rec = page.locator('button[title="録音開始 / 停止"]').first();
  const diag = page.locator("text=📊 チャンク").first();
  const counts = async () => { const t = await diag.innerText(); const g = (re) => Number((t.match(re) || [])[1]); return { t, rec: g(/録音 (\d+)/), lv: g(/ゲート通過 (\d+)/), sil: g(/無音判定通過 (\d+)/), sent: g(/送信 (\d+)/), ok: g(/応答OK (\d+)/), empty: g(/空応答\(0字\) (\d+)/), err: g(/エラー (\d+)/) }; };
  const startRec = async () => { for (let i = 0; i < 10; i++) { await rec.click(); await page.waitForTimeout(1500); if (await page.getByText(/録音中/).count()) return; } throw new Error("録音が始まらない"); };

  // 1回目の録音: 約23秒（10秒チャンク2本）→ ⚡要約で停止（最終チャンクが stopSum 経由で送られる）
  await startRec();
  await page.waitForTimeout(23000);
  await page.getByRole("button", { name: "⚡ 要約" }).click();
  await page.waitForTimeout(5000);
  const c1 = await counts();
  console.log("   1回目:", c1.t);
  assert(c1.rec === c1.sent && c1.rec === 3, `最終チャンクも録音に数え、録音=送信（録音${c1.rec} 送信${c1.sent}）`);
  assert(c1.lv === c1.rec && c1.sil === c1.rec, "ゲート通過・無音判定通過も最終チャンク込みで一致");
  assert(c1.empty === 1 && c1.ok === 2, `空応答(0字)を応答OKと分けて数える（OK${c1.ok} 空${c1.empty}）`);

  // 2回目の録音を開始 → カウンタが0に戻る
  await page.getByRole("button", { name: /次へ/ }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await startRec();
  await page.waitForTimeout(500);
  const c2 = await counts();
  console.log("   2回目開始直後:", c2.t);
  assert(c2.rec === 0 && c2.sent === 0 && c2.ok === 0 && c2.empty === 0, "録音開始でカウンタが0に戻る（前の録音の累計を持ち越さない）");
  await page.waitForTimeout(11500);
  const c3 = await counts();
  assert(c3.rec === 1 && c3.sent === 1, `2回目の録音の分だけ数える（録音${c3.rec} 送信${c3.sent}）`);
  await rec.click();
  await page.waitForTimeout(3000);

  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await browser.close();
  console.log("✅ 全シナリオ PASS（Supabase・APIは全モック＝作成データなし）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
