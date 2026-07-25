// 検証シナリオ: 辞書汚染エントリ「れも→でも」の自動浄化（指示書 quick-fixes-hover-speed-and-dict §2）
// 実行: node scripts/verify-scenario-dict-remo.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// Playwright実ブラウザで以下を pageerror ゼロで確認する:
//   A) localStorage(mk_dict) に「れも→でも」を仕込んでロード → 読込経路の sanitizeDict で除去される
//   B) Supabase(dictionary) 側にも「れも→でも」行がある想定(モック) → マージ経路でも除去される
//   C) マージ後に localStorage へ書き戻される mk_dict が浄化済み（Supabase正当行はマージされている=経路が生きている証明）
//   D) 📖辞書モーダルの一覧に「れも」が表示されない・正当エントリは表示される
// ロジック単体（sanitizeDict の除去・ペア不一致温存・「これも」非破壊）は
// verify-scenario-biran-hallucination.cjs 側で検証済み。

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:3100";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

(async () => {
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // A) 院長端末を再現: localStorage の mk_dict に汚染エントリが残存している状態でロード
  await page.addInitScript(() => {
    localStorage.setItem("mk_dict", JSON.stringify([["れも", "でも"], ["ヒルロイド", "ヒルドイド"]]));
  });

  // B) Supabase dictionary にも汚染行が残存している想定のモック
  await ctx.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const method = req.method();
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (table === "dictionary" && method === "GET") {
      return json([
        { from_text: "れも", to_text: "でも" },
        { from_text: "デュビックセンター", to_text: "デュピクセント" },
      ]);
    }
    if (method === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
    if (method === "GET") return json([]);
    return route.fulfill({ status: 204, body: "" });
  });
  await ctx.route(/\/storage\/v1\//, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500); // Supabase辞書マージ(useEffect)の完了を待つ

  // C) マージ後の mk_dict（Supabaseマージ経路は sanitizeDict 済みを localStorage へ書き戻す）
  const mkDict = JSON.parse(await page.evaluate(() => localStorage.getItem("mk_dict") || "[]"));
  assert(!mkDict.some(([f, t]) => f === "れも" && t === "でも"), "mk_dict から「れも→でも」が除去されている(localStorage/Supabase両経路)");
  assert(mkDict.some(([f]) => f === "ヒルロイド"), "localStorage 由来の正当エントリ(ヒルロイド)は温存");
  assert(mkDict.some(([f]) => f === "デュビックセンター"), "Supabase 由来の正当エントリはマージされている(経路が生きている証明)");

  // D) 📖辞書モーダルの一覧にも「れも」が出ない
  const dictBtn = page.getByRole("button", { name: "📖辞書" });
  for (let i = 0; i < 10; i++) { // hydration完了までクリック再試行
    await dictBtn.first().click();
    try { await page.getByText(/📖 誤字脱字辞書（\d+件）/).waitFor({ timeout: 1500 }); break; } catch {}
  }
  const modalText = await page.locator("text=/📖 誤字脱字辞書（\\d+件）/").locator("xpath=ancestor::div[3]").innerText();
  assert(!modalText.includes("れも"), "📖辞書モーダルの一覧に「れも」が表示されない");
  assert(modalText.includes("ヒルロイド") && modalText.includes("デュビックセンター"), "正当エントリは一覧に表示される");

  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await browser.close();
  console.log("✅ 全シナリオ PASS（records/minutes の作成なし・全モック）");
  process.exit(0);
})().catch((e) => {
  console.error("❌ FAILED:", e.message || e);
  process.exit(1);
});
