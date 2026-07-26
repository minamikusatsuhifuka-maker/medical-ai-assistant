// 検証シナリオ: 疾患見出しの名寄せ（指示書 disease-heading-normalization）
// 実行: [PART=1|2|3] node scripts/verify-scenario-disease-canonical.cjs [BASE_URL]
//   BASE_URL 省略時は http://localhost:3100
// 3部構成:
//   Part1) toCanonicalDisease 単体（実データの見出しで、統合すべきものが寄り・統合してはならないものが分かれること）
//   Part2) 実データ効果測定（本番env・SELECTのみ）: 過去90日の全見出しにカノニカルキーを適用し、
//     正規化前→正規化後（エイリアス初期案の適用前/後の両方）の件数を出す
//   Part3) Playwright実ブラウザ（supabase REST/AI APIモック）: 名寄せ済み抽出・最低出現件数・統合UI・pageerrorゼロ
// dev 起動: Part3はダミーenv上書き。Part2は本番env（vercel env pull /tmp/maa-prod.env）を読み込んで実行。

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

async function loadLib() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "disease-canon-verify-"));
  fs.writeFileSync(path.join(dir, "package.json"), '{"type":"module"}');
  fs.copyFileSync(path.join(__dirname, "../app/lib/disease-canonical.js"), path.join(dir, "disease-canonical.js"));
  return import(pathToFileURL(path.join(dir, "disease-canonical.js")).href);
}

// エイリアス辞書の初期案（院長へ提示するもの。DBには適用しない。Part2の効果測定にのみ使用）
const ALIAS_PROPOSAL = {
  "胼胝腫": "胼胝", "たこ": "胼胝", "タコ": "胼胝",
  "ウオノメ": "鶏眼", "魚の目": "鶏眼",
  "水いぼ": "伝染性軟属腫", "水イボ": "伝染性軟属腫", "みずいぼ": "伝染性軟属腫",
  "虫咬傷": "虫刺症", "虫咬症": "虫刺症", "昆虫刺傷": "虫刺症", "虫さされ": "虫刺症",
  "AGA": "男性型脱毛症",
  "巻き爪": "陥入爪",
  "ひょう疽": "爪囲炎",
  "粉瘤": "表皮嚢腫",
  "とびひ": "伝染性膿痂疹", "飛び火": "伝染性膿痂疹",
  "ただれ": "びらん", "皮膚糜爛": "びらん",
  "汗疱状湿疹": "汗疱", "異汗性湿疹": "汗疱",
  "やけど": "熱傷", "火傷": "熱傷",
  "ヘルペス": "単純疱疹",
  "ホクロ": "色素性母斑", "ほくろ": "色素性母斑",
};

// ========== Part1: 単体 ==========
async function part1() {
  console.log("── Part1: toCanonicalDisease 単体（実データの見出し）");
  const lib = await loadLib();
  const c = (h, a) => lib.toCanonicalDisease(h, a);

  // 原因1: 評価文の混入
  assert(c("ニキビ（尋常性ざ瘡）　A）軽度、脱毛施術に支障なし") === "尋常性ざ瘡", "評価文(A）〜)を切り落とし括弧内を採る → 尋常性ざ瘡");
  assert(c("じんましん（蕁麻疹）　A）増悪傾向、内服追加") === "蕁麻疹", "半角/全角スペース+A）の混入も除去");
  assert(c("脇汗（腋窩多汗症）　A）外用薬で治療開始") === "腋窩多汗症", "別パターンの評価文混入も除去");
  // 原因2: プレースホルダ
  assert(c("疾患名") === null && c("疾患名不明") === null && c("記載なし") === null, "プレースホルダ(疾患名/疾患名不明/記載なし)は疾患として扱わない");
  assert(c("記載なし# 皮膚炎") === "皮膚炎", "行内に#が再出現する場合は後半を見出しとして採る");
  // 原因3: 括弧の重複・表記ゆれ
  assert(c("湿疹（湿疹）") === "湿疹" && c("湿疹") === "湿疹" && c("皮膚炎（皮膚炎）") === "皮膚炎", "括弧重複が解消される");
  assert(c("円形脱毛症（円形脱毛症）") === "円形脱毛症", "円形脱毛症（円形脱毛症）→円形脱毛症");
  assert(c("爪水虫（爪白癬）") === c("水虫（爪白癬）") && c("爪水虫（爪白癬）") === "爪白癬", "爪水虫（爪白癬）と水虫（爪白癬）→同一キー(爪白癬)");
  assert(c("水虫（足白癬）") !== c("水虫（爪白癬）"), "水虫（足白癬）と水虫（爪白癬）→別キー（統合してはならない）");
  assert(c("シミ（肝斑）") !== c("シミ（色素沈着）"), "シミ（肝斑）とシミ（色素沈着）→別キー（統合してはならない）");
  assert(c("イボ（尋常性疣贅）") !== c("イボ（脂漏性角化症）"), "イボ（尋常性疣贅）とイボ（脂漏性角化症）→別キー（統合してはならない）");
  assert(c("タコ（胼胝）") === "胼胝" && c("たこ（胼胝）") === "胼胝" && c("胼胝") === "胼胝", "タコ（胼胝）/たこ（胼胝）/胼胝→同一キー");
  assert(c("胼胝（たこ）") === "胼胝" && c("爪囲炎（そういえん）") === "爪囲炎", "「正式名（読み仮名）」型は括弧外を採る");
  assert(c("男性型脱毛症（AGA）") === "男性型脱毛症", "「正式名（略号）」型も括弧外を採る");
  assert(c("かゆみ（皮膚瘙痒症）") === c("かゆみ（皮膚掻痒症）"), "字体ゆれ(瘙痒↔掻痒)を統一");
  // 原因4: 部位違いの分割
  assert(c("顔の湿疹（顔面湿疹）") === "湿疹" && c("耳の湿疹（耳湿疹）") === "湿疹" && c("頭部湿疹") === "湿疹", "顔の湿疹/耳の湿疹/頭部湿疹→同一キー(湿疹)");
  assert(c("体幹湿疹（体幹皮膚炎）") === "皮膚炎", "体幹皮膚炎→皮膚炎（部位語除去）");
  assert(c("頭部・耳介湿疹") === "湿疹", "部位語の・連結（頭部・耳介湿疹）も除去");
  assert(c("湿疹（体幹）") === "湿疹" && c("湿疹（頭部・耳）") === "湿疹", "括弧内が部位のみの場合は括弧外を採る");
  assert(c("脂漏性皮膚炎") === "脂漏性皮膚炎", "脂漏性皮膚炎は部位語除去の対象にならずそのまま残る");
  assert(c("接触性皮膚炎") === "接触性皮膚炎" && c("アトピー性皮膚炎") === "アトピー性皮膚炎", "修飾語つき皮膚炎（接触性/アトピー性）は除去しない");
  assert(c("まぶたの湿疹（眼瞼皮膚炎）") === "眼瞼皮膚炎", "眼瞼皮膚炎は部位語リスト外＝独立のまま（院長判断枠）");
  assert(c("手荒れ（手湿疹）") === "手湿疹", "手湿疹は独立のまま（院長判断枠）");
  assert(c("水虫（足白癬）") === "足白癬" && c("白癬（足白癬）") === "足白癬", "足白癬→白癬のような除去はしない（部位で疾患が変わる）");
  // その他
  assert(c("湿疹（アレルギー性皮膚炎疑い）") === "アレルギー性皮膚炎", "「〜疑い」の言い回しを除去");
  assert(c("びらん（詳細不明）") === "びらん", "括弧内が「詳細不明」なら括弧外を採る");
  assert(c("あせも（汗疹）/ 湿疹（皮膚炎）") === "汗疹", "複合見出しは最初の疾患を採る");
  // エイリアス適用
  assert(c("タコ（胼胝腫）", ALIAS_PROPOSAL) === "胼胝", "エイリアス適用: 胼胝腫→胼胝");
  assert(c("汗疱（汗疱状湿疹）", ALIAS_PROPOSAL) === "汗疱", "エイリアス適用: 汗疱状湿疹→汗疱");
  // プロンプトルール定数
  assert(lib.DISEASE_HEADING_PROMPT_RULES.includes("疾患見出しの書式") && lib.DISEASE_HEADING_PROMPT_RULES.includes("部位は見出しに含めない"), "見出し書式ルールが定義されている");
  // parseDiseaseHeadings（未分類集計）
  const p = lib.parseDiseaseHeadings("# ニキビ（尋常性ざ瘡）　A）軽度\nS）...\n\n# 記載なし\nS）...");
  assert(p.names.length === 1 && p.names[0] === "尋常性ざ瘡" && p.unclassified === 1, "parseDiseaseHeadings: 正規化キー+未分類件数を返す");
  console.log("── Part1 OK\n");
}

// ========== Part2: 実データ効果測定（SELECTのみ） ==========
async function part2() {
  console.log("── Part2: 実データ効果測定（過去90日・SELECTのみ・DB書込なし）");
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPA_URL || !SUPA_KEY) throw new Error("本番envが必要です");
  const lib = await loadLib();

  const fromISO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const recs = [];
  for (let pg = 0; pg < 3; pg++) {
    const r = await fetch(`${SUPA_URL}/rest/v1/records?select=output_text&created_at=gte.${encodeURIComponent(fromISO)}&order=created_at.desc&limit=1000&offset=${pg * 1000}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    });
    if (!r.ok) throw new Error("records取得失敗: " + r.status);
    const d = await r.json();
    recs.push(...d);
    if (d.length < 1000) break;
  }
  const raw = new Set(), canon = new Map(), canonAlias = new Map();
  let unclassified = 0;
  for (const rec of recs) {
    for (const m of String(rec.output_text ?? "").matchAll(/^#\s+(.+?)\s*$/gm)) {
      raw.add(m[1].trim());
      const k1 = lib.toCanonicalDisease(m[1]);
      if (k1) canon.set(k1, (canon.get(k1) || 0) + 1); else unclassified++;
      const k2 = lib.toCanonicalDisease(m[1], ALIAS_PROPOSAL);
      if (k2) canonAlias.set(k2, (canonAlias.get(k2) || 0) + 1);
    }
  }
  console.log(`  対象記録: ${recs.length}件`);
  console.log(`  正規化前: ${raw.size}種`);
  console.log(`  正規化後（エイリアス適用前）: ${canon.size}種（未分類見出し ${unclassified}行）`);
  console.log(`  正規化後（エイリアス初期案適用後）: ${canonAlias.size}種`);
  const top = [...canonAlias.entries()].sort((a, b) => b[1] - a[1]);
  const ge3 = top.filter(([, n]) => n >= 3);
  const cover = ge3.reduce((s, [, n]) => s + n, 0) / top.reduce((s, [, n]) => s + n, 0) * 100;
  console.log(`  最低出現3件以上: ${ge3.length}疾患（見出しベースのカバー率 ${cover.toFixed(1)}%）`);
  console.log(`  上位20: ${top.slice(0, 20).map(([k, n]) => `${k}(${n})`).join(" / ")}`);
  assert(canon.size < raw.size, "正規化で見出し数が減っている");
  assert(canonAlias.size <= canon.size, "エイリアス適用でさらに減る（または同数）");
  console.log("── Part2 OK\n");
}

// ========== Part3: 実ブラウザ（モック） ==========
async function part3() {
  console.log("── Part3: 実ブラウザ（名寄せ済み抽出・最低出現件数・統合UI）");
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("dialog", async (d) => { if (d.type() === "prompt") await d.accept(DEL_PWD); else await d.accept(); });

  let idc = 0;
  const genId = (p) => `${p}-${String(++idc).padStart(3, "0")}`;
  const db = { topics: [], items: [], aliases: [] };
  const now = new Date().toISOString();
  // 表記ゆれ4種＋プレースホルダ1種。名寄せ後は「尋常性ざ瘡」1疾患×4記録になるはず
  const records = [
    { id: "r1", created_at: now, input_text: "いつからニキビ出てますか?", output_text: "# ニキビ（尋常性ざ瘡）\nS）再診" },
    { id: "r2", created_at: now, input_text: "洗顔は1日何回?", output_text: "# ニキビ（尋常性ざ瘡）　A）軽度、脱毛施術に支障なし\nS）新患" },
    { id: "r3", created_at: now, input_text: "かゆみは?", output_text: "# にきび（尋常性ざ瘡）\nS）再診" },
    { id: "r4", created_at: now, input_text: "市販薬は?", output_text: "# 尋常性ざ瘡\nS）再診" },
    { id: "r5", created_at: now, input_text: "経過は?", output_text: "# 疾患名\nS）記載不能" },
    { id: "r6", created_at: now, input_text: "様子は?", output_text: "# タコ（胼胝）\nS）再診" },
  ];
  await ctx.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const method = req.method();
    const accept = req.headers()["accept"] || "";
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const store = table === "intake_topics" ? db.topics : table === "intake_items" ? db.items : table === "disease_aliases" ? db.aliases : null;
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
      if (store) {
        if (method === "GET") return json(applyFilters(store));
        if (method === "POST") {
          const b = req.postDataJSON();
          const rows = (Array.isArray(b) ? b : [b]).map((r) => ({ id: genId(table), created_at: now, updated_at: now, ...r }));
          // upsert(on_conflict=alias)の簡易対応: 既存aliasは置き換え
          if (table === "disease_aliases") rows.forEach((r) => { const i = store.findIndex((x) => x.alias === r.alias); if (i >= 0) store.splice(i, 1); });
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
  await ctx.route("**/api/intake-extract", async (route) => {
    await new Promise((r) => setTimeout(r, 150));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ category: "発症・経過", question: "いつ頃から症状がありますか？", intent: "発症時期の確認" }], model: "mock" }) });
  });

  const clickUntil = async (btnLocator, markerLocator) => {
    for (let i = 0; i < 10; i++) {
      await btnLocator.first().click();
      try { await markerLocator.first().waitFor({ timeout: 1500 }); return; } catch {}
    }
    throw new Error("クリックが反映されません（hydration未完了？）");
  };
  const waitText = (t, timeout = 10000) => page.getByText(t, { exact: false }).first().waitFor({ state: "visible", timeout });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('textarea[placeholder*="録音ボタン"]').first().waitFor({ timeout: 20000 });
  await clickUntil(page.getByRole("button", { name: /⋯ その他/ }), page.getByRole("button", { name: /🩺 事前問診/ }));
  await page.getByRole("button", { name: /🩺 事前問診/ }).click();
  await page.getByRole("button", { name: /✅ 承認（院長）/ }).click();
  await waitText("最低出現件数:");
  console.log("  ✓ 抽出パネルに最低出現件数の指定がある");

  // 既定3件: ニキビ4記録は対象・胼胝1記録は対象外・プレースホルダは未分類
  await page.getByRole("button", { name: "📥 抽出を実行" }).click();
  await waitText(/1疾患処理・1件追加/);
  await waitText(/未分類見出し1件は対象外/);
  assert(db.topics.length === 1 && db.topics[0].name === "尋常性ざ瘡", "表記ゆれ4種（評価文混入含む）が「尋常性ざ瘡」1トピックに名寄せされた");
  assert(db.topics[0].record_count === 4, "4記録が1疾患に集約された（胼胝1件は最低出現3未満で対象外）");
  console.log("  ✓ 名寄せ済み抽出＋未分類の件数表示＋しきい値既定3");

  // 1（全件）に下げると胼胝も対象になる
  await page.getByRole("button", { name: "1（全件）" }).click();
  await page.getByRole("button", { name: "📥 抽出を実行" }).click();
  await waitText(/2疾患処理/);
  assert(db.topics.some((t) => t.name === "胼胝"), "最低出現件数を1に下げると全件が対象になる（タコ（胼胝）→胼胝）");
  console.log("  ✓ しきい値1で全件対象");

  // 統合UI: 胼胝 → 尋常性ざ瘡 に統合（操作確認目的）
  await waitText("🔗 疾患の統合・エイリアス辞書");
  await page.locator("select").first().selectOption({ label: "胼胝" });
  await page.locator("select").nth(1).selectOption({ label: "尋常性ざ瘡" });
  await page.getByRole("button", { name: "🔗 統合" }).click();
  await waitText(/「胼胝」を「尋常性ざ瘡」に統合しました/);
  assert(db.topics.length === 1 && db.items.every((i) => i.topic_id === db.topics[0].id), "統合でitemsが付け替えられ統合元topicが消えた");
  assert(db.aliases.some((a) => a.alias === "胼胝" && a.canonical === "尋常性ざ瘡"), "統合元の名前が自動でエイリアス登録された");
  console.log("  ✓ 統合UI: items付け替え+自動エイリアス登録+topic削除");

  // エイリアス手動追加・削除
  await page.getByPlaceholder("寄せる見出し（例: 胼胝腫）").fill("胼胝腫");
  await page.getByPlaceholder("統合先（例: 胼胝）").fill("胼胝");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await waitText(/エイリアス「胼胝腫 → 胼胝」を登録しました/);
  assert(db.aliases.some((a) => a.alias === "胼胝腫"), "エイリアスの手動追加ができる");
  await page.getByRole("button", { name: "✕", exact: true }).first().click();
  await page.waitForTimeout(500);
  assert(db.aliases.length === 1, "エイリアスの削除ができる");
  console.log("  ✓ エイリアス辞書の追加・削除");

  assert(pageErrors.length === 0, "pageerror ゼロ" + (pageErrors.length ? ": " + pageErrors.join(" | ") : ""));
  await browser.close();
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
