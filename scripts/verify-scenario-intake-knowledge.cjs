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

  // ===== intake-quality-fix: 固定基本問診セット =====
  assert(Array.isArray(lib.INTAKE_FIXED_QUESTIONS) && lib.INTAKE_FIXED_QUESTIONS.length === 4, "固定基本問診セットは4項目");
  assert(lib.INTAKE_FIXED_QUESTIONS.some((q) => q.question.includes("妊娠")), "固定セットに妊娠・授乳の確認が含まれる（投与可否判断に必須）");
  assert(lib.INTAKE_VISIT_TYPES.join(",") === "初診,再診,共通", "visit_type の3値が定義されている");

  // ===== intake-dedup-fix: planIntakeMergeV2（LLM同義判定の解決） =====
  const exV2 = [
    { id: "A1", category: "発症・経過", question: "症状はいつ頃からどのように始まりましたか？", seen_count: 2, status: "approved" },
    { id: "D1", category: "症状の性状", question: "かゆみはありますか？", seen_count: 1, status: "draft" },
    { id: "R1", category: "その他", question: "市販薬を使っていますか？", seen_count: 3, status: "rejected" },
  ];
  const v1 = lib.planIntakeMergeV2([{ existing: 1 }, { existing: 2 }], exV2);
  assert(v1.newItems.length === 0 && v1.increments.includes("A1") && v1.increments.includes("D1"), "V2: {existing:n} は新規insertせず seen_count 加算対象になる（approved含む）");
  const v2 = lib.planIntakeMergeV2([{ existing: 3 }], exV2);
  assert(v2.newItems.length === 0 && v2.increments.length === 0 && v2.rejectedSkips === 1, "V2: rejected は draft 復活させず seen_count も加算しない");
  const v3 = lib.planIntakeMergeV2([{ category: "発症・経過", question: "症状はいつ頃からどのように始まりましたか", intent: "", visit_type: "初診" }], exV2);
  assert(v3.newItems.length === 0 && v3.increments.includes("A1"), "V2: LLMが同義を見逃してもbigram保険で既存へ寄る");
  const v4 = lib.planIntakeMergeV2([{ category: "既往・治療歴", question: "ご家族に同じ症状の方はいますか？", intent: "家族歴", visit_type: "怪しい値" }], exV2);
  assert(v4.newItems.length === 1 && v4.newItems[0].visit_type === "共通", "V2: 新規は登録され、不正な visit_type は共通に正規化");
  assert(lib.planIntakeMergeV2([{ existing: 99 }, { existing: 0 }], exV2).increments.length === 0, "V2: 範囲外の existing 番号は無視（fail-open）");

  // ===== intake-nonword-fix: 非語の機械置換 =====
  assert(lib.fixNonWords("イボがある場所に痛増や痒みはありますか？") === "イボがある場所に痛みや痒みはありますか？", "fixNonWords: 痛増→痛み");
  assert(lib.fixNonWords("痒増はありますか") === "かゆみはありますか" && lib.fixNonWords("症状増はありますか") === "症状の増加はありますか", "fixNonWords: 痒増/症状増も置換");
  assert(lib.fixNonWords("温熱による症状増悪の有無の確認") === "温熱による症状増悪の有無の確認", "fixNonWords: 実在語「症状増悪」は壊さない（増悪保護）");
  assert(lib.fixNonWords("特定の間柄や場面で汗が増えますか？") === "特定の間柄や場面で汗が増えますか？", "fixNonWords: 実在語「間柄」は置換対象外（設計の担保）");
  assert(lib.fixNonWords(null) === null || lib.fixNonWords(null) === "", "fixNonWords: 不正入力でも例外を出さない（fail-open）");
  assert(Array.isArray(lib.NON_WORD_FIXES) && lib.NON_WORD_FIXES.length >= 3, "NON_WORD_FIXES が定数表として定義されている");
  console.log("── Part1 OK\n");
}

// ========== Part2: 実ブラウザ一連フロー ==========
const MOCK_ITEMS = [
  { category: "発症・経過", question: "いつ頃から症状がありますか？", intent: "発症時期の確認", visit_type: "初診" },
  { category: "症状の性状", question: "かゆみや痛みはありますか？", intent: "自覚症状の確認", visit_type: "共通" },
  { category: "悪化因子・生活環境", question: "汗をかいた後に悪化しますか？", intent: "悪化因子の確認", visit_type: "共通" },
  { category: "薬剤・アレルギー", question: "処方されたお薬で刺激を感じることはありますか？", intent: "副作用の確認", visit_type: "再診" },
];
const NEW5 = { category: "既往・治療歴", question: "これまでに医療機関で治療を受けたことはありますか？", intent: "治療歴の確認", visit_type: "初診" };
const NEW6 = { category: "その他", question: "ご家族に同じ症状の方はいますか？", intent: "家族歴の確認", visit_type: "初診" };

async function part2() {
  console.log("── Part2: 実ブラウザ一連フロー（LLM同義判定dedup→承認→全消去→閲覧→印刷）");
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

  // in-memory supabase RESTモック（visit_typeカラムあり想定）
  let idc = 0;
  const genId = (p) => `${p}-${String(++idc).padStart(3, "0")}`;
  const db = { topics: [], items: [] };
  const now = new Date().toISOString();
  const records = [
    { id: "rec-1", created_at: now, input_text: "いつからニキビ出てますか?", output_text: "# ニキビ（尋常性ざ瘡）\nS）再診\nP）ベピオ継続" },
    { id: "rec-2", created_at: now, input_text: "かゆみはありますか?", output_text: "# ニキビ（尋常性ざ瘡）\nS）新患\nP）ディフェリン新規" },
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
        if (["select", "order", "limit", "offset", "on_conflict"].includes(k)) continue;
        const eq = /^eq\.(.*)$/.exec(v);
        if (eq) out = out.filter((r) => String(r[k]) === eq[1]);
      }
      return out;
    };
    try {
      if (table === "records" && method === "GET") return json(records);
      const store = table === "intake_topics" ? db.topics : table === "intake_items" ? db.items : null;
      if (store) {
        if (method === "HEAD") { const n = applyFilters(store).length; return route.fulfill({ status: 200, headers: { "content-range": n ? `0-${n - 1}/${n}` : "*/0" }, body: "" }); }
        if (method === "GET") return json(applyFilters(store));
        if (method === "POST") {
          const b = req.postDataJSON();
          const rows = (Array.isArray(b) ? b : [b]).map((r) => ({ id: genId(table), created_at: now, updated_at: now, ...r }));
          store.push(...rows);
          return json(accept.includes("vnd.pgrst.object") ? rows[0] : rows, 201);
        }
        if (method === "PATCH") { applyFilters(store).forEach((r) => Object.assign(r, req.postDataJSON())); return route.fulfill({ status: 204, body: "" }); }
        if (method === "DELETE") { const del = applyFilters(store); del.forEach((r) => store.splice(store.indexOf(r), 1)); return route.fulfill({ status: 204, body: "" }); }
      }
      if (method === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
      if (method === "GET") return json([]);
      return route.fulfill({ status: 204, body: "" });
    } catch (e) { console.error("mock route error:", e); return json({ message: String(e) }, 500); }
  });
  await ctx.route(/\/storage\/v1\//, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  // 抽出APIモック: existing が渡されたら {existing:番号} を返す（LLM同義判定の再現）
  let extractCalls = 0;
  const apiExisting = [];
  await ctx.route("**/api/intake-extract", async (route) => {
    extractCalls++;
    const b = route.request().postDataJSON();
    apiExisting.push((b.existing || []).length);
    await new Promise((r) => setTimeout(r, 200));
    let items;
    if (extractCalls === 1) items = MOCK_ITEMS;                                                        // 初回: 新規4件
    else if (extractCalls === 2) items = [...b.existing.map((_, i) => ({ existing: i + 1 })), NEW5];   // 2回目: 全て同義+新規1件
    else if (extractCalls === 3) items = b.existing.map((_, i) => ({ existing: i + 1 }));              // 3回目: 全て同義（新規ゼロ）
    else items = [...b.existing.map((_, i) => ({ existing: i + 1 })), NEW6];                           // 4回目: 全消去テスト用に新規1件
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items, model: "mock" }) });
  });

  const clickUntil = async (btnLocator, markerLocator) => {
    for (let i = 0; i < 10; i++) {
      await btnLocator.first().click();
      try { await markerLocator.first().waitFor({ timeout: 1500 }); return; } catch {}
    }
    throw new Error("クリックが反映されません（hydration未完了？）");
  };
  const waitText = (t, timeout = 10000) => page.getByText(t, { exact: false }).first().waitFor({ state: "visible", timeout });
  const runExtract = async (expectMsg) => { await page.getByRole("button", { name: "📥 抽出を実行" }).click(); await waitText(expectMsg); };

  // ---- 事前問診ページへ ----
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 20000 });
  await clickUntil(page.getByRole("button", { name: /⋯ その他/ }), page.getByRole("button", { name: /🩺 事前問診/ }));
  await page.getByRole("button", { name: /🩺 事前問診/ }).click();
  await waitText("この問診は診察の補助です");
  await page.getByRole("button", { name: /✅ 承認（院長）/ }).click();
  await waitText("📥 診察履歴から問診項目を抽出");
  // 並び順: 検索 → （承認済み/下書き/却下済み）→ 抽出パネル → 統合UI（Y座標で比較。placeholderはinnerTextに出ないため）
  {
    const yOf = async (loc) => (await loc.boundingBox())?.y ?? -1;
    const ySearch = await yOf(page.getByPlaceholder("🔍 疾患名・問診文で検索（下書き/承認済み/却下済みを横断）"));
    const yExtract = await yOf(page.getByText("📥 診察履歴から問診項目を抽出").first());
    const yMerge = await yOf(page.getByText("🔗 疾患の統合・エイリアス辞書").first());
    assert(ySearch >= 0 && ySearch < yExtract && yExtract < yMerge, "並び順: 検索が最上部・抽出パネルと統合UIが最下部");
  }
  await page.getByRole("button", { name: "過去30日" }).click();
  await page.getByRole("button", { name: "1（全件）" }).click(); // モックは2記録のため既定の最低出現3では対象外

  // ---- 1回目: 新規4件（visit_type保存） ----
  await runExtract(/1疾患処理・4件追加/);
  assert(db.topics.length === 1 && db.topics[0].name === "尋常性ざ瘡", "intake_topics に名寄せ済みキーで作成");
  assert(db.items.length === 4 && db.items.every((i) => i.status === "draft"), "1回目: 4件が draft で登録");
  assert(db.items[0].visit_type === "初診" && db.items[3].visit_type === "再診", "visit_type が保存される（初診/再診）");
  assert(apiExisting[0] === 0, "1回目のAPIには既存項目が渡らない");

  // ---- 2回目: 同義4件は加算のみ+新規1件（増殖しない） ----
  await runExtract(/1疾患処理・1件追加・4件カウント更新/);
  assert(apiExisting[1] === 4, "2回目のAPIに既存4項目が番号つきで渡る");
  assert(db.items.length === 5, "2回目: 同義4件は insert されず件数は5（増殖しない）");
  assert(db.items.slice(0, 4).every((i) => i.seen_count === 2), "同義4件は seen_count +1 のみ");

  // ---- 承認フェーズ: NEW5を却下・1件編集承認・残り3件一括承認 ----
  await waitText("下書き 5件");
  const rejCard = page.locator("div").filter({ hasText: /^🕒?.*これまでに医療機関で治療を受けたことはありますか/ });
  // NEW5（治療歴）の却下: 該当項目の却下ボタンを質問文から辿る
  const items5 = page.getByText("これまでに医療機関で治療を受けたことはありますか？");
  await items5.first().waitFor();
  await page.locator("div", { has: items5 }).locator("button", { hasText: "✗ 却下" }).last().click();
  await waitText("✗ 1件を却下しました");
  await page.getByRole("button", { name: "✏ 編集して承認" }).first().click();
  await page.locator("textarea").last().fill("いつ頃から症状が出ていますか？（編集済み）");
  await page.getByRole("button", { name: "💾 この内容で承認" }).click();
  await waitText("✓ 1件を承認しました");
  assert(dialogs.filter((d) => d.type === "prompt").length === 1, "承認系の初回に管理パスワードpromptが1回");
  await page.getByRole("button", { name: /✓ この疾患を一括承認（3件）/ }).click();
  await page.waitForTimeout(600);
  assert((await page.getByText(/📝 下書き（\d+件）/).count()) === 0, "下書き0件になると見出しごと非表示になる");
  assert(db.items.filter((i) => i.status === "approved").length === 4 && db.items.filter((i) => i.status === "rejected").length === 1, "approved4件/rejected1件になった");
  const approvedSnapshot = db.items.filter((i) => i.status === "approved").map((i) => ({ id: i.id, question: i.question, status: i.status }));

  // ---- 3回目: 全て同義 → 件数不変・approvedはseenのみ・rejectedは復活も加算もなし ----
  const rejBefore = db.items.find((i) => i.status === "rejected").seen_count;
  await runExtract(/1疾患処理・0件追加・4件カウント更新/);
  assert(db.items.length === 5, "3回目: 項目数が増えない（合格条件）");
  assert(db.items.filter((i) => i.status === "draft").length === 0, "rejected が draft に復活しない");
  assert(db.items.find((i) => i.status === "rejected").seen_count === rejBefore, "rejected は seen_count も加算されない");
  for (const snap of approvedSnapshot) {
    const cur = db.items.find((i) => i.id === snap.id);
    assert(cur.status === "approved" && cur.question === snap.question, `approved項目の status/question が書き換わらない（${snap.question.slice(0, 12)}…）`);
  }
  assert(db.items.filter((i) => i.status === "approved").every((i) => i.seen_count === 3), "approved は seen_count のみ +1");

  // ---- 4回目: 新規1件（全消去テスト用） → 下書きを全消去 ----
  await runExtract(/1疾患処理・1件追加/);
  assert(db.items.filter((i) => i.status === "draft").length === 1, "4回目: 新規1件が draft で追加");
  await page.getByRole("button", { name: "🗑 下書きを全消去" }).click();
  await waitText(/下書き1件を削除しました/);
  assert(dialogs.some((d) => d.type === "confirm" && d.msg.includes("1件")), "全消去に件数明示の確認ダイアログが出る");
  assert(db.items.filter((i) => i.status === "draft").length === 0, "draft のみ削除された");
  assert(db.items.filter((i) => i.status === "approved").length === 4 && db.items.filter((i) => i.status === "rejected").length === 1, "全消去で approved/rejected は消えない");

  // ---- 閲覧タブ: 固定基本問診・visit_typeバッジ・初診/再診切替・印刷 ----
  await page.getByRole("button", { name: "👀 閲覧" }).click();
  await page.getByRole("button", { name: /尋常性ざ瘡/ }).click();
  await waitText("基本問診（全疾患共通・毎回確認）");
  await waitText("妊娠中・授乳中ですか");
  console.log("  ✓ 閲覧タブ: 固定基本問診セット（妊娠授乳含む4項目）が冒頭に出る");
  const allText = await page.locator("body").innerText();
  assert(allText.includes("初診") && allText.includes("再診"), "visit_type バッジが表示される");
  await page.getByRole("button", { name: "初診用", exact: true }).click();
  await page.waitForTimeout(300);
  const shodanText = await page.locator("body").innerText();
  assert(shodanText.includes("いつ頃から症状が出ていますか") && !shodanText.includes("処方されたお薬で刺激"), "初診用フィルタ: 初診+共通のみ表示（再診項目が消える）");
  await page.getByRole("button", { name: "すべて", exact: true }).click();
  const [popup] = await Promise.all([
    ctx.waitForEvent("page", { timeout: 10000 }),
    page.getByRole("button", { name: "🖨 印刷" }).click(),
  ]);
  await popup.waitForLoadState("domcontentloaded");
  const printText = await popup.locator("body").innerText();
  assert(printText.includes("基本問診（全疾患共通・毎回確認）") && printText.includes("妊娠中・授乳中"), "印刷にも固定基本問診セットが冒頭に入る");
  await popup.close();

  // ---- 承認済み一覧: 承認後の間違いを直す導線（却下・編集） ----
  await page.getByRole("button", { name: /✅ 承認（院長）/ }).click();
  await waitText(/✅ 承認済み（4件）/);
  console.log("  ✓ 承認タブに承認済み一覧（4件）が表示される");
  // 既定は疾患チップのみ（項目は畳まれ、DOMにレンダリングされない）
  assert((await page.getByText("汗をかいた後に悪化しますか？").count()) === 0, "承認済みは既定で畳まれ項目が描画されない");
  await page.getByRole("button", { name: /尋常性ざ瘡 \(4\)/ }).click();
  await page.getByText("汗をかいた後に悪化しますか？").first().waitFor({ timeout: 5000 });
  console.log("  ✓ 疾患チップのクリックで展開される");
  const promptsBefore = dialogs.filter((d) => d.type === "prompt").length;
  // 却下: 「汗をかいた後に悪化しますか？」を承認済みから外す
  const target = page.getByText("汗をかいた後に悪化しますか？");
  await target.first().waitFor();
  await target.first().locator("xpath=following::button[contains(.,'✗ 却下')][1]").click();
  await waitText("✗ 1件を却下しました");
  assert(db.items.filter((i) => i.status === "approved").length === 3 && db.items.filter((i) => i.status === "rejected").length === 2, "承認済みからの却下で approved3/rejected2 になった");
  // 編集: 承認済みのまま文面だけ直す
  await page.getByRole("button", { name: "✏ 編集", exact: true }).first().click();
  await page.locator("textarea").last().fill("いつ頃から症状がありますか？（承認後修正）");
  await page.getByRole("button", { name: "💾 保存（承認済みのまま）" }).click();
  await waitText("✓ 1件を承認しました");
  const edited = db.items.find((i) => i.question.includes("（承認後修正）"));
  assert(edited && edited.status === "approved", "承認済みの編集は question のみ更新され status=approved のまま");
  assert(dialogs.filter((d) => d.type === "prompt").length === promptsBefore, "承認済み一覧の操作も同じパスワードゲート（同セッションは再要求なし）");

  // ---- 却下済み一覧: 誤操作の回復導線（下書きに戻す） ----
  await waitText(/✗ 却下済み（2件）/);
  console.log("  ✓ 承認タブに却下済み一覧（2件）が表示される");
  await page.getByRole("button", { name: /尋常性ざ瘡 \(2\)/ }).click(); // 却下済みセクションのチップを展開
  const restoreTarget = page.getByText("汗をかいた後に悪化しますか？");
  await restoreTarget.first().waitFor();
  // 質問テキストのDOM直後に現れる「下書きに戻す」= 同一カード内のボタン（has:div方式は祖先全体にマッチし別項目を押す）
  await restoreTarget.first().locator("xpath=following::button[contains(.,'下書きに戻す')][1]").click();
  await waitText(/↩ 1件を下書きに戻しました/);
  const restored = db.items.find((i) => i.question === "汗をかいた後に悪化しますか？");
  assert(restored && restored.status === "draft", "却下済みからの復帰で status=draft に戻る");
  assert(db.items.filter((i) => i.status === "rejected").length === 1 && db.items.filter((i) => i.status === "approved").length === 3, "他の項目のstatusは不変（rejected1/approved3）");
  await waitText(/下書き 1件/);
  console.log("  ✓ 戻した項目が下書き一覧に現れる");
  assert(dialogs.filter((d) => d.type === "prompt").length === promptsBefore, "却下済み一覧の操作も同じパスワードゲート（再要求なし）");

  // ---- 折りたたみの再クリック＋検索（3セクション横断） ----
  await page.getByText("かゆみや痛みはありますか？").first().waitFor({ timeout: 5000 }); // 承認済みは前シナリオのチップ操作で展開済み
  await page.getByRole("button", { name: /尋常性ざ瘡 \(3\)/ }).click(); // 再クリックで畳む
  await page.waitForTimeout(300);
  assert((await page.getByText("かゆみや痛みはありますか？").count()) === 0, "チップ再クリックで折りたたまれ項目が消える");
  const searchBox = page.getByPlaceholder("🔍 疾患名・問診文で検索（下書き/承認済み/却下済みを横断）");
  await searchBox.fill("汗をかいた");
  await waitText("1件ヒット");
  await page.getByText("汗をかいた後に悪化しますか？").first().waitFor({ timeout: 5000 });
  console.log("  ✓ 検索でヒット件数表示＋該当疾患が自動展開されマッチ項目のみ表示");
  await searchBox.fill("いつ頃から");
  await waitText("1件ヒット"); // approved「いつ頃から症状が出ていますか？（承認後修正）」のみ
  assert((await page.getByText("（承認後修正）").count()) >= 1, "検索は承認済みセクションも横断する");
  await searchBox.fill("");
  await page.waitForTimeout(300);
  assert((await page.getByText("（承認後修正）").count()) === 0, "検索クリアで元の折りたたみ状態に戻る");

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
