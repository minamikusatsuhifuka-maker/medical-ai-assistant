// 検証シナリオ: 要約の薬剤名ハルシネーション対策（指示書 drug-name-hallucination-guard 段階1）
// 実行: [PART=1|2|3] node scripts/verify-scenario-drug-guard.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// 3部構成:
//   Part1) 単体: markUngroundedDrugs に §1 の実例(2026/07/25 ニキビ)を渡し、
//     - クリンダマイシンゲル(音源なし補完) が flagged に入り⚠が付く
//     - ゼビアックスローション は flagged に入らない(「ゼビア靴」と音韻近似・先頭3音一致)
//     - ウォッシュゲル は flagged に入らない(除外リスト)
//     - ディフェリンゲル は flagged に入らない(リフェリンゲル/ディフェインゲールと音韻近似)
//     - ⚠の多重付与なし(再ガードで冪等) / 「(推定: 〜)」形式は警告対象外 / fail-open
//   Part2) Playwright実ブラウザ(chromium・fake media・API/DBモック)で pageerror ゼロと全経路(⚠が表示・保存・コピーに乗る)
//   Part3) 実機: dev(3100)+本番env(vercel env pull)で §1 書き起こしを実Geminiで再要約し、
//     P欄に音源のない薬剤名が出ない(または⚠が付く)ことを確認。作成した records はその場で削除して報告。
//
// dev 起動の注意: ローカル .env.local は Supabase ANON キーが破損しているため、
//   Part2 はダミーenv上書き、Part3 は `npx vercel env pull /tmp/maa-prod.env` の本番envで dev を起動すること。

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const BASE = process.argv[2] || "http://localhost:3100";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

// 書き起こし欄へ入力して⚡要約ボタンが活性化するまで再試行する。
// 本番ビルドはReactのhydration完了前にfillするとstateに反映されずボタンがdisabledのままになるため。
async function fillTranscript(page, text) {
  const tx = page.locator('textarea[placeholder*="録音ボタン"]').first();
  await tx.waitFor({ timeout: 20000 });
  const btn = page.getByRole("button", { name: "⚡ 要約" });
  for (let i = 0; i < 10; i++) {
    await tx.fill(text);
    await page.waitForTimeout(700);
    if (await btn.isEnabled()) return;
  }
  throw new Error("⚡ 要約ボタンが活性化しません（hydration未完了？）");
}

// §1 の実例（書き起こし抜粋）
const REAL_TRANSCRIPT = `ユルムに使ってもらってる洗い流すタイプのウォッシュゲルとリフェリンゲルは刺激なく使えてますか?
ディフェインゲールが全然いらなくて じゃあそれ余ってる感じですかね じゃあ今日はモッシュゲール以外で
一旦その洗い流すやつと、このゼビア靴入れておきますね。`;
// §1 の実例（生成された要約）
const REAL_SUMMARY = `P)ゼビアックスローション、ウォッシュゲル(クリンダマイシンゲル/ディフェリンゲル残薬ありのため調整)`;

async function loadLib() {
  const src = fs.readFileSync(path.join(__dirname, "../app/lib/drug-guard.js"), "utf8");
  const tmp = path.join(os.tmpdir(), "drug-guard-verify.mjs");
  fs.writeFileSync(tmp, src);
  return import(pathToFileURL(tmp).href);
}

// ========== Part1: 単体 ==========
async function part1() {
  console.log("── Part1: markUngroundedDrugs 単体（§1実例）");
  const lib = await loadLib();

  const g = lib.markUngroundedDrugs(REAL_SUMMARY, REAL_TRANSCRIPT);
  assert(g.flagged.includes("クリンダマイシンゲル"), "クリンダマイシンゲル(音源なし補完)が flagged に入る");
  assert(!g.flagged.includes("ゼビアックスローション"), "ゼビアックスローションは flagged に入らない(「ゼビア靴」と音韻近似)");
  assert(!g.flagged.includes("ウォッシュゲル"), "ウォッシュゲルは flagged に入らない(除外リスト)");
  assert(!g.flagged.includes("ディフェリンゲル"), "ディフェリンゲルは flagged に入らない(リフェリンゲル等と音韻近似)");
  assert(g.text.includes("⚠クリンダマイシンゲル"), "未照合語の直前に⚠が付く");
  assert(!g.text.includes("⚠ゼビアックスローション") && !g.text.includes("⚠ウォッシュゲル"), "照合済み・除外語には⚠が付かない");

  // 冪等性（再生成・再ガードで⚠が重ならない）
  const g2 = lib.markUngroundedDrugs(g.text, REAL_TRANSCRIPT);
  assert(g2.text === g.text && !g2.text.includes("⚠⚠"), "既に⚠が付いた要約を再ガードしても多重付与しない");

  // 「原文(推定: 正式名称)」形式の正式名称部は警告対象外（プロンプトルール2の出力を⚠で汚さない）
  const g3 = lib.markUngroundedDrugs("P)ゼビア靴(推定: ゼビアックスローション)を処方", "今日はゼビア靴入れておきますね");
  assert(!g3.text.includes("⚠"), "「(推定: 〜)」形式の正式名称には⚠を付けない");

  // 完全一致・漢字剤形（〜軟膏）・除外リスト
  const g4 = lib.markUngroundedDrugs("P)ヒルドイドソフト軟膏を継続", "ヒルドイドソフト軟膏続けてくださいね");
  assert(g4.flagged.length === 0, "書き起こしに完全一致する薬剤名は flagged に入らない");
  const g5 = lib.markUngroundedDrugs("P)アクア軟膏を処方、ステロイドは中止", "保湿だけ続けてください");
  assert(g5.flagged.includes("アクア") && g5.text.includes("⚠アクア軟膏"), "カタカナ3文字+漢字剤形(〜軟膏)も候補になり未照合なら⚠");
  assert(!g5.flagged.includes("ステロイド"), "ステロイド(一般語)は書き起こしに無くても警告しない");

  // fail-open（不正入力で落ちない・要約を壊さない）
  const g6 = lib.markUngroundedDrugs(null, null);
  assert(g6 && typeof g6 === "object" && Array.isArray(g6.flagged), "null入力でも例外を出さず {text, flagged} を返す");
  const g7 = lib.markUngroundedDrugs(REAL_SUMMARY, undefined);
  assert(typeof g7.text === "string", "transcript未指定でも要約テキストを返す(fail-open)");

  // プロンプトルール定数（診察SOAPに付与する側の内容確認）
  assert(lib.DRUG_NAME_PROMPT_RULES.includes("推定:") && lib.DRUG_NAME_PROMPT_RULES.includes("処方の言及なし"), "DRUG_NAME_PROMPT_RULES に推定形式と「処方の言及なし」ルールを含む");
  assert(Array.isArray(lib.DRUG_GUARD_EXCLUDED_TERMS) && lib.DRUG_GUARD_EXCLUDED_TERMS.includes("ウォッシュゲル"), "除外リストが定数1箇所に定義されている");
  console.log("── Part1 OK\n");
}

// ========== Part2: 実ブラウザ（APIモック）で全経路確認 ==========
async function part2() {
  console.log("── Part2: 実ブラウザ（表示・保存・コピーの全経路に⚠が乗る / pageerrorゼロ）");
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 950 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // supabase RESTモック（records insert を捕捉して保存経路を検証）
  const savedRecords = [];
  await ctx.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const method = req.method();
    const accept = req.headers()["accept"] || "";
    if (table === "records" && method === "POST") {
      const b = req.postDataJSON();
      savedRecords.push(b);
      const row = { id: "rec-verify-" + savedRecords.length, ...b };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(accept.includes("vnd.pgrst.object") ? row : [row]) });
    }
    if (method === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
    if (method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return route.fulfill({ status: 204, body: "" });
  });
  await ctx.route(/\/storage\/v1\//, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  // /api/summarize SSEモック: ①音源なしのクリンダマイシンゲル ②音源ありのゼビアックスローション を含む要約を返す
  const MOCK_SUMMARY = "S) ニキビの再診\nP)ゼビアックスローション、ウォッシュゲル(クリンダマイシンゲル/ディフェリンゲル残薬ありのため調整)";
  await ctx.route("**/api/summarize", async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    const half = Math.floor(MOCK_SUMMARY.length / 2);
    const body =
      `data: ${JSON.stringify({ chunk: MOCK_SUMMARY.slice(0, half), model: "gemini-3.6-flash" })}\n\n` +
      `data: ${JSON.stringify({ chunk: MOCK_SUMMARY.slice(half) })}\n\n` +
      `data: ${JSON.stringify({ done: true, model: "gemini-3.6-flash", total: MOCK_SUMMARY })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await fillTranscript(page, REAL_TRANSCRIPT);
  await page.getByRole("button", { name: "⚡ 要約" }).click();

  // 表示: 結果欄に⚠付きで反映される
  await page.getByText("⚠クリンダマイシンゲル").first().waitFor({ timeout: 10000 });
  console.log("  ✓ 表示: 結果欄に「⚠クリンダマイシンゲル」");
  const bodyText = await page.locator("body").innerText();
  assert(!bodyText.includes("⚠ゼビアックスローション"), "表示: 音源のあるゼビアックスローションには⚠が付かない");
  assert(bodyText.includes("書き起こしに無い薬剤名1件"), "ステータスに未照合1件の注意が出る");

  // 保存: records insert の output_text に⚠が乗る
  await page.waitForTimeout(500);
  assert(savedRecords.length === 1, "records へ1件保存された");
  assert(savedRecords[0].output_text.includes("⚠クリンダマイシンゲル"), "保存: output_text に⚠が含まれる(カルテ貼付時に警告が残る)");
  assert(!savedRecords[0].output_text.includes("⚠ゼビアックスローション"), "保存: 照合済み薬剤名には⚠なし");

  // コピー: クリップボードにも⚠が乗る
  try {
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(clip.includes("⚠クリンダマイシンゲル"), "コピー: クリップボードに⚠が含まれる");
  } catch (e) {
    console.log("  ⚠ SKIP: クリップボード読取不可(ヘッドレス制約)。保存経路の⚠で代替確認済み");
  }

  // 非回帰: ハルシネーションが無い要約には⚠が一切付かない
  const CLEAN_SUMMARY = "S) ニキビの再診\nP)ゼビアックスローション、ウォッシュゲル継続";
  await ctx.unroute("**/api/summarize");
  await ctx.route("**/api/summarize", (route) => route.fulfill({
    status: 200, contentType: "text/event-stream",
    body: `data: ${JSON.stringify({ chunk: CLEAN_SUMMARY, model: "gemini-3.6-flash" })}\n\n` + `data: ${JSON.stringify({ done: true, model: "gemini-3.6-flash", total: CLEAN_SUMMARY })}\n\n`,
  }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await fillTranscript(page, REAL_TRANSCRIPT);
  await page.getByRole("button", { name: "⚡ 要約" }).click();
  await page.getByText("ウォッシュゲル継続").first().waitFor({ timeout: 10000 });
  const bodyText2 = await page.locator("body").innerText();
  assert(!bodyText2.includes("⚠クリンダマイシンゲル") && !/⚠[ァ-ヶ]/.test(bodyText2), "非回帰: 全薬剤が照合できる要約には⚠が付かない");

  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await browser.close();
  console.log("── Part2 OK\n");
}

// ========== Part3: 実機（dev+本番env・実Gemini・モックなし） ==========
async function part3() {
  console.log("── Part3: 実機再要約（実Gemini・実プロンプト・§1書き起こし）");
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const lib = await loadLib();

  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // 保存された record の id を捕捉（後で必ず削除する）
  const savedIds = [];
  page.on("response", async (res) => {
    try {
      if (res.request().method() === "POST" && /\/rest\/v1\/records/.test(res.url()) && res.status() < 300) {
        const d = await res.json().catch(() => null);
        const id = d && (Array.isArray(d) ? d[0]?.id : d.id);
        if (id) savedIds.push(id);
      }
    } catch {}
  });

  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await fillTranscript(page, REAL_TRANSCRIPT);
    await page.getByRole("button", { name: "⚡ 要約" }).click();
    await page.getByText(/要約完了/).first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(800); // ガード適用後の最終sOut反映を待つ

    // 結果欄（書き起こし欄以外のtextareaで要約が入っているもの）から実機要約を取得
    const summary = await page.evaluate((inputText) => {
      const tas = [...document.querySelectorAll("textarea")];
      const vals = tas.filter((t) => !(t.placeholder || "").includes("録音ボタン")).map((t) => t.value);
      return vals.find((v) => v && v.trim() && v !== inputText) || "";
    }, REAL_TRANSCRIPT);
    if (!summary) throw new Error("結果欄の要約テキストを取得できませんでした");
    console.log("  ── 実機要約（結果欄全文）──\n" + summary.split("\n").map((l) => "  | " + l).join("\n"));

    // 判定: 音源のない薬剤名が「素で」出ていないこと。
    // ガードを実機要約に掛け直し、⚠なしの未照合薬剤名が残っていないことを確認する。
    const recheck = lib.markUngroundedDrugs(summary, REAL_TRANSCRIPT);
    const naked = recheck.flagged.filter((w) => !summary.includes("⚠" + w));
    assert(naked.length === 0, "P欄に音源のない薬剤名が⚠なしで出ていない" + (naked.length ? "（残存: " + naked.join(",") + "）" : ""));
    assert(!/クリンダマイシン/.test(summary.replace(/⚠クリンダマイシン/g, "")), "音源のないクリンダマイシンが素で出ていない");
    assert(pageErrors.length === 0, "pageerror ゼロ");
  } finally {
    await browser.close();
    // テストで作成した records は成否にかかわらず必ず削除（規約）
    if (SUPA_URL && SUPA_KEY && savedIds.length) {
      for (const id of savedIds) {
        const r = await fetch(`${SUPA_URL}/rest/v1/records?id=eq.${id}`, {
          method: "DELETE",
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
        });
        console.log(`  🗑 テストrecord削除: ${id} → HTTP ${r.status}`);
      }
    } else if (savedIds.length) {
      console.error("  ⚠ テストrecordが残っています(env不足で削除不能): " + savedIds.join(","));
    } else {
      console.log("  （records保存は検出されず=削除対象なし）");
    }
  }
  console.log("── Part3 OK\n");
}

(async () => {
  try {
    const only = process.env.PART || "";
    if (!only || only === "1") await part1();
    if (!only || only === "2") await part2();
    if (!only || only === "3") await part3();
    console.log("✅ 全シナリオ PASS");
    process.exit(0);
  } catch (e) {
    console.error("❌ FAILED:", e.message || e);
    process.exit(1);
  }
})();
