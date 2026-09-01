// 検証シナリオ: 録音音声管理の絞り込み＋タイトル編集（指示書 audio-list-filter-and-title）
// 実行: node scripts/verify-scenario-audio-list-filter-title.cjs [BASE_URL] [--mock-titles]
//   BASE_URL 省略時は http://localhost:3100
//   --mock-titles: /rest/v1/audio_titles をメモリ上のストアで代替（テーブル未作成環境で診察/未紐付けの保存経路を検証する）
// 内容:
//   1) 一覧取得後、種別チップの件数の合計が全件数と一致し、チップ押下で件数どおり絞られる
//   2) キーワード（患者ID・日付・タイトル）で引ける／期間チップが効く
//   3) 絞り込み中は「N件表示中（全M件）」と絞り込み合計が出る。全選択は絞り込み対象のみ
//   4) タイトル編集: 議事録(minutes.title)・診察(audio_titles)・未紐付け(audio_titles) それぞれ保存→リロード後も維持→編集タイトルで検索→元に戻す
//   5) キャンセルで戻る
//   6) 非回帰: 再生URL取得/DL/選択チェック/⚠バッジ等の描画、モバイル390幅で横スクロールが出ない
//   7) pageerror ゼロ
// 実DB（records/minutes/Storage）は読み取りのみ。議事録タイトルは変更後に必ず元の値へ戻す。

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }

const BASE = process.argv.find((a) => /^https?:\/\//.test(a)) || "http://localhost:3100";
const MOCK_TITLES = process.argv.includes("--mock-titles");
const TAG = "E2Eタイトル" + Date.now().toString().slice(-5);

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openAudioList(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  // ハイドレーション前クリック対策: 設定ボタンをリトライ
  for (let i = 0; i < 8; i++) {
    try {
      await page.getByRole("button", { name: /⚙️ 設定/ }).first().click({ timeout: 3000 });
      if (await page.getByText("🎙 録音音声管理").first().isVisible({ timeout: 2000 })) break;
    } catch { await page.waitForTimeout(800); }
  }
  const fetchBtn = page.getByRole("button", { name: /一覧を取得/ });
  await fetchBtn.scrollIntoViewIfNeeded();
  await fetchBtn.click();
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll("span")].find((s) => /件取得/.test(s.textContent || ""));
    return !!el;
  }, null, { timeout: 60000 });
  await page.waitForTimeout(500);
}

async function rows(page) {
  return page.evaluate(() => {
    const titles = [...document.querySelectorAll("[data-audio-title]")];
    return titles.map((t) => {
      const card = t.closest("div[style*='border-radius: 10px']") || t.parentElement.parentElement;
      const txt = card.textContent || "";
      const type = /🩺 診察/.test(txt) ? "record" : /📝 議事録/.test(txt) ? "minute" : "storage";
      return { title: t.textContent, type, text: txt };
    });
  });
}
async function counts(page) {
  return page.evaluate(() => {
    const o = {};
    document.querySelectorAll("[data-audio-type]").forEach((b) => {
      o[b.getAttribute("data-audio-type")] = parseInt((b.querySelector("span") || {}).textContent || "0", 10);
    });
    return o;
  });
}
async function countBadge(page) {
  const el = page.locator("[data-audio-count='filtered']");
  return (await el.count()) ? await el.textContent() : null;
}
async function totalBadge(page) {
  const el = page.locator("[data-audio-total]");
  return { mode: await el.getAttribute("data-audio-total"), text: await el.textContent() };
}

(async () => {
  console.log("── 録音音声管理 絞り込み＋タイトル編集 検証 (" + BASE + (MOCK_TITLES ? ", audio_titlesモック" : ", 実DB") + ")");
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const pageErrors = [];
  // audio_titles モック（メモリ上・リロードしても残る）
  const titleStore = new Map();
  if (MOCK_TITLES) {
    await ctx.route(/\/rest\/v1\/audio_titles/, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const m = req.method();
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (m === "GET") return json([...titleStore.entries()].map(([item_key, title]) => ({ item_key, title })));
      if (m === "POST") {
        const body = JSON.parse(req.postData() || "{}");
        const arr = Array.isArray(body) ? body : [body];
        arr.forEach((r) => titleStore.set(r.item_key, r.title));
        return json(arr, 201);
      }
      if (m === "DELETE") {
        const k = (url.searchParams.get("item_key") || "").replace(/^eq\./, "");
        titleStore.delete(k);
        return json([], 200);
      }
      return route.continue();
    });
  }
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("dialog", async (d) => { console.log("  (dialog) " + d.type() + ": " + d.message().slice(0, 60)); await d.dismiss(); });

  await openAudioList(page);
  const msg = await page.locator("span", { hasText: /件取得/ }).first().textContent();
  console.log("  一覧: " + msg);
  const mm = msg.match(/(\d+)件取得（診察(\d+)件・議事録(\d+)件・未紐付け(\d+)件）/);
  assert(mm, "取得メッセージの形式が従来どおり");
  const total = parseInt(mm[1], 10);

  // 1) 種別チップ
  const c = await counts(page);
  console.log("  チップ件数:", JSON.stringify(c));
  assert(c.all === total, `「すべて」の件数=${c.all} が全件数 ${total} と一致`);
  assert(c.record + c.minute + c.seminar + c.storage === total, "診察+議事録+セミナー+音声のみ = 全件（4区分は排他）");
  assert(c.record === parseInt(mm[2], 10) && c.minute === parseInt(mm[3], 10), "診察・議事録の件数が既存の集計と一致");
  assert(c.seminar + c.storage === parseInt(mm[4], 10), "セミナー+音声のみ = 既存の未紐付け件数");
  assert((await countBadge(page)) === null, "絞り込みなし: 「N件表示中」は非表示");
  const totalAll = await totalBadge(page);
  assert(totalAll.mode === "all" && /^合計 /.test(totalAll.text), "絞り込みなし: 合計表示は従来どおり（" + totalAll.text + "）");
  const allRows = await rows(page);
  assert(allRows.length === total, `一覧の行数=${allRows.length} が全件と一致`);

  for (const t of ["record", "minute", "storage", "seminar"]) {
    await page.locator(`[data-audio-type='${t}']`).click();
    await page.waitForTimeout(200);
    const r = await rows(page);
    assert(r.length === c[t], `チップ「${t}」で ${c[t]} 件に絞られる（実 ${r.length}）`);
    if (c[t] > 0) {
      const badge = await countBadge(page);
      assert(badge === `${c[t]}件表示中（全${total}件）`, `件数表示「${badge}」`);
      const tb = await totalBadge(page);
      assert(tb.mode === "filtered" && /^絞り込み合計 /.test(tb.text), `合計サイズが絞り込み後の値に切替（${tb.text}）`);
      if (t === "record") assert(r.every((x) => x.type === "record"), "診察のみが表示されている");
      if (t === "minute") assert(r.every((x) => x.type === "minute"), "議事録のみが表示されている");
      if (t === "seminar") assert(r.every((x) => /seminar-audio\//.test(x.text)), "セミナー(seminar-audio/)のみが表示されている");
      if (t === "storage") assert(r.every((x) => x.type === "storage" && !/seminar-audio\//.test(x.text)), "音声のみ（セミナー以外の未紐付け）が表示されている");
    } else {
      assert(await page.locator("[data-audio-empty]").count() === 1, `「${t}」0件のとき空表示が出る`);
    }
  }
  // 全選択 = 絞り込み対象のみ
  await page.locator("[data-audio-type='record']").click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: /全選択/ }).click();
  await page.waitForTimeout(200);
  const delBtnText = await page.getByRole("button", { name: /選択した\d+件を削除/ }).textContent();
  assert(delBtnText.includes(`選択した${c.record}件を削除`), `全選択が絞り込み後(診察 ${c.record}件)のみ選ぶ（${delBtnText}）`);
  // 絞り込み解除しても選択数は変わらない（=全件は選ばれていない）
  await page.locator("[data-audio-filter-clear]").click();
  await page.waitForTimeout(200);
  const delBtnText2 = await page.getByRole("button", { name: /選択した\d+件を削除/ }).textContent();
  assert(delBtnText2.includes(`選択した${c.record}件を削除`), "絞り込み解除後も選択は診察分のまま（全件は選ばれていない）");
  await page.getByRole("button", { name: /全解除/ }).click();
  await page.waitForTimeout(200);
  assert((await page.getByRole("button", { name: /選択した0件を削除/ }).count()) === 1, "全解除で0件");
  // 絞り込みなしの全選択は従来どおり全件
  await page.getByRole("button", { name: /全選択/ }).click();
  await page.waitForTimeout(200);
  assert((await page.getByRole("button", { name: new RegExp(`選択した${total}件を削除`) }).count()) === 1, `絞り込みなしの全選択は従来どおり全件(${total})`);
  await page.getByRole("button", { name: /全解除/ }).click();

  // 2) キーワード
  const search = page.locator("input[aria-label='録音音声の検索']");
  const recRow = allRows.find((x) => x.type === "record" && /患者ID:\d+/.test(x.title));
  if (recRow) {
    const pid = recRow.title.match(/患者ID:(\d+)/)[1];
    await search.fill(pid);
    await page.waitForTimeout(300);
    const r = await rows(page);
    assert(r.length >= 1 && r.every((x) => x.text.includes(pid)), `患者ID「${pid}」で ${r.length} 件に絞られ全行がそのIDを含む`);
  }
  const dateStr = (allRows[0].text.match(/\d{4}\/\d{2}\/\d{2}/) || [])[0];
  if (dateStr) {
    await search.fill(dateStr);
    await page.waitForTimeout(300);
    const r = await rows(page);
    assert(r.length >= 1 && r.every((x) => x.text.includes(dateStr)), `日付「${dateStr}」で ${r.length} 件`);
  }
  await search.fill("r7");
  await page.waitForTimeout(300);
  {
    const r = await rows(page);
    assert(r.every((x) => /r7/i.test(x.text)), `部屋「r7」で ${r.length} 件・全行r7を含む`);
  }
  await search.fill("zzz_no_such_title_" + Date.now());
  await page.waitForTimeout(300);
  assert((await rows(page)).length === 0 && (await page.locator("[data-audio-empty]").count()) === 1, "該当なしのキーワードで0件＋空表示");
  await search.fill("");
  await page.waitForTimeout(200);
  assert((await rows(page)).length === total, "キーワード消去で全件に戻る");

  // 期間
  const nowMs = Date.now();
  const expect = (days) => allRows.filter((x) => { const m = x.text.match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/); if (!m) return false; const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime(); return t >= nowMs - days * 86400000 - 60000; }).length;
  for (const [p, d] of [["7", 7], ["30", 30]]) {
    await page.locator(`[data-audio-period='${p}']`).click();
    await page.waitForTimeout(200);
    const n = (await rows(page)).length;
    const e = expect(d);
    assert(Math.abs(n - e) <= 1, `期間「${p}日」で ${n} 件（表示日時からの概算 ${e} 件）`);
  }
  await page.locator("[data-audio-period='today']").click();
  await page.waitForTimeout(200);
  {
    const n = (await rows(page)).length;
    const today = new Date(); const ds = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;
    const e = allRows.filter((x) => x.text.includes(ds)).length;
    assert(n === e, `期間「今日」で ${n} 件（今日の日付 ${ds} を含む行 ${e} 件）`);
  }
  await page.locator("[data-audio-period='all']").click();
  await page.waitForTimeout(200);
  assert((await rows(page)).length === total && (await countBadge(page)) === null, "期間「すべて」で全件・件数表示が消える");

  // 4) タイトル編集
  const editOn = async (idx) => {
    const btn = page.locator("[data-audio-title-edit]").nth(idx);
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForTimeout(150);
    assert((await page.locator("[data-audio-title-editor]").count()) === 1, "編集モード（入力欄+💾保存/キャンセル）になる");
  };
  const editorInput = () => page.locator("[data-audio-title-editor] input");
  const saveBtn = () => page.locator("[data-audio-title-editor] button", { hasText: "💾 保存" });
  const cancelBtn = () => page.locator("[data-audio-title-editor] button", { hasText: "キャンセル" });
  const findIdx = async (pred) => (await rows(page)).findIndex(pred);

  // 5) キャンセル
  {
    const idx = await findIdx((x) => x.type === "minute");
    assert(idx >= 0, "議事録行がある");
    const before = (await rows(page))[idx].title;
    await editOn(idx);
    await editorInput().fill("捨てる値");
    await cancelBtn().click();
    await page.waitForTimeout(150);
    assert((await page.locator("[data-audio-title-editor]").count()) === 0 && (await rows(page))[idx].title === before, "キャンセルで元のタイトルに戻る（" + before + "）");
    await editOn(idx);
    await editorInput().press("Escape");
    await page.waitForTimeout(150);
    assert((await page.locator("[data-audio-title-editor]").count()) === 0, "Escapeでもキャンセル");
  }

  const targets = [];
  // 議事録（minutes.title・実DB）
  {
    const idx = await findIdx((x) => x.type === "minute");
    const orig = (await rows(page))[idx].title;
    targets.push({ pred: (x) => x.type === "minute" && (x.title === orig || x.title === TAG + "-議事録"), orig, newT: TAG + "-議事録", kind: "議事録(minutes.title)" });
  }
  const canWriteTitles = MOCK_TITLES || !(await page.locator("[data-audio-titles-hint]").count());
  if (canWriteTitles) {
    const rIdx = await findIdx((x) => x.type === "record");
    if (rIdx >= 0) { const orig = (await rows(page))[rIdx].title; targets.push({ pred: (x) => x.type === "record" && (x.title === orig), orig, newT: TAG + "-診察", kind: "診察(audio_titles record:<id>)", autoTitle: orig }); }
    const sIdx = await findIdx((x) => x.type === "storage");
    if (sIdx >= 0) { const orig = (await rows(page))[sIdx].title; targets.push({ pred: (x) => x.type === "storage" && (x.title === orig), orig, newT: TAG + "-音声", kind: "未紐付け(audio_titles path)", autoTitle: orig }); }
  } else {
    console.log("  ※ audio_titles 未作成（ヒント表示あり）→ 診察/未紐付けの保存はエラー表示のみ検証");
    assert(true, "ヒント「audio_titles が未作成」が表示されている");
    const rIdx = await findIdx((x) => x.type === "record");
    await editOn(rIdx);
    await editorInput().fill(TAG);
    await saveBtn().click();
    await page.waitForTimeout(1500);
    const fb = await page.locator("[data-audio-title-editor]").textContent();
    assert(/テーブル未作成/.test(fb), "テーブル未作成時は保存せず「テーブル未作成」のエラーバッジ（" + fb.replace(/\s+/g, " ").slice(-40) + "）");
    await cancelBtn().click();
  }

  for (const tg of targets) {
    const idx = await findIdx(tg.pred);
    assert(idx >= 0, tg.kind + ": 対象行あり（" + tg.orig + "）");
    await editOn(idx);
    await editorInput().fill(tg.newT);
    await saveBtn().click();
    await page.waitForFunction(() => /保存しました/.test(document.body.textContent || ""), null, { timeout: 15000 });
    await page.waitForTimeout(200);
    const after = (await rows(page));
    const nIdx = after.findIndex((x) => x.title === tg.newT);
    assert(nIdx >= 0, tg.kind + ": 保存後にタイトルが「" + tg.newT + "」で表示（✓保存しました）");
    if (tg.autoTitle) assert(after[nIdx].text.includes("（" + tg.autoTitle + "）"), tg.kind + ": 自動タイトルが小さく併記される");
    // 編集タイトルで検索
    await search.fill(tg.newT);
    await page.waitForTimeout(300);
    const r = await rows(page);
    assert(r.length === 1 && r[0].title === tg.newT, tg.kind + ": 編集タイトルでキーワード検索できる");
    await search.fill("");
  }
  // リロード後も維持
  await openAudioList(page);
  for (const tg of targets) {
    const r = await rows(page);
    assert(r.some((x) => x.title === tg.newT), tg.kind + ": リロード後もタイトル維持");
  }
  // 元に戻す（議事録=元の値へ、audio_titles=空欄保存で行削除→自動タイトルへ）
  for (const tg of targets) {
    const idx = await findIdx((x) => x.title === tg.newT);
    await editOn(idx);
    await editorInput().fill(tg.autoTitle ? "" : tg.orig);
    await saveBtn().click();
    await page.waitForFunction(() => /保存しました/.test(document.body.textContent || ""), null, { timeout: 15000 });
    await page.waitForTimeout(200);
    const r = await rows(page);
    assert(r.some((x) => x.title === tg.orig) && !r.some((x) => x.title === tg.newT), tg.kind + ": 元に戻した（" + tg.orig + "）");
  }
  await openAudioList(page);
  {
    const r = await rows(page);
    assert(!r.some((x) => /E2Eタイトル/.test(x.title)), "リロード後にテスト用タイトルが残っていない");
    for (const tg of targets) assert(r.some((x) => x.title === tg.orig), tg.kind + ": 復元がDBにも反映");
  }
  if (MOCK_TITLES) assert(titleStore.size === 0, "モックストアも空（空欄保存でDELETEされた）");

  // 6) 非回帰
  assert((await page.getByRole("button", { name: /▶ 再生URL取得/ }).count()) > 0, "▶ 再生URL取得ボタンが描画される");
  assert((await page.getByRole("button", { name: /⬇ DL\((mp3|webm)\)/ }).count()) > 0, "⬇ DLボタンが描画される");
  assert((await page.locator("input[type='checkbox']").count()) >= total, "選択チェックボックスが全行にある");
  const dupN = await page.getByText("⚠ 他と同じ音声（重複）").count();
  const partN = await page.getByText(/^part\d+/).count();
  console.log(`  重複バッジ ${dupN} 件 / part行 ${partN} 行 (描画確認)`);
  await page.getByRole("button", { name: /▶ 再生URL取得/ }).first().click();
  await page.waitForSelector("audio", { timeout: 15000 });
  assert((await page.locator("audio").count()) >= 1, "再生URL取得で audio 要素が出る（署名URL発行が生きている）");

  // モバイル390
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  // 設定画面には元から390幅ではみ出す既存要素（辞書の「📁 ファイル読込」「追加」行）があるため、
  // 判定は「録音音声管理カード（フィルタ行・タイトル編集含む）の中に画面外へ出る要素が無い」で行う
  const ovf = await page.evaluate(() => {
    const W = window.innerWidth;
    const filt = document.querySelector("[data-audio-filter]");
    const card = filt.parentElement;
    const bad = [];
    card.querySelectorAll("*").forEach((el) => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > W + 1) bad.push({ tag: el.tagName, txt: (el.textContent || "").slice(0, 30), right: Math.round(r.right) }); });
    return { win: W, filt: filt.getBoundingClientRect().width, card: card.getBoundingClientRect().width, bad: bad.slice(0, 5), badN: bad.length };
  });
  assert(ovf.badN === 0, `390幅で録音音声管理カード内に画面外へ出る要素なし（カード ${Math.round(ovf.card)}px / フィルタ行 ${Math.round(ovf.filt)}px）` + (ovf.badN ? " → " + JSON.stringify(ovf.bad) : ""));
  assert(ovf.filt <= ovf.win, `フィルタ行の幅 ${Math.round(ovf.filt)}px が画面内`);
  await page.locator("[data-audio-type='minute']").click();
  await page.waitForTimeout(200);
  assert((await rows(page)).length === c.minute, "390幅でもチップが効く");
  await page.screenshot({ path: "/private/tmp/claude-502/-Users-tpjatpja/1b0bcca8-628a-487e-8ad8-9541d273025f/scratchpad/audio-filter-390.png", fullPage: false });

  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? " → " + pageErrors.join(" | ") : ""));
  await browser.close();
  console.log("── ALL PASSED");
})().catch(async (e) => { console.error("✗ " + e.message); process.exit(1); });
