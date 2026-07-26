// 検証シナリオ: エイリアス辞書ヘルプモーダル（指示書 alias-help-in-app）
// 実行: node scripts/verify-scenario-alias-help-modal.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// 内容:
//   1) 承認タブに「❓ 使い方」ボタンが表示される
//   2) 押すとモーダルが開き、本文（見出し・早見表・注意）が表示される
//   3) 登録行数・承認済み件数が実データから動的に表示される（モック3行/2件）
//   4) 本文がスクロールできる（maxHeight 80vh）
//   5) ✕ボタン・背景クリックの両方で閉じる
//   6) パスワードprompt が一切出ない（ゲートの外側）
//   7) 既存UI（統合・追加・検索・⇢既存トピックにも反映・抽出）が引き続き描画される
//   8) pageerror ゼロ
// supabase REST はモック（本番テーブルに書き込まない・テストデータを作らない）

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:3100";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

(async () => {
  console.log("── エイリアス辞書ヘルプモーダル検証 (" + BASE + ")");
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const dialogs = [];
  page.on("dialog", async (d) => { dialogs.push({ type: d.type(), msg: d.message() }); await d.dismiss(); });

  const now = new Date().toISOString();
  const topics = [
    { id: "T1", name: "ニキビ", status: "approved", created_at: now },
    { id: "T2", name: "足白癬", status: "approved", created_at: now },
  ];
  const items = [
    { id: "I1", topic_id: "T1", status: "approved", category: "その他", question: "いつからですか？", seen_count: 1, created_at: now },
    { id: "I2", topic_id: "T2", status: "approved", category: "その他", question: "かゆみはありますか？", seen_count: 1, created_at: now },
  ];
  const aliases = [
    { id: "A1", alias: "にきび", canonical: "ニキビ", created_at: now },
    { id: "A2", alias: "尋常性ざ瘡", canonical: "ニキビ", created_at: now },
    { id: "A3", alias: "水虫", canonical: "足白癬", created_at: now },
  ];
  await ctx.route(/\/rest\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/rest/v1/")[1];
    const method = route.request().method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (method === "GET") {
      if (table === "intake_topics") return json(topics);
      if (table === "intake_items") return json(items);
      if (table === "disease_aliases") return json(aliases);
      return json([]);
    }
    if (method === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
    return route.fulfill({ status: 204, body: "" });
  });
  await ctx.route(/\/storage\/v1\//, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  const clickUntil = async (btnLocator, markerLocator) => {
    for (let i = 0; i < 10; i++) {
      await btnLocator.first().click();
      try { await markerLocator.first().waitFor({ timeout: 1500 }); return; } catch {}
    }
    throw new Error("クリックが反映されません（hydration未完了？）");
  };

  // ---- 事前問診ページ → 承認タブ ----
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 30000 });
  await clickUntil(page.getByRole("button", { name: /⋯ その他/ }), page.getByRole("button", { name: /🩺 事前問診/ }));
  await page.getByRole("button", { name: /🩺 事前問診/ }).click();
  await page.getByText("この問診は診察の補助です", { exact: false }).first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: /✅ 承認（院長）/ }).click();
  await page.getByText("🔗 疾患の統合・エイリアス辞書").first().waitFor({ timeout: 10000 });

  // 1) ❓ 使い方 ボタン
  const helpBtn = page.getByRole("button", { name: "❓ 使い方" });
  await helpBtn.waitFor({ timeout: 5000 });
  assert(await helpBtn.isVisible(), "「❓ 使い方」ボタンが見出しの右に表示される");

  // 2) モーダルが開く
  await helpBtn.click();
  const modalTitle = page.getByText("疾患の統合・エイリアス辞書とは");
  await modalTitle.first().waitFor({ timeout: 5000 });
  assert(await modalTitle.first().isVisible(), "クリックでモーダルが開き本文見出しが表示される");
  assert(await page.getByText("入口は3つ。用途が違います").isVisible(), "本文セクション「入口は3つ」が表示される");

  // モーダル本体（maxHeight 80vh の白カード）を特定
  const card = page.locator('div').filter({ hasText: "疾患の統合・エイリアス辞書とは" }).last();
  // 3) 動的件数（モック: エイリアス3行 / 承認済み2件）
  assert(await page.getByText("現在3行が登録されています").isVisible(), "登録行数が実データから動的表示される（3行）");
  assert(await page.getByText("承認済み2件の紐付け").isVisible(), "承認済み件数が実データから動的表示される（2件）");
  assert(await page.getByText("使いどころ早見表").isVisible(), "早見表セクションが表示される");
  assert((await page.locator("table td").count()) >= 12, "早見表がテーブルとして描画される");

  // 4) スクロールできる
  const scrollInfo = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("div")].filter(d => d.style.maxHeight === "80vh" && d.style.overflowY === "auto");
    const el = cards[cards.length - 1];
    if (!el) return null;
    const before = el.scrollTop;
    el.scrollTop = 400;
    return { scrollable: el.scrollHeight > el.clientHeight, moved: el.scrollTop !== before, maxH: el.style.maxHeight };
  });
  assert(scrollInfo && scrollInfo.scrollable && scrollInfo.moved, "本文がスクロールできる（maxHeight 80vh）");

  // 5a) ✕ボタンで閉じる
  await page.getByRole("button", { name: "✕ 閉じる" }).last().click(); // ページヘッダーにも同名ボタンがあるためモーダル側(最後)を指定
  await modalTitle.first().waitFor({ state: "detached", timeout: 5000 });
  assert(true, "✕ボタンで閉じる");

  // 5b) 背景クリックで閉じる
  await helpBtn.click();
  await modalTitle.first().waitFor({ timeout: 5000 });
  await page.mouse.click(10, 475); // 左端＝オーバーレイ背景
  await modalTitle.first().waitFor({ state: "detached", timeout: 5000 });
  assert(true, "背景クリックで閉じる");

  // 6) パスワードprompt が出ていない（ゲートの外側）
  assert(dialogs.length === 0, "開閉でパスワードprompt等のダイアログが一切出ない（認証前でも読める）");

  // 7) 既存UIの回帰確認（描画レベル）
  assert(await page.getByRole("button", { name: "🔗 統合" }).isVisible(), "既存: 🔗 統合ボタンが描画されている");
  assert(await page.getByRole("button", { name: "追加", exact: true }).isVisible(), "既存: エイリアス追加ボタンが描画されている");
  assert(await page.getByPlaceholder("🔍 エイリアス・統合先で絞り込み").isVisible(), "既存: エイリアス検索ボックスが描画されている");
  assert(await page.getByRole("button", { name: /⇢ 既存トピックにも反映/ }).isVisible(), "既存: ⇢ 既存トピックにも反映ボタンが描画されている");
  assert(await page.getByRole("button", { name: "📥 抽出を実行" }).isVisible(), "既存: 📥 抽出を実行ボタンが描画されている");
  assert((await page.locator("button", { hasText: "✏" }).count()) >= 3, "既存: 一覧の✏編集ボタンが描画されている");
  // エイリアス検索の回帰（絞り込みが効く）
  await page.getByPlaceholder("🔍 エイリアス・統合先で絞り込み").fill("水虫");
  await page.getByText("1/3行").waitFor({ timeout: 5000 });
  assert(true, "既存: エイリアス検索で絞り込みが効く（1/3行）");

  // 8) pageerror ゼロ
  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? "（" + pageErrors.join(" / ") + "）" : ""));

  await browser.close();
  console.log("── すべて成功 ──");
})().catch((e) => { console.error("✗ 検証失敗:", e.message || e); process.exit(1); });
