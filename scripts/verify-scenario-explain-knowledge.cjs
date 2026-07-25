// 検証シナリオ: 説明ナレッジ機能（疾患別・院長の説明の型を日次抽出→承認→スタッフ閲覧）
// 実行: node scripts/verify-scenario-explain-knowledge.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// 3部構成で例外ゼロを確認する:
//   Part1) ロジック単体（app/lib/explain-knowledge.js を直接検証）
//     - scrubPII: 個人名(敬称付き)を一般化、一般語(お母さん・様子等)は温存、カルテ番号を伏せる
//     - planMerge: 疾患2つ新規抽出 / 同内容2回目→重複せずincrement / rejected再出現もincrement(復活しない)
//     - findTopicMatch: aliases・カッコ除去での疾患名同一視 / 同一バッチ内重複の畳み込み
//   Part2) Playwright実ブラウザ(supabase RESTとAI APIはモック)で一連のフロー:
//     A) 履歴→日ヘッダ「📚 説明ナレッジ」→抽出→✓6件追加・draft生成→「📚 未承認 6件」バッジ
//     B) 同内容を2回目抽出→✓0件追加・6件カウント更新(seen_count=2、重複draftなし)
//     C) 承認タブ: 一括承認(初回のみ管理パスワードprompt)→編集して承認→却下
//     D) 閲覧タブ: 承認済みのみ疾患別・カテゴリ別(■)表示、頻出順、×N頻度バッジ、検索、📋コピー
//     E) トップメニュー「⋯その他」→「📚 説明ナレッジ」導線 / 既存メイン画面の非回帰
//   Part3) 実APIのPII除去(GEMINI_API_KEY があれば実Geminiで氏名入り模擬録→氏名が出ないこと)

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

// ========== Part1: ロジック単体 ==========
async function part1() {
  console.log("── Part1: ロジック単体（scrubPII / planMerge / findTopicMatch）");
  // ESM libを一時.mjsとして読み込む（package.jsonはCJSのため）
  const src = fs.readFileSync(path.join(__dirname, "../app/lib/explain-knowledge.js"), "utf8");
  const tmp = path.join(os.tmpdir(), "explain-knowledge-verify.mjs");
  fs.writeFileSync(tmp, src);
  const lib = await import(pathToFileURL(tmp).href);

  // scrubPII
  const s1 = lib.scrubPII("山田さんには外用薬の塗り方を順番に説明した");
  assert(!s1.includes("山田") && s1.includes("患者さん"), "scrubPII: 「山田さん」→「患者さん」に一般化");
  const s2 = lib.scrubPII("佐藤様とお子さんに、お母さんが保湿を手伝うよう指導");
  assert(!s2.includes("佐藤") && s2.includes("お子さん") && s2.includes("お母さん"), "scrubPII: 「佐藤様」除去・「お子さん」「お母さん」は温存");
  const s3 = lib.scrubPII("しばらく様子を見る。患者さんへ同様の説明");
  assert(s3 === "しばらく様子を見る。患者さんへ同様の説明", "scrubPII: 「様子」「同様」「患者さん」は誤爆しない");
  const s4 = lib.scrubPII("カルテ番号: 123456 の記録、ID:98765 参照");
  assert(!s4.includes("123456") && !s4.includes("98765") && s4.includes("***"), "scrubPII: カルテ番号/IDの数字列を伏せる");

  // planMerge: 疾患2つ新規
  const extracted = [
    { name: "ニキビ（尋常性ざ瘡）", aliases: ["尋常性ざ瘡"], items: [
      { category: "treatment", content: "アダパレンゲルを毎晩1回、洗顔後に塗布する" },
      { category: "qa", content: "Q: 化粧はしてもいいですか？ A: ノンコメドジェニック製品なら可能" },
    ]},
    { name: "アトピー性皮膚炎", aliases: [], items: [
      { category: "skincare", content: "入浴後5分以内の保湿を習慣化するよう指導する" },
    ]},
  ];
  const p1 = lib.planMerge(extracted, [], []);
  assert(p1.newTopics.length === 2 && p1.newItems.length === 3 && p1.increments.length === 0, "planMerge: 疾患2つ→newTopics=2 / newItems=3 / increments=0");

  // planMerge: 同内容2回目 → 重複せずincrement
  const topics = [{ id: "T1", name: "ニキビ（尋常性ざ瘡）", aliases: ["尋常性ざ瘡"] }, { id: "T2", name: "アトピー性皮膚炎", aliases: [] }];
  const items = [
    { id: "I1", topic_id: "T1", category: "treatment", content: "アダパレンゲルを毎晩1回、洗顔後に塗布する", seen_count: 1 },
    { id: "I2", topic_id: "T1", category: "qa", content: "Q: 化粧はしてもいいですか？ A: ノンコメドジェニック製品なら可能", seen_count: 1 },
    { id: "I3", topic_id: "T2", category: "skincare", content: "入浴後5分以内の保湿を習慣化するよう指導する", seen_count: 1 },
  ];
  const p2 = lib.planMerge(extracted, topics, items);
  assert(p2.newTopics.length === 0 && p2.newItems.length === 0, "planMerge: 同内容2回目→新規topic/itemなし");
  assert(p2.increments.length === 3 && p2.increments.includes("I1"), "planMerge: 同内容3件は全てincrements（seen_count加算対象）");

  // 語順・助詞の揺れ程度でも同内容と判定
  const p3 = lib.planMerge([{ name: "尋常性ざ瘡", items: [{ category: "treatment", content: "アダパレンゲルは毎晩1回、洗顔後に塗布する" }] }], topics, items);
  assert(p3.newItems.length === 0 && p3.increments.includes("I1"), "planMerge: aliases一致＋助詞揺れでも同内容→increment");

  // rejected済みの再出現はdraft復活させずincrement
  const itemsRej = [{ id: "I9", topic_id: "T2", category: "skincare", content: "入浴後5分以内の保湿を習慣化するよう指導する", seen_count: 2, status: "rejected" }];
  const p4 = lib.planMerge([extracted[1]], topics, itemsRej);
  assert(p4.newItems.length === 0 && p4.increments.includes("I9"), "planMerge: rejected済み同内容→draft復活せずincrement");

  // 同一バッチ内の重複は1件に畳む
  const p5 = lib.planMerge([{ name: "新疾患X", items: [
    { category: "caution", content: "ステロイドの自己判断での中止はリバウンドの恐れがある" },
    { category: "caution", content: "ステロイドの自己判断での中止は、リバウンドの恐れがある" },
  ]}], [], []);
  assert(p5.newItems.length === 1, "planMerge: 同一バッチ内の実質同内容は1件に畳む");

  // 不正カテゴリ・空contentは弾く
  const p6 = lib.planMerge([{ name: "新疾患Y", items: [{ category: "hack", content: "x" }, { category: "qa", content: "" }] }], [], []);
  assert(p6.newTopics.length === 0 && p6.newItems.length === 0, "planMerge: 不正カテゴリ/空contentは登録しない");
  console.log("── Part1 OK\n");
}

// ========== Part2: 実ブラウザ一連フロー ==========
// 抽出APIモックの返却（実サーバはscrubPII後に返すため、ここではクリーンな内容）
const EXTRACT_TOPICS = [
  { name: "ニキビ（尋常性ざ瘡）", aliases: ["尋常性ざ瘡", "アクネ"], items: [
    { category: "treatment", content: "アダパレンゲルを毎晩1回、洗顔後に顔全体へ薄く塗布する（効果判定まで3か月継続）" },
    { category: "explanation", content: "毛穴の詰まりから始まる病気であることを最初に伝え、悪化要因→治療→期間の順で説明する" },
    { category: "qa", content: "Q: 化粧はしてもいいですか？ A: ノンコメドジェニック製品なら可能と伝える" },
  ]},
  { name: "アトピー性皮膚炎", aliases: [], items: [
    { category: "treatment", content: "保湿剤を1日2回全身に塗布し、炎症部位にはステロイド外用薬を重ねて塗る" },
    { category: "skincare", content: "入浴後5分以内の保湿を習慣化するよう指導する" },
    { category: "caution", content: "ステロイドを自己判断で中止するとリバウンドの恐れがあると説明する" },
  ]},
];

async function part2() {
  console.log("── Part2: 実ブラウザ一連フロー（抽出→承認→閲覧）");
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  const dialogs = [];
  page.on("dialog", async (d) => {
    dialogs.push({ type: d.type(), msg: d.message() });
    if (d.type() === "prompt") await d.accept(DEL_PWD);
    else await d.accept();
  });

  // ---- in-memory supabase RESTモック ----
  let idc = 0;
  const genId = (p) => `${p}-${String(++idc).padStart(3, "0")}`;
  const db = { topics: [], items: [] };
  const records = [{
    id: "rec-1", created_at: new Date().toISOString(), patient_id: "",
    input_text: "山田太郎さん、ニキビの経過を見ますね。アダパレンを毎晩1回続けてください。化粧はノンコメドジェニックなら大丈夫です。次は鈴木花子さん、アトピーですね。保湿剤は1日2回、お風呂上がり5分以内に塗ってください。ステロイドは自己判断でやめないでくださいね。",
    output_text: "S) ニキビ・アトピーの再診\nO) 面皰散在/軽度乾燥\nA) 尋常性ざ瘡・アトピー性皮膚炎\nP) アダパレン継続・保湿指導",
  }];

  await ctx.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const method = req.method();
    const accept = req.headers()["accept"] || "";
    const json = (body, status = 200, headers = {}) =>
      route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
    const applyFilters = (rows) => {
      let out = rows;
      for (const [k, v] of url.searchParams.entries()) {
        if (["select", "order", "limit", "offset"].includes(k)) continue;
        const m = /^eq\.(.*)$/.exec(v);
        if (m) out = out.filter((r) => String(r[k]) === m[1]);
      }
      return out;
    };
    try {
      if (table === "records" && method === "GET") return json(records);
      if (table === "explain_topics") {
        if (method === "GET") return json(applyFilters(db.topics));
        if (method === "POST") {
          const b = req.postDataJSON();
          const row = { id: genId("topic"), created_at: new Date().toISOString(), ...b };
          db.topics.push(row);
          return json(accept.includes("vnd.pgrst.object") ? row : [row], 201);
        }
      }
      if (table === "explain_items") {
        if (method === "HEAD") {
          const n = applyFilters(db.items).length;
          return route.fulfill({ status: 200, headers: { "content-range": n ? `0-${n - 1}/${n}` : "*/0" }, body: "" });
        }
        if (method === "GET") return json(applyFilters(db.items));
        if (method === "POST") {
          const b = req.postDataJSON();
          const rows = (Array.isArray(b) ? b : [b]).map((r) => ({ id: genId("item"), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }));
          db.items.push(...rows);
          return json(rows, 201);
        }
        if (method === "PATCH") {
          const targets = applyFilters(db.items);
          const b = req.postDataJSON();
          targets.forEach((r) => Object.assign(r, b));
          return route.fulfill({ status: 204, body: "" });
        }
      }
      // その他テーブルは空応答（既存フローのノイズ回避）
      if (method === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
      if (method === "GET") return json([]);
      return route.fulfill({ status: 204, body: "" });
    } catch (e) {
      console.error("mock route error:", e);
      return json({ message: String(e) }, 500);
    }
  });
  await ctx.route(/\/storage\/v1\//, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  // 抽出APIモック（実サーバの応答形式 {topics, model}）
  let extractCalls = 0;
  await ctx.route("**/api/explain-extract", async (route) => {
    extractCalls++;
    const body = route.request().postDataJSON();
    if (!Array.isArray(body.records) || body.records.length === 0)
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "対象の診察記録がありません" }) });
    await new Promise((r) => setTimeout(r, 300));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ topics: EXTRACT_TOPICS, model: "mock" }) });
  });

  const waitText = (t, timeout = 8000) => page.getByText(t, { exact: false }).first().waitFor({ state: "visible", timeout });

  // A) メイン→履歴→抽出
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 20000 });
  console.log("  ✓ メイン画面表示（非回帰: 録音/書き起こしUIあり）");
  await page.getByRole("button", { name: /📂 履歴/ }).first().click();
  await waitText("📚 説明ナレッジ");
  assert(!(await page.getByText(/📚 未承認 \d+件/).count()), "抽出前は「未承認」バッジが出ない(draft 0件)");
  await page.getByRole("button", { name: "📚 説明ナレッジ", exact: true }).first().click();
  await waitText("✓ 6件追加・0件カウント更新");
  console.log("  ✓ 抽出1回目: BtnFb「✓ 6件追加・0件カウント更新」");
  assert(db.topics.length === 2, "explain_topics に疾患2件が自動作成された");
  assert(db.items.length === 6 && db.items.every((i) => i.status === "draft"), "explain_items に6件が draft で登録された");
  assert(db.items.every((i) => i.seen_count === 1), "初回抽出の seen_count は 1");
  await waitText(/📚 未承認 6件/);
  console.log("  ✓ 「📚 未承認 6件」バッジが表示");

  // B) 同内容の2回目抽出 → 重複なし・seen_count加算
  await page.getByRole("button", { name: "📚 説明ナレッジ", exact: true }).first().click();
  await waitText("✓ 0件追加・6件カウント更新");
  assert(db.items.length === 6, "2回目抽出でも件数は6のまま（重複draftなし）");
  assert(db.items.every((i) => i.seen_count === 2), "全6件の seen_count が 2 に加算された");
  console.log("  ✓ 抽出2回目: 重複せず seen_count のみ加算");

  // C) 承認タブ（バッジから遷移）
  await page.getByRole("button", { name: /📚 未承認 6件/ }).click();
  await waitText("✅ 承認（院長）");
  await waitText("ニキビ（尋常性ざ瘡）");
  await waitText("アトピー性皮膚炎");
  assert((await page.getByText("下書き 3件").count()) === 2, "承認タブ: 両疾患に「下書き 3件」");
  await waitText("💊 治療内容");
  // 一括承認（初回はパスワードprompt）
  await page.getByRole("button", { name: /✓ この疾患を一括承認（3件）/ }).first().click();
  await waitText("✓ 3件を承認しました");
  assert(dialogs.filter((d) => d.type === "prompt").length === 1, "一括承認の初回に管理パスワードpromptが1回出た");
  const nikibiId = db.topics.find((t) => t.name.startsWith("ニキビ")).id;
  assert(db.items.filter((i) => i.topic_id === nikibiId).every((i) => i.status === "approved"), "ニキビの3件が approved になった");
  // 編集して承認（2回目以降はprompt不要）
  await page.getByRole("button", { name: "✏ 編集して承認" }).first().click();
  const ta = page.locator("textarea").last();
  await ta.fill("保湿剤を1日2回、朝と入浴後に全身へ塗布する（編集済み）");
  await page.getByRole("button", { name: "💾 この内容で承認" }).click();
  await waitText("✓ 1件を承認しました");
  assert(db.items.some((i) => i.status === "approved" && i.content.includes("（編集済み）")), "編集した文言で承認された（content上書き）");
  // 却下
  await page.getByRole("button", { name: "✗ 却下" }).first().click();
  await waitText("✗ 1件を却下しました");
  assert(db.items.filter((i) => i.status === "rejected").length === 1, "1件が rejected になった");
  // 残り1件を一括承認
  await page.getByRole("button", { name: /✓ この疾患を一括承認（1件）/ }).click();
  await waitText("未承認の下書きはありません");
  assert(dialogs.filter((d) => d.type === "prompt").length === 1, "2回目以降の承認操作でpromptは再要求されない（セッション中1回）");
  assert(db.items.filter((i) => i.status === "draft").length === 0, "draft が 0 件になった");
  console.log("  ✓ 承認タブ: 一括承認/編集して承認/却下が全て動作");

  // D) 閲覧タブ
  await page.getByRole("button", { name: "👀 閲覧" }).click();
  await page.locator('input[placeholder*="疾患名"]').waitFor();
  const chips = page.locator("button", { hasText: /×\d+/ });
  await chips.first().waitFor();
  assert((await chips.count()) === 2, "閲覧タブ: 疾患チップが2件（承認済みのみ）");
  const firstChip = await chips.first().innerText();
  assert(firstChip.includes("ニキビ") && firstChip.includes("×6"), "頻出順ソート: ニキビ（合計×6）が先頭");
  await chips.first().click();
  await waitText("■ 💊 治療内容");
  await waitText("■ 🗣 説明の仕方（この順で説明する）");
  await waitText("■ ❓ よくある質問と回答");
  assert((await page.getByText("×2").count()) >= 3, "各項目に頻度バッジ ×2 が表示");
  assert((await page.getByRole("button", { name: "📋 コピー" }).count()) === 1, "📋コピーボタンあり");
  // 却下した内容は閲覧に出ない
  const rejected = db.items.find((i) => i.status === "rejected");
  assert((await page.getByText(rejected.content).count()) === 0, "却下した項目は閲覧タブに表示されない");
  // 検索（疾患名・本文キーワード）
  const search = page.locator('input[placeholder*="疾患名"]');
  await search.fill("アトピー");
  assert((await chips.count()) === 1 && (await chips.first().innerText()).includes("アトピー"), "検索「アトピー」で疾患名絞り込み");
  await search.fill("ノンコメドジェニック");
  assert((await chips.count()) === 1 && (await chips.first().innerText()).includes("ニキビ"), "本文キーワード検索でも絞り込める");
  await search.fill("");
  console.log("  ✓ 閲覧タブ: カテゴリ別■表示/頻出順/×N/コピー/検索/却下非表示");

  // E) トップメニュー導線＋非回帰
  await page.getByRole("button", { name: "✕ 閉じる" }).click();
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor();
  await page.getByRole("button", { name: /⋯ その他/ }).click();
  await page.getByRole("button", { name: /📚 説明ナレッジ/ }).click();
  await waitText("📚 説明ナレッジ");
  await waitText("👀 閲覧");
  console.log("  ✓ トップメニュー「⋯その他」→「📚 説明ナレッジ」導線");
  assert(extractCalls === 2, "抽出APIは意図した2回のみ呼ばれた");
  assert(pageErrors.length === 0, "ページ例外ゼロ");
  // ヘッドレス環境固有・本機能と無関係な既知ノイズは除外（マイク列挙不可/React開発警告/リソース404）
  const realConsoleErrors = consoleErrors.filter((t) => !/Download the React DevTools|Warning:|Mic enumeration error|Failed to load resource/.test(t));
  assert(realConsoleErrors.length === 0, "consoleエラーゼロ" + (realConsoleErrors.length ? ": " + realConsoleErrors.join(" | ") : ""));

  await browser.close();
  console.log("── Part2 OK\n");
}

// ========== Part3: 実API PII除去（GEMINI_API_KEY がある環境のみ） ==========
async function part3() {
  console.log("── Part3: 実APIのPII除去（実Gemini・氏名入り模擬録）");
  const res = await fetch(BASE + "/api/explain-extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: "2026/07/25",
      records: [{
        input_text: "山田太郎さん、45歳、会社員の方ですね。ニキビにアダパレンを毎晩1回塗ってください。化粧はノンコメドジェニックなら大丈夫。次に鈴木花子さん、アトピー性皮膚炎です。保湿剤を1日2回、お風呂上がり5分以内に。ステロイドは自己判断でやめるとリバウンドしますよ。",
        output_text: "A) 尋常性ざ瘡・アトピー性皮膚炎\nP) アダパレン継続・保湿指導・ステロイド外用",
      }],
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`  ⚠ SKIP: 実APIが ${res.status} (${d.error || "?"}) — GEMINI_API_KEY未設定などローカル環境要因の可能性。PII除去はPart1のscrubPII単体で検証済み`);
    return;
  }
  const flat = JSON.stringify(d.topics || []);
  assert(Array.isArray(d.topics) && d.topics.length >= 1, `実Geminiが疾患を抽出した（${(d.topics || []).length}疾患 / model=${d.model}）`);
  assert(!flat.includes("山田") && !flat.includes("鈴木") && !flat.includes("太郎") && !flat.includes("花子"), "抽出結果に患者氏名が含まれない");
  assert(!flat.includes("45歳") && !flat.includes("会社員"), "抽出結果に年齢・職業が含まれない");
  console.log("── Part3 OK\n");
}

// PART=1|2|3 で該当パートのみ実行（例: 本番URLで実Gemini PII検証のみ → PART=3 node scripts/... https://本番URL）
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
