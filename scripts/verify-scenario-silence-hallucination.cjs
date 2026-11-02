// 検証シナリオ: 無音のハルシネーション（動画の決まり文句・同じ文の繰り返しだけのチャンク）が議事録・診察の両方で消え、
// 前後の実際の会話と、同じ相づちを含む普通の会話は残ること。復元の帯は最新の1件だけ出ること（実ブラウザ）
// 実行: node scripts/verify-scenario-silence-hallucination.cjs <BASE_URL> <音声wav>
//   /api/transcribe をモックし、10秒ごとのチャンクに CHUNKS を順に返す。Supabase・APIは全モック（作成データなし）
let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const BASE = process.argv[2] || "http://localhost:3100";
const WAV = process.argv[3];
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); console.log("  ✓ " + msg); }
const U = "会議を終了させていただきます";
const CHUNKS = [
  "あと5分くらいで終わります。",
  "最後まで視聴してくださって 次の動画で会いましょう!", // §2 で消える
  U, U,
  U, // §3 で消える（直前3チャンクに2回・中身がその文だけ）
  "はい、わかりました。 " + U, // 他に内容がある → 残る
  "次の動画でお会いしましょう。 在庫は来週確認します。", // 決まり文句の文だけ消える
];

async function setup(browser, logs) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, permissions: ["microphone"] });
  await ctx.route(/\/rest\/v1\//, (r) => { const m = r.request().method(); return m === "GET" ? r.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : m === "HEAD" ? r.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" }) : r.fulfill({ status: 201, contentType: "application/json", body: '[{"id":"verify-x"}]' }); });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/extract-*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/log-usage", (r) => { try { logs.push(JSON.parse(r.request().postData())); } catch {} r.fulfill({ status: 200, body: "{}" }); });
  let i = 0;
  await ctx.route("**/api/transcribe", (r) => { const text = i < CHUNKS.length ? CHUNKS[i] : ""; i++; r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text }) }); });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("dialog", (d) => d.accept().catch(() => {}));
  return { ctx, page, errs, sent: () => i };
}
const waitChunks = async (page, sent, n) => { const t0 = Date.now(); for (let t = 0; t < 150 && sent() < n; t++) await page.waitForTimeout(1000); await page.waitForTimeout(2500); console.log(`   送ったチャンク ${sent()}（${Math.round((Date.now() - t0) / 1000)}秒）`); };
function checkText(v, label) {
  console.log(`   ${label}の書き起こし:`, JSON.stringify(v));
  assert(v.includes("あと5分くらいで終わります。"), `${label}: 決まり文句の前の実際の会話が残る`);
  assert(!/視聴|動画/.test(v), `${label}: 動画の決まり文句が消える`);
  assert(v.includes("在庫は来週確認します。"), `${label}: 決まり文句と同じチャンクの実際の会話が残る`);
  assert(v.includes("はい、わかりました。 " + U), `${label}: 他に内容があるチャンクは落ちない`);
  const lines = v.split("\n").map((l) => l.trim());
  const only = lines.filter((l) => l === U).length;
  assert(only === 2, `${label}: 同じ文だけのチャンクは3回目が落ちる（残り ${only} 行）`);
}
function checkLogs(logs, label) {
  const nl = logs.filter((l) => l.route === "/api/transcribe-noise-client").flatMap((l) => l.request_meta.dropped);
  const rules = nl.map((d) => d.rule);
  assert(rules.includes("REPEAT_CHUNK") && rules.includes("P45") && rules.includes("P47"), `${label}: 記録にルール名が出る ${JSON.stringify(rules)}`);
  const body = JSON.stringify(logs.filter((l) => l.route === "/api/transcribe-noise-client"));
  assert(!body.includes("会議") && !body.includes("視聴") && !body.includes("動画"), `${label}: 記録に本文を含まない`);
}

(async () => {
  if (!WAV) throw new Error("音声wavのパスを第2引数に指定してください");
  const browser = await pw.chromium.launch({ headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + WAV] });
  const allErrs = [];

  console.log("--- 診察の画面 ---");
  { const logs = []; const { ctx, page, errs, sent } = await setup(browser, logs);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const tx = page.locator('textarea[placeholder*="録音ボタン"]').first();
    await tx.waitFor({ timeout: 30000 });
    const rec = page.locator('button[title="録音開始 / 停止"]').first();
    for (let k = 0; k < 10; k++) { await rec.click(); await page.waitForTimeout(1500); if (await page.getByText(/録音中/).count()) break; }
    await waitChunks(page, sent, CHUNKS.length);
    checkText(await tx.inputValue(), "診察"); checkLogs(logs, "診察");
    allErrs.push(...errs); await ctx.close(); }

  console.log("--- 議事録の画面 ---");
  { const logs = []; const { ctx, page, errs, sent } = await setup(browser, logs);
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const ta = page.locator('textarea[placeholder="録音開始すると自動で書き起こされます。手動入力も可能です。"]');
    const tab = async () => { for (let k = 0; k < 6; k++) { await page.locator("button:visible", { hasText: "議事録" }).first().click(); try { await ta.waitFor({ state: "visible", timeout: 3000 }); return; } catch {} } await ta.waitFor({ state: "visible" }); };
    await tab();
    await page.locator("button:visible", { hasText: "🎙 録音開始" }).first().click();
    await page.getByText("● 録音中").waitFor();
    await waitChunks(page, sent, CHUNKS.length);
    checkText(await ta.inputValue(), "議事録"); checkLogs(logs, "議事録");

    console.log("--- 復元の帯（議事録の復元データを2件入れて読み直す）---");
    await page.evaluate(async () => {
      const db = await new Promise((res, rej) => { const q = indexedDB.open("mk_transcript_autosave", 1); q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains("sessions")) q.result.createObjectStore("sessions", { keyPath: "sessionId" }); }; q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      await new Promise((res) => { const tx = db.transaction("sessions", "readwrite"); const s = tx.objectStore("sessions"); s.clear();
        s.put({ sessionId: "verify-old", mode: "minutes", text: "古い".repeat(10), engine: "whisper", startedAt: Date.UTC(2026, 9, 28, 12, 20), updatedAt: Date.UTC(2026, 9, 28, 12, 20) });
        s.put({ sessionId: "verify-new", mode: "minutes", text: "新しい".repeat(10), engine: "whisper", startedAt: Date.UTC(2026, 9, 28, 12, 31), updatedAt: Date.UTC(2026, 9, 28, 12, 31) });
        tx.oncomplete = res; });
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await tab();
    const banner = page.getByText("前回の書き起こしが途中で終了しています");
    await banner.first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    assert(await banner.count() === 1, `帯は1つだけ（${await banner.count()}）`);
    const bt = await banner.first().innerText();
    assert(bt.includes("約30文字") && /21:31/.test(bt), "出ているのは最新の1件（10/28 21:31）: " + bt);
    await page.locator("button:visible", { hasText: "破棄" }).first().click();
    await page.waitForTimeout(800);
    assert(await banner.count() === 0, "破棄したら古い帯も出ない（この表示中）");
    await page.evaluate(async () => { await new Promise((res) => { const q = indexedDB.deleteDatabase("mk_transcript_autosave"); q.onsuccess = q.onerror = q.onblocked = () => res(); }); });
    allErrs.push(...errs); await ctx.close(); }

  assert(allErrs.length === 0, "pageerror ゼロ" + (allErrs.length ? ": " + allErrs.join(" | ") : ""));
  await browser.close();
  console.log("✅ 全シナリオ PASS（Supabase・APIは全モック＝作成データなし・IndexedDB のテストデータは削除）");
  process.exit(0);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(1); });
