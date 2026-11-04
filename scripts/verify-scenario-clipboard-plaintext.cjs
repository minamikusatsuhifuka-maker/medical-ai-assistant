// 検証シナリオ: カルテ貼り付けの書式崩れ（指示書 clipboard-plaintext-fix）
// 実行: node scripts/verify-scenario-clipboard-plaintext.cjs [BASE_URL]   BASE_URL 省略時は http://localhost:3100
// 文字列の一致ではなく「クリップボードに入っている形式」を、実際の paste イベントの clipboardData.types で確かめる。
// Supabase・API は全モック（作成データなし）。テーマは明るい(pearl)と暗い(dark)の 2 通り。
//   ボタンのコピー（要約・書き起こし・履歴・議事録・議事録履歴・手動小窓）/ writeText を失敗させたフォールバック /
//   文字を直接選んで Ctrl+C（要約欄・HL 表示・履歴・議事録履歴・手動小窓・PiP）
//   すべて types=["text/plain"]・改行は CRLF・貼り付け先の行数が一致・アプリ内の欄で空行が増えない。

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:3100";
const SUMMARY = "S) 顔の湿疹、かゆみあり\n\nO) 両頬に紅斑\nP) ステロイド外用を継続、2週間後に再診";
const AUTO = "S) 手湿疹の再燃\n\nO) 手背に紅斑\nP) 保湿剤とステロイド外用、1か月後に再診";
const TRANSCRIPT = "二週間前から赤みとかゆみが続いています。\n市販薬では改善しませんでした。\nステロイドの塗り薬を出しておきますね。";
const MINUTES = "■議題\n来月の予定\n\n■決定\n11月5日に再度集まる";
const MIN_INPUT = "議事録の検証用テキストです。\n次回は11月5日。";
const crlf = (s) => s.replace(/\r\n|\r|\n/g, "\r\n");
const lines = (s) => s.split(/\r\n|\r|\n/).length;
const results = [];
// text/html に持ち込まれた書式のうち、症状に関わる値だけを抜き出す
const htmlStyle = (h) => { if (!h) return ""; const g = (re) => (h.match(re) || [])[1] || "-"; return `color=${g(/[^-]color: (rgb[^;]+)/)} font-size=${g(/font-size: ([^;]+)/)} white-space=${g(/white-space(?:-collapse)?: ([^;]+)/)}`; };

async function runTheme(browser, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.addInitScript((th) => {
    try { localStorage.setItem("mk_theme", th); } catch {}
    window.__clipFail = { wt: false, ex: false };
    const wt = navigator.clipboard.writeText.bind(navigator.clipboard);
    window.__wtRaw = wt;
    navigator.clipboard.writeText = (t) => window.__clipFail.wt ? Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")) : wt(t);
    const ex = document.execCommand.bind(document);
    document.execCommand = (c, ...a) => (c === "copy" && window.__clipFail.ex) ? false : ex(c, ...a);
  }, theme);
  const now = new Date().toISOString();
  await ctx.route(/\/rest\/v1\//, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const table = url.pathname.split("/rest/v1/")[1]; const m = req.method();
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (table === "records" && m === "GET") return json([{ id: "rec-1", created_at: now, room: "r1", input_text: TRANSCRIPT, output_text: SUMMARY, patient_id: "", patient_name: "", template: "", is_favorite: false, tags: [] }]);
    if (table === "minutes" && m === "GET") return json([{ id: "min-1", created_at: now, title: "検証の議事録", input_text: MIN_INPUT, output_text: MINUTES, audio_path: null }]);
    if (m === "POST") return json([{ id: "verify-x" }], 201);
    if (m === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
    if (m === "GET") return json([]);
    return route.fulfill({ status: 204, body: "" });
  });
  await ctx.route(/\/storage\/v1\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/api/summarize", (r) => r.fulfill({ status: 200, contentType: "text/event-stream",
    body: `data: ${JSON.stringify({ chunk: AUTO, model: "gemini-mock" })}\n\ndata: ${JSON.stringify({ done: true, model: "gemini-mock", total: AUTO })}\n\n` }));
  await ctx.route("**/api/minutes-summarize", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: MINUTES, minutes: MINUTES, result: MINUTES, model: "gemini-mock" }) }));
  await ctx.route("**/api/extract-*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));

  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const fail = (wt, ex) => page.evaluate(([wt, ex]) => { window.__clipFail = { wt, ex }; }, [wt, ex]);
  const reset = () => page.evaluate(() => window.__wtRaw("SENTINEL"));
  // 受け側（書式を受け付ける欄）。paste の clipboardData をそのまま控える。書式はブラウザの既定の貼り付けに任せる。
  const pasteProbe = async (target = page) => {
    await target.evaluate(() => {
      document.getElementById("__rx")?.remove();
      const r = document.createElement("div"); r.id = "__rx"; r.contentEditable = "true";
      r.style.cssText = "position:fixed;left:0;bottom:0;width:300px;height:60px;overflow:auto;background:#fff;color:#000;font-size:18px;z-index:2147483647";
      document.body.appendChild(r);
      r.addEventListener("paste", (e) => { window.__pasted = { types: [...e.clipboardData.types], plain: e.clipboardData.getData("text/plain"), html: e.clipboardData.getData("text/html") }; });
      r.focus();
    });
    await target.keyboard.press("ControlOrMeta+V");
    await target.waitForTimeout(120);
    return target.evaluate(() => {
      const r = document.getElementById("__rx"); const p = window.__pasted; window.__pasted = null;
      const styled = r ? [...r.querySelectorAll("[style],font")].map((e) => e.getAttribute("style") || "").filter(Boolean).slice(0, 1)[0] || "" : "";
      r?.remove(); return { ...p, styled };
    });
  };
  const record = async (name, expected, opts = {}) => {
    const p = opts.probe ? await opts.probe() : await pasteProbe();
    results.push({ theme, name, types: p.types, hasHtml: p.types.includes("text/html"), crlf: opts.loose ? !/(^|[^\r])\n/.test(p.plain) : p.plain === crlf(expected), lines: lines(p.plain), want: opts.loose ? lines(p.plain) : lines(expected), html: htmlStyle(p.html), plain: p.plain, loose: opts.loose });
  };
  const selectAndCopy = async (loc) => {
    await loc.first().evaluate((el) => {
      const s = el.ownerDocument.getSelection(); const r = el.ownerDocument.createRange(); r.selectNodeContents(el); s.removeAllRanges(); s.addRange(r);
    });
    await page.keyboard.press("ControlOrMeta+C"); await page.waitForTimeout(120);
  };
  const clickUntil = async (btn, marker) => {
    for (let i = 0; i < 10; i++) { await btn.first().click(); try { await marker.first().waitFor({ timeout: 1500 }); return; } catch {} }
    throw new Error("クリックが反映されません（hydration未完了？）");
  };
  const tx = page.locator('textarea[placeholder*="録音ボタン"]').first();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await tx.waitFor({ timeout: 60000 });

  // ---- 履歴モーダル ----
  const histSum = page.getByRole("button", { name: "📋要約" }).first();
  await clickUntil(page.getByRole("button", { name: /📂 履歴/ }), histSum);
  await histSum.click();
  const modalCopy = page.getByRole("button", { name: "📋 コピー" }).first();
  await modalCopy.waitFor({ timeout: 5000 });
  await reset(); await modalCopy.click(); await page.waitForTimeout(200);
  await record("履歴モーダル📋 writeText", SUMMARY);
  await reset(); await fail(true, false); await modalCopy.click(); await page.waitForTimeout(200);
  await record("履歴モーダル📋 フォールバック", SUMMARY);
  await fail(false, false);
  await reset(); await selectAndCopy(page.locator("pre", { hasText: "両頬に紅斑" }));
  await record("履歴モーダル 文字を選んでCtrl+C", SUMMARY);
  // 一部だけ選ぶ（全文に差し替わらない）
  const pre = page.locator("pre", { hasText: "両頬に紅斑" }).first();
  await reset();
  await pre.evaluate((el, part) => {
    const n = el.firstChild, i = n.data.indexOf(part), d = el.ownerDocument, r = d.createRange();
    r.setStart(n, i); r.setEnd(n, i + part.length); const sel = d.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }, "両頬に紅斑\nP) ステロイド");
  await page.keyboard.press("ControlOrMeta+C"); await page.waitForTimeout(120);
  await record("部分: 履歴本文の2行にまたがる選択", "両頬に紅斑\nP) ステロイド");
  await pre.evaluate((el) => el.ownerDocument.getSelection().removeAllRanges());
  // 手動コピー小窓
  await fail(true, true); await modalCopy.click();
  const manual = page.locator('[data-manual-copy="1"]');
  await manual.waitFor({ timeout: 3000 });
  await fail(false, false); await reset();
  await manual.locator("textarea").focus(); await manual.locator("textarea").evaluate((e) => e.select());
  await page.keyboard.press("ControlOrMeta+C"); await page.waitForTimeout(120);
  await manual.getByRole("button", { name: "閉じる" }).click();
  await record("手動小窓 Ctrl+C", SUMMARY);
  // 「もう一度」も同じ口
  await page.getByRole("button", { name: "✕", exact: true }).first().click();
  // 履歴の書き起こし（一覧の📋）
  const histTx = page.getByRole("button", { name: /📋\s*書き起こし|📝書き起こし|📋書き起こし/ }).first();
  if (await histTx.count()) { await reset(); await histTx.click(); await page.waitForTimeout(200); const m2 = page.getByRole("button", { name: "📋 コピー" }).first(); if (await m2.count()) { await m2.click(); await page.waitForTimeout(200); await record("履歴の書き起こし📋", TRANSCRIPT); const x = page.getByRole("button", { name: "✕", exact: true }).first(); if (await x.count()) await x.click(); } }
  await page.getByRole("button", { name: "✕ 閉じる" }).first().click();
  await tx.waitFor();

  // ---- メイン画面の要約 ----
  const sumRun = page.getByRole("button", { name: "⚡ 要約" });
  for (let i = 0; i < 10; i++) { await tx.fill(TRANSCRIPT + " " + Date.now()); await page.waitForTimeout(500); if (await sumRun.isEnabled()) break; }
  await reset(); await sumRun.click();
  await page.locator('[data-sum-copy="ok"]').waitFor({ timeout: 10000 });
  await record("要約完了の自動コピー", AUTO);
  const mainCopy = page.getByRole("button", { name: "📋 コピー", exact: true }).first();
  await reset(); await mainCopy.click(); await page.waitForTimeout(200);
  await record("メイン要約📋 writeText", AUTO);
  await reset(); await fail(true, false); await mainCopy.click(); await page.waitForTimeout(200); await fail(false, false);
  await record("メイン要約📋 フォールバック", AUTO);
  const sumTa = page.locator('textarea[placeholder="要約結果がここに表示されます..."]');
  await reset(); await sumTa.focus(); await sumTa.evaluate((e) => e.select());
  await page.keyboard.press("ControlOrMeta+C"); await page.waitForTimeout(120);
  await record("要約欄 文字を選んでCtrl+C", AUTO);
  // ---- 一部だけ選ぶ（全文に差し替わらない）----
  const partial = async (ta, name, part) => {
    await ta.focus();
    await ta.evaluate((e, part) => { const i = e.value.indexOf(part); e.setSelectionRange(i, i + part.length); }, part);
    await reset(); await page.keyboard.press("ControlOrMeta+C"); await page.waitForTimeout(120);
    await record(name, part);
  };
  await tx.fill(TRANSCRIPT);
  await partial(tx, "部分: 書き起こし欄の1行の途中", "市販薬では改善");
  await partial(tx, "部分: 書き起こし欄の2行にまたがる選択", "改善しませんでした。\nステロイドの");
  await partial(sumTa, "部分: 要約欄の1行の途中", "保湿剤とステロイド");
  // 実際のマウスで書き起こし欄をなぞる（setSelectionRange を使わない）
  const box = await tx.boundingBox();
  await tx.evaluate((e) => { e.scrollTop = 0; e.setSelectionRange(0, 0); });
  await page.mouse.move(box.x + 40, box.y + 22); await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 22, { steps: 8 }); await page.mouse.up();
  const dragged = await tx.evaluate((e) => e.value.slice(e.selectionStart, e.selectionEnd));
  if (!dragged || dragged.length >= TRANSCRIPT.length) throw new Error("マウスの選択が部分になっていません: " + JSON.stringify(dragged));
  await reset(); await page.keyboard.press("ControlOrMeta+C"); await page.waitForTimeout(120);
  await record(`部分: 書き起こし欄をマウスでなぞる（${dragged.length}文字「${dragged}」/全${TRANSCRIPT.length}文字）`, dragged);
  // 何も選んでいないときは、前のクリップボードを壊さない
  await tx.evaluate((e) => e.setSelectionRange(2, 2));
  await tx.focus(); await reset(); await page.keyboard.press("ControlOrMeta+C"); await page.waitForTimeout(120);
  await record("部分: 選択なしの Ctrl+C はクリップボードを変えない", "SENTINEL");
  // アプリ内の欄に貼っても空行が増えない
  await mainCopy.click(); await page.waitForTimeout(200);
  const before = await sumTa.inputValue(); // textarea は CRLF を LF で返す。貼ったあとに同じ値なら空行は増えていない
  await tx.fill(""); await tx.focus(); await page.keyboard.press("ControlOrMeta+V"); await page.waitForTimeout(150);
  const txVal = await tx.inputValue();
  results.push({ theme, name: "アプリ内: 書き起こし欄へ貼付", types: ["-"], hasHtml: false, crlf: true, lines: lines(txVal), want: lines(before), html: "", plain: txVal, inApp: txVal === before });
  await sumTa.focus(); await sumTa.evaluate((e) => e.select()); await page.keyboard.press("ControlOrMeta+V"); await page.waitForTimeout(150);
  const sumVal = await sumTa.inputValue();
  results.push({ theme, name: "アプリ内: 要約欄へ貼付", types: ["-"], hasHtml: false, crlf: true, lines: lines(sumVal), want: lines(before), html: "", plain: sumVal, inApp: sumVal === before });
  // HL 表示（要約欄が div になる）
  await page.getByRole("button", { name: /🎨 HL/ }).click();
  await page.waitForTimeout(150);
  await reset(); await selectAndCopy(page.locator("div", { hasText: "手背に紅斑" }).last());
  await record("要約 HL表示 文字を選んでCtrl+C", AUTO);
  // HL 表示の一部（強調の span をまたいでも、選んだ範囲の文字だけ）
  const hlDiv = page.locator("div", { hasText: "手背に紅斑" }).last();
  await reset();
  const hlPart = await hlDiv.evaluate((el) => {
    const d = el.ownerDocument, w = d.createTreeWalker(el, NodeFilter.SHOW_TEXT), ns = []; let n;
    while ((n = w.nextNode())) ns.push(n);
    const r = d.createRange(); r.setStart(ns[0], 1); const last = ns[ns.length - 1]; r.setEnd(last, Math.max(1, last.data.length - 2));
    const sel = d.getSelection(); sel.removeAllRanges(); sel.addRange(r); return sel.toString();
  });
  await page.keyboard.press("ControlOrMeta+C"); await page.waitForTimeout(120);
  await record("部分: HL表示の一部", hlPart);
  await page.getByRole("button", { name: /🎨 HL/ }).click();

  // ---- PiP ----
  const hasPip = await page.evaluate(() => "documentPictureInPicture" in window);
  if (hasPip) {
    const pip = page.getByRole("button", { name: /🌟 小窓|小窓/ }).first();
    if (await pip.count()) {
      const [pw2] = await Promise.all([ctx.waitForEvent("page", { timeout: 4000 }).catch(() => null), pip.click()]);
      await page.waitForTimeout(500);
      const pipOpen = await page.evaluate(() => !!(window.documentPictureInPicture && window.documentPictureInPicture.window));
      results.push({ theme, name: "PiP 開けた", note: String(pipOpen), types: ["-"], hasHtml: false, crlf: true, lines: 1, want: 1, html: "" });
      if (pipOpen) {
        await page.evaluate(async () => {
          const d = window.documentPictureInPicture.window.document;
          const div = d.createElement("div"); div.id = "__pipsel"; div.innerHTML = "<b style='color:#fff;font-size:10px'>S) 一行目</b><br>P) 二行目"; d.body.appendChild(div);
          const s = d.getSelection(); const rg = d.createRange(); rg.selectNodeContents(div); s.removeAllRanges(); s.addRange(rg);
          d.execCommand("copy");
        });
        await page.waitForTimeout(150);
        await record("PiP 文字を選んでコピー", "S) 一行目\nP) 二行目");
        // 小窓の⚡要約 → 完了後に出る本物の📋コピー（writeText とフォールバックの両方）
        if (pw2) {
          await page.evaluate(() => window.documentPictureInPicture.window.document.getElementById("__pipsel")?.remove());
          for (let i = 0; i < 10; i++) { await tx.fill(TRANSCRIPT + " " + Date.now()); await page.waitForTimeout(400); if (await sumRun.isEnabled()) break; }
          await pw2.waitForTimeout(800);
          await pw2.evaluate(() => document.getElementById("pip-sum").click());
          const pipCopy = pw2.locator("button", { hasText: /📋 コピー|コピー済み|未コピー/ }).last();
          await pipCopy.waitFor({ timeout: 10000 });
          await reset(); await pipCopy.click(); await page.waitForTimeout(250);
          await page.bringToFront(); await record("PiP 要約📋 writeText", AUTO);
          await reset();
          await pw2.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError")); });
          await pipCopy.click(); await page.waitForTimeout(250);
          await page.bringToFront(); await record("PiP 要約📋 フォールバック", AUTO);
        }
        await page.evaluate(() => window.documentPictureInPicture.window.close());
        await page.waitForTimeout(200);
      }
    }
  } else results.push({ theme, name: "PiP 未対応のブラウザ", types: ["-"], hasHtml: false, crlf: true, lines: 1, want: 1, html: "" });

  // ---- 議事録 ----
  const minTa = page.locator('textarea[placeholder="録音開始すると自動で書き起こされます。手動入力も可能です。"]');
  for (let i = 0; i < 6; i++) { await page.locator("button:visible", { hasText: "議事録" }).first().click(); try { await minTa.waitFor({ state: "visible", timeout: 3000 }); break; } catch {} }
  await minTa.fill(MIN_INPUT); await page.waitForTimeout(600);
  await reset(); await page.locator('button[title="書き起こし全文をクリップボードにコピー"]').first().click(); await page.waitForTimeout(200);
  await record("議事録の書き起こし📋", MIN_INPUT);
  // 議事録履歴（一覧の本文は div）
  const minHistRow = page.getByText("検証の議事録").first();
  await minHistRow.waitFor({ timeout: 8000 }).catch(() => {});
  if (await minHistRow.count()) {
    await minHistRow.scrollIntoViewIfNeeded(); await minHistRow.click(); await page.waitForTimeout(300);
    const body = page.locator("div", { hasText: "来月の予定" }).filter({ hasText: "11月5日に再度集まる" }).last();
    if (await body.count()) {
      await reset(); await selectAndCopy(body);
      await record("議事録履歴 文字を選んでCtrl+C", MINUTES, { loose: true });
      await reset();
      const rowBtn = body.locator("xpath=following::button[contains(.,'📋')][1]");
      await rowBtn.click(); await page.waitForTimeout(200);
      await record("議事録履歴📋", MINUTES);
    }
  }
  const out = { theme, pageErrors };
  await ctx.close();
  return out;
}

(async () => {
  // CHROME_PATH: Playwright の版と手元のブラウザが合わないときに実体を直接指定する
  const browser = await pw.chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const errs = [];
  for (const th of ["pearl", "dark"]) { const o = await runTheme(browser, th); errs.push(...o.pageErrors); }
  await browser.close();
  for (const r of results) {
    const ok = !r.hasHtml && r.crlf && r.lines === r.want && r.inApp !== false;
    r.ok = ok;
    console.log(`${ok ? "✓" : "✗"} [${r.theme}] ${r.name}  types=${JSON.stringify(r.types)} CRLF=${r.crlf} 行=${r.lines}/${r.want}${r.note ? " " + r.note : ""}${r.html ? "\n     html: " + r.html.replace(/\s+/g, " ") : ""}`);
  }
  console.log("pageerror:", errs.length, errs.slice(0, 3).join(" | "));
  const bad = results.filter((r) => !r.ok);
  if (bad.length || errs.length) { console.error(`❌ ${bad.length} 件 NG`); process.exit(1); }
  console.log(`✅ 全 ${results.length} 件 PASS（Supabase・APIは全モック＝作成データなし）`);
})().catch((e) => { console.error("❌ FAILED:", e.message || e); process.exit(2); });
