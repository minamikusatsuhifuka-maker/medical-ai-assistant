// 検証シナリオ: 事前問診項目の抽出機能（指示書 intake-question-extraction）
// 実行: [PART=1|2|3] node scripts/verify-scenario-intake-knowledge.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// 3部構成:
//   Part1) ロジック単体（intake-knowledge.js: 見出しグループ化/dedup/カテゴリ検証/scrubPII流用）
//   Part2) Playwright実ブラウザ(chromium・fake media・supabase RESTとAI APIはモック)で一連のフロー:
//     期間指定 → 抽出実行(進捗表示) → draft生成 → 承認(初回のみ管理パスワードprompt) → スタッフ閲覧 → 印刷用出力
//   Part3) 実データ検証（本番env・実Gemini・DB書込なし=route直叩き）:
//     本番recordsの過去90日を「# 疾患名」見出しでグループ化 → 上位3疾患を抽出 → 生成項目を全文出力（報告用）
//     ＋個人情報の機械チェック（scrubPIIで不動=スクラブ対象が残っていない）
// dev 起動の注意: Part2はダミーenv上書き、Part3は `npx vercel env pull /tmp/maa-prod.env` の本番envで起動すること。

let pw;
try { pw = require("playwright"); }
catch { pw = require("/Users/tpjatpja/.npm/_npx/e41f203b7505f1fb/node_modules/playwright"); }
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const BASE = process.argv[2] || "http://localhost:3100";
const DEL_PWD = "mkhifuka1199";

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
}

// intake-knowledge.js は explain-knowledge.js を import するため、tmpディレクトリに両ファイル＋
// package.json({"type":"module"}) を置いて ESM として読み込む（drug-guard検証と同じ方式）
async function loadLib() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intake-verify-"));
  fs.writeFileSync(path.join(dir, "package.json"), '{"type":"module"}');
  for (const f of ["intake-knowledge.js", "explain-knowledge.js"]) {
    fs.copyFileSync(path.join(__dirname, "../app/lib/" + f), path.join(dir, f));
  }
  return import(pathToFileURL(path.join(dir, "intake-knowledge.js")).href);
}

// ========== Part1: ロジック単体 ==========
async function part1() {
  console.log("── Part1: ロジック単体（見出しグループ化 / planIntakeMerge / scrubPII流用）");
  const lib = await loadLib();

  assert(lib.INTAKE_CATEGORIES.length === 6 && lib.INTAKE_CATEGORY_IDS.includes("薬剤・アレルギー"), "カテゴリ6種が定義されている");
  assert(lib.INTAKE_DISCLAIMER.includes("診察の補助"), "固定文言（診察の補助）が定義されている");

  // 見出しグループ化
  const h1 = lib.extractDiseaseHeadings("# ニキビ（尋常性ざ瘡）\nS）経過良好");
  assert(h1.length === 1 && h1[0] === "ニキビ（尋常性ざ瘡）", "単一の「# 疾患名」見出しを抽出");
  const h2 = lib.extractDiseaseHeadings("# アトピー性皮膚炎\nS）...\n\n# 足白癬\nS）...");
  assert(h2.length === 2 && h2.includes("足白癬"), "複数疾患SOAPは複数見出しを抽出");
  assert(lib.extractDiseaseHeadings("S）見出しなしの要約").length === 0, "見出しの無い要約は対象外");

  // 疾患名の同一視（正規化比較）
  const topics = [{ id: "T1", name: "ニキビ（尋常性ざ瘡）" }];
  assert(lib.findIntakeTopicMatch("ニキビ（尋常性ざ瘡）", topics)?.id === "T1", "同名topicを正規化比較で同一視");
  assert(lib.findIntakeTopicMatch("水虫", topics) === null, "別疾患はマッチしない");

  // planIntakeMerge: 新規
  const ext = [
    { category: "発症・経過", question: "いつ頃から症状がありますか？", intent: "発症時期の確認" },
    { category: "薬剤・アレルギー", question: "薬や化粧品でかぶれたことはありますか？", intent: "アレルギー歴の確認" },
  ];
  const p1 = lib.planIntakeMerge(ext, []);
  assert(p1.newItems.length === 2 && p1.increments.length === 0, "planIntakeMerge: 新規2件");
  // dup → increment（頻度が育つ・頻度1でも保持される設計）
  const existing = [{ id: "I1", category: "発症・経過", question: "いつ頃から症状がありますか？", seen_count: 1, status: "draft" }];
  const p2 = lib.planIntakeMerge(ext, existing);
  assert(p2.newItems.length === 1 && p2.increments.includes("I1"), "planIntakeMerge: 実質同内容はincrement・新規は追加");
  // 助詞揺れも同内容（bigram類似0.8・説明ナレッジと同じ実装）
  const existing2 = [{ id: "I2", category: "悪化因子・生活環境", question: "汗をかいた後に症状が悪化することはありますか？", seen_count: 1, status: "draft" }];
  const p3 = lib.planIntakeMerge([{ category: "悪化因子・生活環境", question: "汗をかいた後に症状が悪化することがありますか？", intent: "" }], existing2);
  assert(p3.newItems.length === 0 && p3.increments.includes("I2"), "planIntakeMerge: 語尾・助詞揺れも同内容判定");
  // rejected の再出現は draft 復活させない
  const rej = [{ id: "I9", category: "発症・経過", question: "いつ頃から症状がありますか？", seen_count: 3, status: "rejected" }];
  const p4 = lib.planIntakeMerge([ext[0]], rej);
  assert(p4.newItems.length === 0 && p4.increments.includes("I9"), "planIntakeMerge: rejected済みは復活せずincrement");
  // 同一バッチ内dedup・不正カテゴリ/空questionの除外
  const p5 = lib.planIntakeMerge([
    { category: "その他", question: "現在、市販の塗り薬や飲み薬を使っていますか？", intent: "" },
    { category: "その他", question: "現在、市販の塗り薬や飲み薬は使っていますか？", intent: "" },
    { category: "診断", question: "これは癌ですか？", intent: "" },
    { category: "その他", question: "", intent: "x" },
  ], []);
  assert(p5.newItems.length === 1, "planIntakeMerge: バッチ内重複は1件・不正カテゴリ/空questionは除外");

  // 個人情報の機械チェック（説明ナレッジのscrubPIIを流用）
  const s1 = lib.scrubPII("山田さんはいつから症状がありますか？");
  assert(!s1.includes("山田") && s1.includes("患者さん"), "scrubPII流用: 敬称付き氏名を一般化");
  console.log("── Part1 OK\n");
}

// ========== Part2: 実ブラウザ一連フロー ==========
const MOCK_ITEMS = [
  { category: "発症・経過", question: "いつ頃から症状がありますか？", intent: "発症時期の確認" },
  { category: "症状の性状", question: "かゆみや痛みはありますか？", intent: "自覚症状の確認" },
  { category: "悪化因子・生活環境", question: "汗をかいた後に悪化しますか？", intent: "悪化因子の確認" },
  { category: "薬剤・アレルギー", question: "薬や化粧品でかぶれたことはありますか？", intent: "アレルギー歴の確認" },
];

async function part2() {
  console.log("── Part2: 実ブラウザ一連フロー（抽出→承認→閲覧→印刷）");
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const dialogs = [];
  page.on("dialog", async (d) => {
    dialogs.push({ type: d.type(), msg: d.message() });
    if (d.type() === "prompt") await d.accept(DEL_PWD);
    else await d.accept();
  });

  // in-memory supabase RESTモック
  let idc = 0;
  const genId = (p) => `${p}-${String(++idc).padStart(3, "0")}`;
  const db = { topics: [], items: [] };
  const now = new Date().toISOString();
  const records = [
    { id: "rec-1", created_at: now, input_text: "いつからニキビ出てますか? 洗顔は1日何回してますか?", output_text: "# ニキビ（尋常性ざ瘡）\nS）再診\nP）ベピオ継続" },
    { id: "rec-2", created_at: now, input_text: "かゆみはありますか? 市販の薬は使いました?", output_text: "# ニキビ（尋常性ざ瘡）\nS）新患\nP）ディフェリン新規" },
  ];
  await ctx.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const method = req.method();
    const accept = req.headers()["accept"] || "";
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const applyFilters = (rows) => {
      let out = rows;
      for (const [k, v] of url.searchParams.entries()) {
        if (["select", "order", "limit", "offset"].includes(k)) continue;
        const eq = /^eq\.(.*)$/.exec(v);
        if (eq) out = out.filter((r) => String(r[k]) === eq[1]);
      }
      return out;
    };
    try {
      if (table === "records" && method === "GET") return json(records);
      if (table === "intake_topics") {
        if (method === "GET") return json(applyFilters(db.topics));
        if (method === "POST") {
          const b = req.postDataJSON();
          const row = { id: genId("topic"), created_at: now, ...b };
          db.topics.push(row);
          return json(accept.includes("vnd.pgrst.object") ? row : [row], 201);
        }
        if (method === "PATCH") { applyFilters(db.topics).forEach((r) => Object.assign(r, req.postDataJSON())); return route.fulfill({ status: 204, body: "" }); }
      }
      if (table === "intake_items") {
        if (method === "HEAD") { const n = applyFilters(db.items).length; return route.fulfill({ status: 200, headers: { "content-range": n ? `0-${n - 1}/${n}` : "*/0" }, body: "" }); }
        if (method === "GET") return json(applyFilters(db.items));
        if (method === "POST") {
          const b = req.postDataJSON();
          const rows = (Array.isArray(b) ? b : [b]).map((r) => ({ id: genId("item"), created_at: now, updated_at: now, ...r }));
          db.items.push(...rows);
          return json(accept.includes("vnd.pgrst.object") ? rows[0] : rows, 201);
        }
        if (method === "PATCH") { applyFilters(db.items).forEach((r) => Object.assign(r, req.postDataJSON())); return route.fulfill({ status: 204, body: "" }); }
      }
      if (method === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
      if (method === "GET") return json([]);
      return route.fulfill({ status: 204, body: "" });
    } catch (e) {
      console.error("mock route error:", e);
      return json({ message: String(e) }, 500);
    }
  });
  await ctx.route(/\/storage\/v1\//, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  let extractCalls = 0;
  await ctx.route("**/api/intake-extract", async (route) => {
    extractCalls++;
    const b = route.request().postDataJSON();
    if (!b.disease || !Array.isArray(b.records)) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "bad request" }) });
    await new Promise((r) => setTimeout(r, 300));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: MOCK_ITEMS, model: "mock" }) });
  });

  const clickUntil = async (btnLocator, markerLocator) => {
    for (let i = 0; i < 10; i++) {
      await btnLocator.first().click();
      try { await markerLocator.first().waitFor({ timeout: 1500 }); return; } catch {}
    }
    throw new Error("クリックが反映されません（hydration未完了？）");
  };
  const waitText = (t, timeout = 10000) => page.getByText(t, { exact: false }).first().waitFor({ state: "visible", timeout });

  // ---- メイン → ⋯その他 → 🩺事前問診 ----
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 20000 });
  await clickUntil(page.getByRole("button", { name: /⋯ その他/ }), page.getByRole("button", { name: /🩺 事前問診/ }));
  await page.getByRole("button", { name: /🩺 事前問診/ }).click();
  await waitText("この問診は診察の補助です");
  console.log("  ✓ 事前問診ページ表示・固定文言（診察の補助）あり");

  // ---- 承認タブ: 期間指定 → 抽出 ----
  await page.getByRole("button", { name: /✅ 承認（院長）/ }).click();
  await waitText("📥 診察履歴から問診項目を抽出");
  await page.getByRole("button", { name: "過去30日" }).click();
  await page.getByRole("button", { name: "📥 抽出を実行" }).click();
  await waitText("1/1疾患 完了");
  await waitText(/1疾患処理・4件追加/);
  console.log("  ✓ 期間指定(過去30日)→抽出実行→進捗表示→✓4件追加");
  assert(extractCalls === 1, "抽出APIは疾患単位で1回だけ呼ばれた（2記録を1疾患に集約）");
  assert(db.topics.length === 1 && db.topics[0].name === "ニキビ（尋常性ざ瘡）", "intake_topics に疾患が作成された");
  assert(db.topics[0].record_count === 2 && db.topics[0].period_from && db.topics[0].period_to, "topicに期間・記録件数が保存された");
  assert(db.items.length === 4 && db.items.every((i) => i.status === "draft"), "intake_items に4件が draft で登録された");

  // ---- 2回目抽出: 重複せず seen_count 加算 ----
  await page.getByRole("button", { name: "📥 抽出を実行" }).click();
  await waitText(/1疾患処理・0件追加・4件カウント更新/);
  assert(db.items.length === 4 && db.items.every((i) => i.seen_count === 2), "再実行で重複せず seen_count が育つ");
  console.log("  ✓ 抽出2回目: 0件追加・4件カウント更新(dedup)");

  // ---- 承認（初回のみパスワードprompt）→ 編集して承認 → 却下 ----
  await waitText("下書き 4件");
  await page.getByRole("button", { name: "✏ 編集して承認" }).first().click();
  const ta = page.locator("textarea").last();
  await ta.fill("いつ頃から症状が出ていますか？（編集済み）");
  await page.getByRole("button", { name: "💾 この内容で承認" }).click();
  await waitText("✓ 1件を承認しました");
  assert(dialogs.filter((d) => d.type === "prompt").length === 1, "承認操作の初回に管理パスワードpromptが1回出た");
  assert(db.items.some((i) => i.status === "approved" && i.question.includes("（編集済み）")), "編集した問診文で承認された");
  await page.getByRole("button", { name: "✗ 却下" }).first().click();
  await waitText("✗ 1件を却下しました");
  assert(db.items.filter((i) => i.status === "rejected").length === 1, "1件が rejected になった");
  await page.getByRole("button", { name: /✓ この疾患を一括承認（2件）/ }).click();
  await waitText("未承認の下書きはありません");
  assert(dialogs.filter((d) => d.type === "prompt").length === 1, "2回目以降の承認でpromptは再要求されない");
  assert(db.topics[0].status === "approved", "承認済み項目が生まれた疾患topicは approved になる");
  console.log("  ✓ 承認タブ: 編集して承認/却下/一括承認が動作");

  // ---- 閲覧タブ: カテゴリ順・頻度・却下非表示・コピー ----
  await page.getByRole("button", { name: "👀 閲覧" }).click();
  await page.getByRole("button", { name: /ニキビ（尋常性ざ瘡）/ }).click();
  await waitText("■ 🕒 発症・経過");
  await waitText("■ 💊 薬剤・アレルギー");
  const bodyText = await page.locator("body").innerText();
  const rejected = db.items.find((i) => i.status === "rejected");
  assert(!bodyText.includes(rejected.question), "却下した項目は閲覧タブに表示されない");
  assert((await page.getByText("×2").count()) >= 2, "頻度バッジ ×2 が表示される");
  assert((await page.getByRole("button", { name: "📋 コピー" }).count()) === 1, "📋コピーあり");
  console.log("  ✓ 閲覧タブ: カテゴリ別表示/頻度/却下非表示");

  // ---- 印刷用出力（別ウィンドウ） ----
  const [popup] = await Promise.all([
    ctx.waitForEvent("page", { timeout: 10000 }),
    page.getByRole("button", { name: "🖨 印刷" }).click(),
  ]);
  await popup.waitForLoadState("domcontentloaded");
  const printText = await popup.locator("body").innerText();
  assert(printText.includes("事前問診チェックリスト") && printText.includes("ニキビ（尋常性ざ瘡）"), "印刷用出力に疾患名つきチェックリストが出る");
  assert(printText.includes("この問診は診察の補助です"), "印刷用出力にも固定文言が入る");
  assert(printText.includes("☐"), "印刷用出力はチェックボックス形式");
  await popup.close();

  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await browser.close();
  console.log("── Part2 OK\n");
}

// ========== Part3: 実データ検証（実Gemini・DB書込なし） ==========
async function part3() {
  console.log("── Part3: 実データ抽出（本番records・実Gemini・route直叩き=DB書込なし）");
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPA_URL || !SUPA_KEY) throw new Error("本番env（NEXT_PUBLIC_SUPABASE_URL/ANON_KEY）が必要です");
  const lib = await loadLib();

  // 過去90日の記録を取得（新しい順・最大3000件）
  const fromISO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const recs = [];
  for (let pg = 0; pg < 3; pg++) {
    const r = await fetch(`${SUPA_URL}/rest/v1/records?select=input_text,output_text,created_at&created_at=gte.${encodeURIComponent(fromISO)}&order=created_at.desc&limit=1000&offset=${pg * 1000}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    });
    if (!r.ok) throw new Error("records取得失敗: " + r.status);
    const d = await r.json();
    recs.push(...d);
    if (d.length < 1000) break;
  }
  const groups = {};
  for (const r of recs) for (const name of lib.extractDiseaseHeadings(r.output_text)) (groups[name] = groups[name] || []).push(r);
  const names = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  console.log(`  記録${recs.length}件 → 疾患${names.length}種（上位: ${names.slice(0, 5).map((n) => `${n}(${groups[n].length})`).join(" / ")}）`);
  assert(names.length >= 3, "実データに3疾患以上の見出しがある");

  let piiIssues = 0;
  for (const name of names.slice(0, 3)) {
    const sample = groups[name].slice(0, 30).map((r) => ({ input_text: r.input_text || "", output_text: r.output_text || "" }));
    const t0 = Date.now();
    const res = await fetch(BASE + "/api/intake-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disease: name, records: sample }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) throw new Error(`実抽出失敗(${name}): ${d.error || res.status}`);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n  ══ ${name}（${sample.length}記録 / ${sec}秒 / model=${d.model} / ${d.items.length}項目）══`);
    for (const it of d.items) {
      console.log(`  [${it.category}] ${it.question}${it.intent ? `\n      🎯 ${it.intent}` : ""}`);
      // 個人情報の機械チェック: scrubPIIを通しても不変（=氏名・ID等のスクラブ対象が残っていない）
      if (lib.scrubPII(it.question) !== it.question || lib.scrubPII(it.intent || "") !== (it.intent || "")) {
        piiIssues++;
        console.log("      ⚠ PII機械チェックで変化あり（要目視確認）");
      }
    }
    assert(d.items.length > 0, `${name}: 問診項目が1件以上生成された`);
    assert(d.items.every((it) => lib.INTAKE_CATEGORY_IDS.includes(it.category)), `${name}: 全項目のカテゴリが規定6種のいずれか`);
  }
  assert(piiIssues === 0, "PII機械チェック: 全項目でscrubPII不変（氏名・ID等の残存なし）");
  console.log("  （route直叩きのため intake_topics / intake_items / records への書き込みなし=削除対象なし）");
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
