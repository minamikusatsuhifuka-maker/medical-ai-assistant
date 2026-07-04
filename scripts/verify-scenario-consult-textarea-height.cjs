// 検証シナリオ: 診察モードの書き起こし欄・要約結果欄の高さトグル（小/中/大、両欄共通、localStorage永続化）
// 実行: node scripts/verify-scenario-consult-textarea-height.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// 確認内容(例外ゼロ):
//   1) 既定=中＝従来の2倍（PC: 400px、従来200px）
//   2) 小/大/中トグルで両textarea高さが 200/800/400 (PC) に同時に切り替わる
//   3) 選択が localStorage(mk_consultTextareaHeight) に保存され、リロード後も維持される
//   4) 手動リサイズ(resize:vertical)が生きている
//   5) モバイル幅(390×844)でラベル行が縦折れしない（要素単位の折返しのみ）+ 高さは150×倍率

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }

const BASE = process.argv[2] || "http://localhost:3100";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

const TX = 'textarea[placeholder*="録音ボタン"]';
const OUT = 'textarea[placeholder*="要約結果"]';

async function heights(page) {
  const a = await page.locator(TX).boundingBox();
  const b = await page.locator(OUT).boundingBox();
  return [Math.round(a.height), Math.round(b.height)];
}
async function clickSize(page, label) {
  // 高さトグルは「高さ:」ラベル直後のボタン群（書き起こしラベル行内）
  await page.evaluate((lbl) => {
    const spans = [...document.querySelectorAll("span")].filter(s => s.textContent === "高さ:");
    for (const sp of spans) {
      let el = sp.nextElementSibling;
      while (el) {
        if (el.tagName === "BUTTON" && el.textContent === lbl) { el.click(); return; }
        el = el.nextElementSibling;
      }
    }
    throw new Error("height toggle button not found: " + lbl);
  }, label);
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => { throw new Error("pageerror: " + e.message); });

  console.log("1) 既定=中(2倍)の確認 (PC)");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  let [h1, h2] = await heights(page);
  assert(h1 === 400 && h2 === 400, `既定=中: 書き起こし${h1}px/要約${h2}px = 400px(従来200pxの2倍)`);

  console.log("2) 小/大/中トグルで両欄同時切替");
  await clickSize(page, "小");
  [h1, h2] = await heights(page);
  assert(h1 === 200 && h2 === 200, `小: 両欄200px (実測 ${h1}/${h2})`);
  await clickSize(page, "大");
  [h1, h2] = await heights(page);
  assert(h1 === 800 && h2 === 800, `大: 両欄800px (実測 ${h1}/${h2})`);
  await clickSize(page, "中");
  [h1, h2] = await heights(page);
  assert(h1 === 400 && h2 === 400, `中: 両欄400px (実測 ${h1}/${h2})`);

  console.log("3) localStorage永続化とリロード維持");
  await clickSize(page, "大");
  const stored = await page.evaluate(() => localStorage.getItem("mk_consultTextareaHeight"));
  assert(stored === "4", `mk_consultTextareaHeight="${stored}" (大=4)`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  [h1, h2] = await heights(page);
  assert(h1 === 800 && h2 === 800, `リロード後も大(800px)を維持 (実測 ${h1}/${h2})`);

  console.log("4) 手動リサイズ(resize:vertical)維持");
  const resize = await page.$eval(TX, (el) => getComputedStyle(el).resize);
  const resize2 = await page.$eval(OUT, (el) => getComputedStyle(el).resize);
  assert(resize === "vertical" && resize2 === "vertical", `resize:vertical 維持 (${resize}/${resize2})`);

  console.log("5) モバイル(390×844)でラベル行の縦折れなし + 高さ150×倍率");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  mpage.on("pageerror", (e) => { throw new Error("mobile pageerror: " + e.message); });
  await mpage.goto(BASE, { waitUntil: "networkidle" });
  await mpage.waitForTimeout(1500);
  const lb = await mpage.locator('span:has-text("📝 書き起こし")').first().boundingBox();
  assert(lb.height < 30, `モバイルでラベルが1行表示（高さ:${Math.round(lb.height)}px < 30px）`);
  const tglBtns = await mpage.evaluate(() => {
    const sp = [...document.querySelectorAll("span")].find(s => s.textContent === "高さ:");
    if (!sp) return null;
    const out = [];
    let el = sp.nextElementSibling;
    while (el && out.length < 3) { if (el.tagName === "BUTTON") out.push(el.getBoundingClientRect().height); el = el.nextElementSibling; }
    return out;
  });
  assert(tglBtns && tglBtns.length === 3 && tglBtns.every(h => h < 30), `モバイルでトグル3ボタンが要素単位表示（高さ ${tglBtns.map(Math.round).join("/")}px）`);
  let [m1, m2] = [
    Math.round((await mpage.locator(TX).boundingBox()).height),
    Math.round((await mpage.locator(OUT).boundingBox()).height),
  ];
  assert(m1 === 300 && m2 === 300, `モバイル既定=中: 両欄300px(従来150pxの2倍) (実測 ${m1}/${m2})`);

  await browser.close();
  console.log("\nALL PASS");
})();
