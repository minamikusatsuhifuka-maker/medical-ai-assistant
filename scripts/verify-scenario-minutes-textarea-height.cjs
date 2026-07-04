// 検証シナリオ: 議事録の書き起こし欄の高さトグル（小120/中240/大480、localStorage永続化）
// 実行: node scripts/verify-scenario-minutes-textarea-height.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// 確認内容(例外ゼロ):
//   1) 既定=中(240px)＝従来(120px)の2倍
//   2) 小/大/中トグルで textarea 高さが 120/480/240 に切り替わる
//   3) 選択が localStorage(mk_minTranscriptHeight) に保存され、リロード後も維持される
//   4) 手動リサイズ(resize:vertical)が生きている
//   5) モバイル幅(390px)でトグルが折返して表示される（レイアウト崩れなし）

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:3100";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  const ta = () => page.locator('textarea[placeholder="録音開始すると自動で書き起こされます。手動入力も可能です。"]');
  const taHeight = async () => Math.round((await ta().boundingBox()).height);
  // ラベル行の「高さ:」直後の 小/中/大 ボタン（要約欄側の同名ボタンと区別するためsiblingで特定する）
  const heightToggle = async (label) => {
    const btn = page.locator('xpath=//span[text()="高さ:"]/following-sibling::button[text()="' + label + '"]').first();
    await btn.click();
  };
  const clickMinutesTab = async () => {
    for (let i = 0; i < 6; i++) {
      await page.locator('button:visible', { hasText: "議事録" }).first().click();
      try { await ta().waitFor({ state: "visible", timeout: 3000 }); return; } catch {}
    }
    await ta().waitFor({ state: "visible" });
  };

  try {
    console.log(`[verify] BASE=${BASE}`);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await clickMinutesTab();

    assert((await taHeight()) === 240, `既定(中)の高さ=240px（従来120pxの2倍） 実測:${await taHeight()}`);

    await heightToggle("小");
    assert((await taHeight()) === 120, "「小」で120px（従来サイズ）");
    await heightToggle("大");
    assert((await taHeight()) === 480, "「大」で480px（約4倍）");
    await heightToggle("中");
    assert((await taHeight()) === 240, "「中」で240pxに戻る");

    const resize = await ta().evaluate((el) => getComputedStyle(el).resize);
    assert(resize === "vertical", `手動リサイズが生きている (resize:${resize})`);

    // 永続化: 「大」を選んでリロード
    await heightToggle("大");
    const stored = await page.evaluate(() => localStorage.getItem("mk_minTranscriptHeight"));
    assert(stored === "480", `localStorage(mk_minTranscriptHeight)に保存 (${stored})`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await clickMinutesTab();
    assert((await taHeight()) === 480, "リロード後も「大」(480px)が維持される");

    // 後片付け: 既定(中)に戻す
    await heightToggle("中");
    assert((await page.evaluate(() => localStorage.getItem("mk_minTranscriptHeight"))) === "240", "既定(中)に戻した");

    // モバイル幅での折返し確認（モバイルでは議事録タブ自体が非表示設定になり得るため、画面を開いたままビューポートのみ縮める）
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    await ta().waitFor({ state: "visible" });
    for (const label of ["小", "中", "大"]) {
      const btn = page.locator('xpath=//span[text()="高さ:"]/following-sibling::button[text()="' + label + '"]').first();
      assert(await btn.isVisible(), `モバイル(390px)で「${label}」ボタン表示`);
    }
    const box = await ta().boundingBox();
    assert(box.width <= 390 && box.width > 300, `モバイルでtextareaがはみ出さない (幅:${Math.round(box.width)}px)`);

    console.log("\n✅ 全シナリオ成功（例外ゼロ）");
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error("\n❌ 検証失敗:", e); process.exit(1); });
