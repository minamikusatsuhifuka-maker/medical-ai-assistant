// 検証シナリオ: 履歴一覧の「📝書起」「📋要約」ボタンのホバープレビュー（指示書 hover-preview-transcript-summary）
// 実行: node scripts/verify-scenario-hover-preview.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// Playwright実ブラウザ(chromium・fake media・supabase RESTモック)で以下を例外ゼロで確認する:
//   A) 「📋要約」hover → 250ms後にポップオーバー出現・テキスト非空（hover直後は出ない=誤爆防止）
//   B) ポップオーバー本体にマウス移動 → 閉じない（スクロールして読める）
//   C) 一覧の余白へ移動 → 150ms後に閉じる
//   D) 「📝書起」でも同様に出る
//   E) カード未保持フィールドはhover時取得＋record idキャッシュ（2度目のhoverで再fetchなし）
//   F) クリック → 従来モーダル（📋コピーボタンあり）が今までどおり開く（回帰）
//   G) 設定「ホバーで内容をプレビュー」OFF(mk_hoverPreview) → hoverで出ない・titleツールチップ復帰
// dev はダミーenv上書きで起動すること（.env.local のANONキー破損でsupabase-jsが例外を出すため）:
//   NEXT_PUBLIC_SUPABASE_URL=https://mock-verify.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run dev -- -p 3100

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:3100";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

const SUMMARY_1 = "S) 顔の湿疹、かゆみあり\nP) ステロイド外用を継続、2週間後に再診";
const TRANSCRIPT_1 = "二週間前から赤みとかゆみが続いています。市販薬では改善しませんでした。ステロイドの塗り薬を出しておきますね。";
const TRANSCRIPT_2_FETCHED = "こちらはホバー時に単体取得された書き起こしです。ニキビの経過は良好とのこと。";

(async () => {
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // supabase RESTモック:
  //  rec-1 = input_text/output_text をカードが保持（追加fetchなしで表示できることの確認用）
  //  rec-2 = input_text プロパティ無し（hover時取得→record idキャッシュ経路の確認用）
  const now = new Date().toISOString();
  const LIST = [
    { id: "rec-1", created_at: now, room: "r1", input_text: TRANSCRIPT_1, output_text: SUMMARY_1, patient_id: "", patient_name: "" },
    { id: "rec-2", created_at: now, room: "r1", output_text: "P) 経過観察", patient_id: "", patient_name: "" },
  ];
  let singleFetchCount = 0;
  await ctx.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const method = req.method();
    const accept = req.headers()["accept"] || "";
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (table === "records" && method === "GET") {
      const idEq = (url.searchParams.get("id") || "").replace(/^eq\./, "");
      if (idEq) {
        singleFetchCount++;
        const row = idEq === "rec-2" ? { input_text: TRANSCRIPT_2_FETCHED, output_text: "P) 経過観察" } : {};
        return json(accept.includes("vnd.pgrst.object") ? row : [row]);
      }
      return json(LIST);
    }
    if (method === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
    if (method === "GET") return json([]);
    return route.fulfill({ status: 204, body: "" });
  });
  await ctx.route(/\/storage\/v1\//, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  const popover = page.locator('[data-hover-preview="1"]');
  const emptySpot = () => page.mouse.move(1200, 120); // 一覧の余白（ボタン・カード外）

  // メイン画面のボタンをhydration完了まで再試行しつつクリックして、目印セレクタの出現を待つ。
  // 本番ビルドはhydration完了前のクリックが空振りするため（薬剤ガード検証と同じ対策）。
  const clickUntil = async (btnLocator, markerLocator) => {
    for (let i = 0; i < 10; i++) {
      await btnLocator.first().click();
      try { await markerLocator.first().waitFor({ timeout: 1500 }); return; } catch {}
    }
    throw new Error("クリックが反映されません（hydration未完了？）");
  };

  // ---- 一覧を開く ----
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 20000 });
  const sumBtn1 = page.getByRole("button", { name: "📋要約" }).first();
  await clickUntil(page.getByRole("button", { name: /📂 履歴/ }), sumBtn1);

  // A) 80ms後に出現・40msではまだ出ない
  await sumBtn1.hover();
  await page.waitForTimeout(40);
  assert((await popover.count()) === 0, "hover直後(40ms)はまだ出ない(80ms遅延=誤爆防止)");
  await page.waitForTimeout(400);
  assert(await popover.isVisible(), "hoverから80ms経過でポップオーバー出現");
  const pvText = await popover.innerText();
  assert(pvText.includes("📋 要約") && pvText.includes("ステロイド外用を継続"), "要約テキストが空でなく表示される");
  assert(!pvText.includes("📋 コピー"), "ポップオーバーは閲覧専用(コピー/編集ボタンなし)");
  assert((await sumBtn1.getAttribute("title")) === null, "プレビュー有効時はtitle属性ツールチップを出さない");

  // B) ポップオーバー本体に乗ると閉じない
  const box = await popover.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(40, box.height / 2));
  await page.waitForTimeout(400);
  assert(await popover.isVisible(), "ポップオーバー本体にマウスが載っている間は閉じない");

  // C) 余白へ移動で閉じる
  await emptySpot();
  await page.waitForTimeout(400);
  assert((await popover.count()) === 0, "余白へ移動すると150ms後に閉じる");

  // C2) 連続モード: 閉じてからHOVER_PV_CHAIN_MS(500ms)以内の別ボタンhoverは遅延ゼロで即表示
  //   直前のC)で閉じてから約400ms経過 → まだ猶予内。hover後60msで既に表示されていることを確認
  await page.getByRole("button", { name: "📋要約" }).nth(1).hover();
  await page.waitForTimeout(60);
  assert(await popover.isVisible(), "閉じた直後(500ms以内)の別ボタンhoverは遅延なしで即表示(連続モード)");
  // 表示中に別ボタンへ直接移動しても即差し替え
  await page.getByRole("button", { name: "📝書起" }).first().hover();
  await page.waitForTimeout(60);
  assert(await popover.isVisible() && (await popover.innerText()).includes("📝 書き起こし"), "表示中に別ボタンへ移動すると即座に内容が差し替わる");
  // 連続モードの失効: 閉じて700ms待つと80ms遅延に戻る
  await emptySpot();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "📋要約" }).nth(1).hover();
  await page.waitForTimeout(40);
  assert((await popover.count()) === 0, "閉じて700ms後のhoverでは即表示されない(80ms遅延が復活)");
  await page.waitForTimeout(300);
  assert(await popover.isVisible(), "700ms後のhoverも80ms遅延の後には表示される");
  await emptySpot();
  await page.waitForTimeout(700); // 連続モードを確実に失効させてから次のシナリオへ

  // D) 📝書起でも出る（rec-1=カード保持→fetchなし）
  const inpBtn1 = page.getByRole("button", { name: "📝書起" }).first();
  await inpBtn1.hover();
  await page.waitForTimeout(500);
  assert(await popover.isVisible(), "📝書起でもポップオーバーが出る");
  assert((await popover.innerText()).includes("市販薬では改善しません"), "書き起こしテキストが表示される");
  assert(singleFetchCount === 0, "カードが保持しているテキストは追加fetchなしで表示(0回)");
  await emptySpot();
  await page.waitForTimeout(400);

  // E) 未保持フィールドはhover時取得＋キャッシュ（2度目は再fetchなし）
  const inpBtn2 = page.getByRole("button", { name: "📝書起" }).nth(1);
  await inpBtn2.hover();
  await page.waitForTimeout(600);
  assert(await popover.isVisible(), "未保持フィールド(rec-2書起)もhoverでポップオーバーが出る");
  assert((await popover.innerText()).includes("ホバー時に単体取得された書き起こし"), "hover時に取得したテキストが表示される");
  assert(singleFetchCount === 1, "未保持フィールドはhover時に1回だけ取得される");
  await emptySpot();
  await page.waitForTimeout(400);
  await inpBtn2.hover();
  await page.waitForTimeout(600);
  assert((await popover.innerText()).includes("ホバー時に単体取得された書き起こし"), "2度目のhoverでも内容が表示される");
  assert(singleFetchCount === 1, "2度目のhoverでは再fetchが走らない(record idキャッシュ)");
  await emptySpot();
  await page.waitForTimeout(400);

  // F) クリック→従来モーダル（回帰）
  await sumBtn1.click();
  await page.getByRole("button", { name: "📋 コピー" }).waitFor({ timeout: 5000 });
  const modalText = await page.locator("text=📋 コピー").locator("xpath=ancestor::div[3]").innerText();
  assert(modalText.includes("ステロイド外用を継続"), "クリックで従来モーダルが今までどおり開く(内容・コピーボタンあり)");
  assert((await popover.count()) === 0, "モーダル表示時にポップオーバーは残らない");
  await page.getByRole("button", { name: "✕", exact: true }).first().click();
  await page.waitForTimeout(200);

  // G) 設定OFF → hoverで出ない・titleツールチップ復帰
  await page.getByRole("button", { name: "✕ 閉じる" }).click();
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor();
  await page.getByRole("button", { name: /⚙️ 設定/ }).first().click();
  const toggleCard = page.getByText("👁 ホバーで内容をプレビュー");
  await toggleCard.waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "ON", exact: true }).first().click();
  const lsVal = await page.evaluate(() => localStorage.getItem("mk_hoverPreview"));
  assert(lsVal === "0", "設定OFFで mk_hoverPreview=0 が即時保存される");
  await page.getByRole("button", { name: "✕ 閉じる" }).first().click();
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor();
  await page.getByRole("button", { name: /📂 履歴/ }).first().click();
  const sumBtnOff = page.getByRole("button", { name: "📋要約" }).first();
  await sumBtnOff.waitFor({ timeout: 15000 });
  await sumBtnOff.hover();
  await page.waitForTimeout(600);
  assert((await popover.count()) === 0, "設定OFFではhoverしてもポップオーバーが出ない");
  assert((await sumBtnOff.getAttribute("title")) === "要約内容を表示", "設定OFFではtitle属性ツールチップが復帰する");
  await sumBtnOff.click();
  await page.getByRole("button", { name: "📋 コピー" }).waitFor({ timeout: 5000 });
  console.log("  ✓ 設定OFFでもクリック→従来モーダルは動作する");

  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await browser.close();
  console.log("✅ 全シナリオ PASS（records/minutes の作成なし=削除対象なし・全モック）");
  process.exit(0);
})().catch((e) => {
  console.error("❌ FAILED:", e.message || e);
  process.exit(1);
});
