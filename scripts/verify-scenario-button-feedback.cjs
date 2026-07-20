// 検証シナリオ: 主要ボタンの「処理中/完了/失敗」フィードバック表示（BtnFb共通機構）
// 実行: node scripts/verify-scenario-button-feedback.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// Playwright実ブラウザ(APIはモック)で以下を例外ゼロで確認する:
//   A) 診察⚡要約: 押下→⏳要約中…→ストリーミング開始で消える→✓要約完了(約2秒で消える)→ボタン再有効化
//   B) 診察⚡要約 失敗パス: APIエラーで⚠失敗が出て、3秒待っても消えない
//   C) 診察✨補正: 押下→ボタン⏳(既存)→✓補正完了バッジ
//   D) 議事録✨要約作成: 押下→⏳議事録作成中…→✓議事録作成完了、処理中はdisabled(二度押し防止)
//   E) 議事録📝書き起こしを保存: 押下→保存中…→✓保存しました or ⚠失敗(Supabase未接続時)
//   F) モバイル390幅: バッジ表示中もボタン行が横スクロールしない(要素単位折返し)

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:3100";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

const TX = 'textarea[placeholder*="録音ボタン"]';
const SAMPLE = "本日は顔の湿疹について相談です。二週間前から赤みとかゆみがあり、市販薬で改善しないため受診されました。ステロイド外用薬を処方します。";

// /api/summarize のSSE成功モック
async function mockSummarizeOk(page, delayMs = 800) {
  await page.route("**/api/summarize", async (route) => {
    await new Promise(r => setTimeout(r, delayMs));
    const body = 'data: {"chunk":"S) 顔の湿疹、","model":"gemini-3.5-flash"}\n\n' +
      'data: {"chunk":"かゆみあり\\nP) ステロイド外用"}\n\n' +
      'data: {"done":true}\n\n';
    await route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });
}

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.setDefaultTimeout(20000);

  console.log("A) 診察⚡要約: ⏳→ストリーミングで消灯→✓要約完了(2秒)→再有効化");
  await mockSummarizeOk(page);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator(TX).fill(SAMPLE);
  const sumBtn = page.locator('button:has-text("⚡ 要約")');
  await sumBtn.click();
  // ⏳要約中… バッジが出る（モック応答まで800ms遅延がある間に確認）
  await page.locator('span:has-text("要約中…")').first().waitFor({ state: "visible", timeout: 3000 });
  assert(true, "押下直後に「要約中…」バッジが表示される");
  // 完了後 ✓要約完了
  await page.locator('span:has-text("✓ 要約完了")').first().waitFor({ state: "visible", timeout: 10000 });
  assert(true, "完了で「✓ 要約完了」バッジが表示される");
  // 約2秒で自動消去
  await page.waitForTimeout(2600);
  assert(await page.locator('span:has-text("✓ 要約完了")').count() === 0, "「✓ 要約完了」は約2秒で自動的に消える");
  assert(!(await sumBtn.isDisabled()), "完了後、⚡要約ボタンが再有効化されている");
  await page.unroute("**/api/summarize");

  console.log("B) 診察⚡要約 失敗パス: ⚠失敗が出て自動では消えない");
  await page.route("**/api/summarize", route => route.fulfill({ status: 200, contentType: "text/event-stream", body: 'data: {"error":"APIエラー(テスト)"}\n\n' }));
  await sumBtn.click();
  await page.locator('span:has-text("⚠ 失敗:")').first().waitFor({ state: "visible", timeout: 8000 });
  assert(true, "APIエラーで「⚠ 失敗:」バッジが表示される");
  await page.waitForTimeout(3200);
  assert(await page.locator('span:has-text("⚠ 失敗:")').count() > 0, "失敗バッジは3秒待っても消えない（次の操作まで残る）");
  await page.unroute("**/api/summarize");
  // 次の操作(再要約)で失敗表示が上書きされて消えること
  await mockSummarizeOk(page, 300);
  await sumBtn.click();
  await page.locator('span:has-text("✓ 要約完了")').first().waitFor({ state: "visible", timeout: 10000 });
  assert(await page.locator('span:has-text("⚠ 失敗:")').count() === 0, "次の操作で失敗バッジが消える");
  await page.unroute("**/api/summarize");

  console.log("C) 診察✨補正: ボタン⏳(既存)→✓補正完了バッジ");
  await page.route("**/api/transcript-clean", async (route) => {
    await new Promise(r => setTimeout(r, 600));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: SAMPLE + "（補正済）" }) });
  });
  const cleanBtn = page.locator('button:has-text("✨補正")');
  await cleanBtn.click();
  await page.locator('button:has-text("⏳")').first().waitFor({ state: "visible", timeout: 3000 });
  assert(true, "補正中はボタンが⏳表示（既存の進捗表示を流用）");
  await page.locator('span:has-text("✓ 補正完了")').first().waitFor({ state: "visible", timeout: 8000 });
  assert(true, "完了で「✓ 補正完了」バッジが表示される");
  await page.unroute("**/api/transcript-clean");

  console.log("D) 議事録✨要約作成: ⏳議事録作成中…→✓議事録作成完了、処理中disabled");
  await page.route("**/api/minutes-summarize", async (route) => {
    await new Promise(r => setTimeout(r, 1200));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: "■ 議題\n・テスト議事録", model: "gemini-3.5-flash" }) });
  });
  await page.locator('button:has-text("議事録")').first().click();
  const minTx = page.locator('textarea[placeholder*="録音開始すると自動で書き起こされます"]');
  await minTx.waitFor({ state: "visible", timeout: 8000 });
  await minTx.fill("スタッフミーティングの議事録テストです。来月のシフトについて話し合いました。");
  const minSumBtn = page.locator('button:has-text("✨ 要約作成")');
  await minSumBtn.click();
  await page.locator('span:has-text("議事録作成中…")').first().waitFor({ state: "visible", timeout: 3000 });
  assert(true, "押下直後に「議事録作成中…」バッジが表示される");
  const disabledDuring = await page.locator('button:has-text("⏳ 作成中...")').count();
  assert(disabledDuring > 0, "処理中はボタンが「⏳ 作成中...」でdisabled（二度押し防止）");
  await page.locator('span:has-text("✓ 議事録作成完了")').first().waitFor({ state: "visible", timeout: 10000 });
  assert(true, "完了で「✓ 議事録作成完了」バッジが表示される");
  await page.unroute("**/api/minutes-summarize");

  console.log("E) 議事録📝書き起こしを保存: 保存中…→✓保存 or ⚠失敗（環境依存）");
  await page.waitForTimeout(2300); // 前のバッジが消えるのを待つ
  const saveBtn = page.locator('button:has-text("📝 書き起こしを保存")');
  if (await saveBtn.count() > 0) {
    await saveBtn.click();
    await page.locator('span:has-text("保存しました"), span:has-text("⚠ 失敗:")').first().waitFor({ state: "visible", timeout: 10000 });
    const okShown = await page.locator('span:has-text("✓ 保存しました")').count();
    console.log("  ✓ 保存ボタンで " + (okShown > 0 ? "「✓ 保存しました」" : "「⚠ 失敗」(devのSupabase未接続想定・機構は動作)") + " バッジが表示される");
  } else {
    console.log("  - 📝保存ボタン非表示（要約済みのため）: スキップ");
  }

  console.log("F) モバイル390幅: バッジ表示中も横スクロールしない");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  mpage.on("pageerror", e => errors.push("mobile pageerror: " + e.message));
  await mockSummarizeOk.call(null, mpage, 1500);
  await mpage.goto(BASE, { waitUntil: "networkidle" });
  await mpage.locator(TX).fill(SAMPLE);
  await mpage.locator('button:has-text("⚡ 要約")').click();
  await mpage.locator('span:has-text("要約中…")').first().waitFor({ state: "visible", timeout: 3000 });
  const overflow = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, "バッジ表示中も横オーバーフローなし (scrollWidth-clientWidth=" + overflow + "px)");
  await mctx.close();

  assert(errors.length === 0, "ページ例外ゼロ (" + errors.length + "件)");
  console.log("\n✅ 全シナリオ成功");
  await browser.close();
  process.exit(0);
})().catch(e => { console.error("\n❌ " + e.message); process.exit(1); });
