// 検証シナリオ: 議事録の一時停止後「💾 保存して次へ」「🗑 保存せずに次へ」ボタン
// 実行: node scripts/verify-scenario-minutes-pause-next.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// Playwright実ブラウザ(fake media)で以下を例外ゼロで確認する:
//   A) 録音開始→一時停止→「保存して次へ」→ minutes に保存・画面リセット・復元バナーなし
//   B) 録音開始→一時停止→「保存せずに次へ」→ confirm(キャンセルで残る/OKで破棄)・履歴に増えない・バナーなし
//   C) 既存3ボタン(一時停止/停止して要約/停止して内容を保存)の非回帰
// /api/transcribe* はモック({text:""})し、Whisper課金と非決定性を排除する。
// テストで保存した minutes 行は終了時にRESTで削除する。

const fs = require("fs");
const path = require("path");

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:3100";
const ROOT = path.join(__dirname, "..");

// 注意: ローカル .env.local の anon key は末尾にプレースホルダー文字列が混入しており無効(401)。
// 環境変数 SB_URL / SB_KEY で有効なキーを渡すこと（例: vercel env pull した本番env から）。
// フォールバックとして .env.local をASCIIサニタイズして読むが、キーが無効なら REST照合は失敗する。
function loadEnv() {
  const txt = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().match(/^[\x20-\x7E]*/)[0].replace(/=+$/, "");
  }
  return env;
}

const ENV = loadEnv();
const SB_URL = process.env.SB_URL || ENV.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SB_KEY || ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function sbRows(marker) {
  const r = await fetch(`${SB_URL}/rest/v1/minutes?input_text=like.*${marker}*&select=id,title,output_text`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase REST error: ${r.status}`);
  return r.json();
}

async function sbDelete(id) {
  const r = await fetch(`${SB_URL}/rest/v1/minutes?id=eq.${id}`, {
    method: "DELETE",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase DELETE error: ${r.status}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

(async () => {
  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const markerA = `VERIFY_PAUSE_SAVE_${runId}`;
  const markerB = `VERIFY_PAUSE_DISCARD_${runId}`;
  const createdIds = [];

  const browser = await pw.chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  // Whisper系をモック（課金・非決定性排除）
  await page.route("**/api/transcribe**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "" }) })
  );
  await page.route("**/api/log-usage", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );

  const ta = () => page.locator('textarea[placeholder="録音開始すると自動で書き起こされます。手動入力も可能です。"]');
  const visBtn = (label) => page.locator(`button:visible`, { hasText: label });
  const gotoMinutes = async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.locator('button:visible', { hasText: "議事録" }).first().click();
    await ta().waitFor({ state: "visible" });
  };
  const noBanner = async (label) => {
    const n = await page.getByText("前回の書き起こしが途中で終了しています").count();
    assert(n === 0, `${label}: 復元バナーが出ていない`);
  };

  try {
    console.log(`[verify] BASE=${BASE} markerA=${markerA} markerB=${markerB}`);

    // ========== シナリオA: 保存して次へ ==========
    console.log("--- シナリオA: 保存して次へ ---");
    await gotoMinutes();

    assert((await visBtn("保存して次へ").count()) === 0, "A: 未録音時は「保存して次へ」非表示");
    assert((await visBtn("保存せずに次へ").count()) === 0, "A: 未録音時は「保存せずに次へ」非表示");

    await visBtn("🎙 録音開始").first().click();
    await page.getByText("● 録音中").waitFor();
    console.log("  ✓ A: 録音開始 → ● 録音中");

    // 非回帰: 録音中は既存3ボタンのみ
    assert((await visBtn("⏸ 一時停止").count()) >= 1, "A: 録音中に「⏸ 一時停止」表示（非回帰）");
    assert((await visBtn("停止して要約").count()) >= 1, "A: 録音中に「✓ 停止して要約」表示（非回帰）");
    assert((await visBtn("停止して内容を保存").count()) >= 1, "A: 録音中に「💾 停止して内容を保存」表示（非回帰）");
    assert((await visBtn("保存して次へ").count()) === 0, "A: 録音中は「保存して次へ」非表示");
    assert((await visBtn("保存せずに次へ").count()) === 0, "A: 録音中は「保存せずに次へ」非表示");

    await ta().fill(`これはテスト書き起こしです ${markerA}`);
    await page.waitForTimeout(2500); // IndexedDB自動保存(1.5sデバウンス)を確実に発火させる

    await visBtn("⏸ 一時停止").first().click();
    await page.getByText("⏸ 一時停止中").waitFor();
    console.log("  ✓ A: 一時停止 → ⏸ 一時停止中");

    // 一時停止中: 新2ボタン + 既存ボタンの表示
    assert((await visBtn("💾 保存して次へ").count()) === 1, "A: 一時停止中に「💾 保存して次へ」表示");
    assert((await visBtn("🗑 保存せずに次へ").count()) === 1, "A: 一時停止中に「🗑 保存せずに次へ」表示");
    assert((await visBtn("▶ 再開").count()) === 1, "A: 一時停止中に「▶ 再開」表示（非回帰）");
    assert((await visBtn("停止して要約").count()) === 1, "A: 一時停止中に「✓ 停止して要約」表示（非回帰）");
    assert((await visBtn("停止して内容を保存").count()) === 1, "A: 一時停止中に「💾 停止して内容を保存」表示（非回帰）");

    await visBtn("💾 保存して次へ").first().click();
    await page.getByText("✅ 保存しました。次の録音を開始できます").waitFor({ timeout: 20000 });
    console.log("  ✓ A: 保存完了メッセージ表示");

    assert((await ta().inputValue()) === "", "A: 書き起こし欄がリセットされた");
    assert((await visBtn("🎙 録音開始").count()) >= 1, "A: すぐ「録音開始」が押せる状態");

    const rowsA = await sbRows(markerA);
    assert(rowsA.length === 1, `A: minutesに1件保存されている (実際: ${rowsA.length}件)`);
    assert(rowsA[0].title.includes("書き起こしのみ"), `A: タイトルが書き起こしのみ形式 (${rowsA[0].title})`);
    createdIds.push(...rowsA.map((r) => r.id));

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await noBanner("A");

    // ========== シナリオB: 保存せずに次へ ==========
    console.log("--- シナリオB: 保存せずに次へ ---");
    await page.locator('button:visible', { hasText: "議事録" }).first().click();
    await ta().waitFor({ state: "visible" });

    await visBtn("🎙 録音開始").first().click();
    await page.getByText("● 録音中").waitFor();
    await ta().fill(`これは破棄されるべきテキスト ${markerB}`);
    await page.waitForTimeout(2500);
    await visBtn("⏸ 一時停止").first().click();
    await page.getByText("⏸ 一時停止中").waitFor();
    console.log("  ✓ B: 録音→一時停止");

    // B-1: confirmでキャンセル → 破棄されない
    let dialogMsg = "";
    page.once("dialog", (d) => { dialogMsg = d.message(); d.dismiss(); });
    await visBtn("🗑 保存せずに次へ").first().click();
    await page.waitForTimeout(500);
    assert(dialogMsg.includes("書き起こしを保存せずに破棄します"), `B: confirmメッセージ確認 (${dialogMsg})`);
    assert((await ta().inputValue()).includes(markerB), "B: confirmキャンセルで書き起こしが残る");
    assert((await visBtn("🗑 保存せずに次へ").count()) === 1, "B: キャンセル後も一時停止中のまま");

    // B-2: confirmでOK → 破棄・リセット
    page.once("dialog", (d) => d.accept());
    await visBtn("🗑 保存せずに次へ").first().click();
    await page.getByText("🗑 破棄しました。次の録音を開始できます").waitFor();
    assert((await ta().inputValue()) === "", "B: 書き起こしが破棄・リセットされた");
    assert((await visBtn("🎙 録音開始").count()) >= 1, "B: すぐ「録音開始」が押せる状態");

    const rowsB = await sbRows(markerB);
    assert(rowsB.length === 0, `B: minutesに増えていない (実際: ${rowsB.length}件)`);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await noBanner("B");

    console.log("\n✅ 全シナリオ成功（例外ゼロ）");
  } finally {
    // テスト行のクリーンアップ
    for (const id of createdIds) {
      try { await sbDelete(id); console.log(`[cleanup] minutes id=${id} 削除`); }
      catch (e) { console.warn(`[cleanup] 削除失敗 id=${id}: ${e.message}`); }
    }
    await browser.close();
  }
})().catch((e) => { console.error("\n❌ 検証失敗:", e); process.exit(1); });
