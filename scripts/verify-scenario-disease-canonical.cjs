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

// エイリアス辞書の最終セット（正本は scripts/disease-aliases-data.cjs。登録は setup-disease-aliases.cjs）
const ALIAS_PROPOSAL = require("./disease-aliases-data.cjs").ALIASES;

// ========== Part1: 単体（v3: 部位5カテゴリ正規化・包括語括弧の例外・独立維持） ==========
async function part1() {
  console.log("── Part1: toCanonicalDisease 単体（実データの見出し・v3仕様）");
  const lib = await loadLib();
  const c = (h, a) => lib.toCanonicalDisease(h, a);

  // パーサ（原因1・2）
  assert(c("ニキビ（尋常性ざ瘡）　A）軽度、脱毛施術に支障なし") === "尋常性ざ瘡", "評価文(A）〜)を切り落とし括弧内を採る → 尋常性ざ瘡");
  assert(c("疾患名") === null && c("疾患名不明") === null && c("記載なし") === null, "プレースホルダ(疾患名/疾患名不明/記載なし)は疾患として扱わない");
  assert(c("記載なし# 皮膚炎") === "体部湿疹", "行内#再出現は後半を採り、裸の皮膚炎は体部湿疹へ");

  // 部位の5カテゴリ化
  for (const h of ["頭皮湿疹（頭部湿疹）", "頭部湿疹", "頭の湿疹（頭部湿疹）", "耳の湿疹（耳湿疹）", "頭部・耳の湿疹"]) {
    assert(c(h) === "頭部湿疹", `${h} → 頭部湿疹`);
  }
  for (const h of ["顔の湿疹（顔面湿疹）", "顔の皮膚炎（顔面湿疹）", "額部湿疹"]) {
    assert(c(h) === "顔面湿疹", `${h} → 顔面湿疹`);
  }
  assert(c("手荒れ（手湿疹）") === "手湿疹" && c("手湿疹") === "手湿疹", "手荒れ（手湿疹）/手湿疹 → 手湿疹");
  for (const h of ["体幹湿疹（体幹皮膚炎）", "背中の湿疹", "腕・首の湿疹（詳細不明の皮膚炎）", "足の湿疹（足部湿疹）"]) {
    assert(c(h) === "体部湿疹", `${h} → 体部湿疹`);
  }
  assert(c("お尻の痒み（臀部湿疹）") === "陰部・臀部湿疹", "お尻の痒み（臀部湿疹）→ 陰部・臀部湿疹");
  assert(c("殿部接触皮膚炎") === "接触性皮膚炎", "殿部接触皮膚炎 → 接触性皮膚炎（部位でなく病型に寄せる）");
  for (const h of ["湿疹", "湿疹（湿疹）", "湿疹（皮膚炎）", "皮膚炎", "皮膚炎（皮膚炎）", "湿疹・皮膚炎"]) {
    assert(c(h) === "体部湿疹", `${h} → 体部湿疹（裸の包括語）`);
  }

  // 独立を維持すべきもの（統合されないこと）
  for (const h of ["脂漏性皮膚炎", "脂漏性湿疹", "フケ症（脂漏性皮膚炎）", "頭皮湿疹（脂漏性皮膚炎）"]) {
    assert(c(h) === "脂漏性皮膚炎", `${h} → 脂漏性皮膚炎（頭部湿疹に吸収されない・院長決定）`);
  }
  for (const h of ["まぶたの湿疹（眼瞼皮膚炎）", "目元の湿疹（眼瞼皮膚炎）", "眼瞼湿疹"]) {
    assert(c(h) === "眼瞼皮膚炎", `${h} → 眼瞼皮膚炎（顔面湿疹に吸収されない）`);
  }
  for (const h of ["かぶれ（接触性皮膚炎）", "靴ズレ（接触性皮膚炎）", "カミソリ負け（接触性皮膚炎）"]) {
    assert(c(h) === "接触性皮膚炎", `${h} → 接触性皮膚炎`);
  }
  assert(c("乾燥肌の湿疹（皮脂欠乏性湿疹）") === "皮脂欠乏性湿疹", "乾燥肌の湿疹（皮脂欠乏性湿疹）→ 皮脂欠乏性湿疹");
  assert(c("汗疱（汗疱状湿疹）") === "汗疱" && c("異汗性湿疹（汗疱）") === "汗疱", "汗疱系は相互統合して汗疱へ");
  assert(c("アトピー（アトピー性皮膚炎）") === "アトピー性皮膚炎" && c("慢性湿疹") === "慢性湿疹", "アトピー性皮膚炎・慢性湿疹は独立");

  // 白癬系（絶対に統合・5カテゴリ化しないこと）
  const t1 = c("水虫（足白癬）"), t2 = c("水虫（爪白癬）"), t3 = c("いんきんたむし（股部白癬）");
  assert(t1 === "足白癬" && t2 === "爪白癬" && t3 === "股部白癬" && t1 !== t2 && t2 !== t3 && t1 !== t3, "足白癬/爪白癬/股部白癬 → 3つとも別キー（統合してはならない）");
  assert(c("爪水虫（爪白癬）") === c("水虫（爪白癬）"), "爪水虫（爪白癬）と水虫（爪白癬）→ 同一キー");
  assert(c("腋窩多汗症") === "腋窩多汗症", "部位が病名の一部の疾患（腋窩多汗症）は触らない");

  // 包括語の括弧（§2-C例外）
  assert(c("かゆみ（皮膚炎）") === "かゆみ", "かゆみ（皮膚炎）→ かゆみ（皮膚炎を主キーにしない）");
  assert(c("かゆみ（皮膚瘙痒症）") === "皮膚掻痒症", "かゆみ（皮膚瘙痒症）→ 皮膚掻痒症（具体病名は括弧内・字体ゆれ統一）");
  assert(c("ただれ（皮膚炎）") === "ただれ", "ただれ（皮膚炎）→ ただれ");

  // その他（別キーを維持）
  assert(c("シミ（肝斑）") !== c("シミ（色素沈着）"), "シミ（肝斑）とシミ（色素沈着）→ 別キー");
  assert(c("イボ（尋常性疣贅）") !== c("イボ（脂漏性角化症）"), "イボ（尋常性疣贅）とイボ（脂漏性角化症）→ 別キー");
  assert(c("湿疹（湿疹）") === "体部湿疹" && c("円形脱毛症（円形脱毛症）") === "円形脱毛症", "括弧重複の解消");
  assert(c("胼胝（たこ）") === "胼胝" && c("爪囲炎（そういえん）") === "爪囲炎" && c("男性型脱毛症（AGA）") === "男性型脱毛症", "「正式名（読み仮名/略号）」型は括弧外を採る");
  // エイリアス適用
  assert(c("タコ（胼胝腫）", ALIAS_PROPOSAL) === "胼胝", "エイリアス適用: 胼胝腫→胼胝");
  // ===== normalization-addendum §1: パーサ残骸 =====
  assert(c("S）") === null && c("カルテ要約") === null && c("記載不能") === null && c("詳細病名不明") === null, "S）/カルテ要約/記載不能/詳細病名不明 は疾患として扱わない");
  assert(c("O)") === null && c("P：") === null, "構造ガード: 2文字以下で）)：:を含む見出しは疾患として扱わない");
  assert(c("びらん（詳細不明）") === "びらん", "「不明」の完全一致除外が「びらん（詳細不明）」を誤爆しない");
  const pS = lib.parseDiseaseHeadings("# \nS）\nO）\nP）3日に1回、2ヶ月後再診");
  assert(pS.names.length === 0, "空見出し行「# 」の次行S）を見出しとして拾わない（regex根治）");
  // ===== normalization-addendum §2: 非疾患フラグ =====
  assert(lib.isNonDiseaseKey("医療脱毛") && lib.isNonDiseaseKey("緑内障") && lib.isNonDiseaseKey("かゆみ") && lib.isNonDiseaseKey("腋窩"), "非疾患リスト: 美容/皮膚科外/症状名のみが判定される");
  assert(!lib.isNonDiseaseKey("尋常性ざ瘡") && !lib.isNonDiseaseKey("体部湿疹"), "非疾患リスト: 疾患キーは判定されない");
  // ===== normalization-addendum §3: 追加エイリアス =====
  for (const h of ["足の匂い", "足の臭い", "足の細菌感染症", "足の細菌感染", "足部細菌感染症", "足部細菌性感染症", "足部雑菌臭", "足の皮膚感染症", "足の炎症", "細菌感染", "細菌感染の可能性"]) {
    assert(c(h, ALIAS_PROPOSAL) === "足部臭", `§3-A: ${h} → 足部臭`);
  }
  assert(c("ざ瘡", ALIAS_PROPOSAL) === "尋常性ざ瘡" && c("眼瞼炎", ALIAS_PROPOSAL) === "眼瞼皮膚炎" && c("脱頭髪症", ALIAS_PROPOSAL) === "脱毛症", "§3-B: ざ瘡/眼瞼炎/脱頭髪症の統合");
  assert(c("擦破傷", ALIAS_PROPOSAL) === "擦過傷" && c("皮膚擦過傷", ALIAS_PROPOSAL) === "擦過傷" && c("皮膚外傷", ALIAS_PROPOSAL) === "外傷", "§3-B: 擦過傷/外傷系の統合");
  assert(c("炎症性皮膚疾患", ALIAS_PROPOSAL) === "炎症性皮膚炎" && c("原発性局所多汗症", ALIAS_PROPOSAL) === "多汗症" && c("指先のびらん", ALIAS_PROPOSAL) === "びらん", "§3-B: 炎症性皮膚炎/多汗症/びらんの統合");
  // §3-C 統合しないもの（回帰）
  assert(c("マダニ（マダニ刺咬症）", ALIAS_PROPOSAL) === "マダニ刺咬症", "§3-C: マダニ刺咬症は虫刺症に統合しない");
  assert(c("いんきんたむし（股部白癬）", ALIAS_PROPOSAL) === "股部白癬", "§3-C: 股部白癬は他の白癬に寄せない");
  // §3-D 追加のエイリアス決定（normalization-correction・院長確定）
  assert(c("痒疹（結節性痒疹）", ALIAS_PROPOSAL) === "痒疹" && c("結節性痒疹", ALIAS_PROPOSAL) === "痒疹", "§3-D: 結節性痒疹→痒疹に統合（エイリアス）");
  assert(c("脱毛症") === "脱毛症" && c("脱毛症") !== c("薄毛（男性型脱毛症）") && c("脱毛症") !== c("円形脱毛症"), "§3-D: 脱毛症(詳細不明)は独立のまま（男性型・円形に寄せない）");
  assert(c("赤ら顔（酒さ様皮膚炎）") === "酒さ様皮膚炎" && c("赤ら顔（酒さ様皮膚炎）") !== c("赤ら顔（酒さ）"), "§3-D: 酒さ様皮膚炎は酒さに統合しない（別キー）");
  assert(c("じんましん（コリン性蕁麻疹）") === "コリン性蕁麻疹" && c("じんましん（コリン性蕁麻疹）") !== c("じんましん（蕁麻疹）"), "§3-D: コリン性蕁麻疹は蕁麻疹に統合しない（別キー）");
  // プロンプトルール（v3の6条）
  assert(lib.DISEASE_HEADING_PROMPT_RULES.includes("言い換えて併記しない") && lib.DISEASE_HEADING_PROMPT_RULES.includes("陰部・臀部湿疹") && lib.DISEASE_HEADING_PROMPT_RULES.includes("包括的な語"), "v3の見出し書式ルール（言い換え禁止・5部位・包括語括弧禁止）が定義されている");
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
  console.log(`  正規化後（エイリアス適用後）: ${canonAlias.size}種`);
  // 非疾患フラグ（抽出対象外・件数集計には残す）
  const nonDisease = [...canonAlias.entries()].filter(([k]) => lib.isNonDiseaseKey(k)).sort((a, b) => b[1] - a[1]);
  console.log(`  非疾患フラグ: ${nonDisease.length}種・計${nonDisease.reduce((s, [, n]) => s + n, 0)}件`);
  console.log(`    ${nonDisease.map(([k, n]) => `${k}(${n})`).join(" / ")}`);
  const top = [...canonAlias.entries()].filter(([k]) => !lib.isNonDiseaseKey(k)).sort((a, b) => b[1] - a[1]);
  console.log(`  抽出対象の疾患（非疾患除外後）: ${top.length}種`);
  const ge3 = top.filter(([, n]) => n >= 3);
  const cover = ge3.reduce((s, [, n]) => s + n, 0) / top.reduce((s, [, n]) => s + n, 0) * 100;
  console.log(`  最低出現3件以上: ${ge3.length}疾患（見出しベースのカバー率 ${cover.toFixed(1)}%）`);
  console.log(`  上位20: ${top.slice(0, 20).map(([k, n]) => `${k}(${n})`).join(" / ")}`);
  const cats = ["頭部湿疹", "顔面湿疹", "手湿疹", "体部湿疹", "陰部・臀部湿疹"];
  console.log(`  5部位カテゴリの件数: ${cats.map((k) => `${k}=${canonAlias.get(k) || 0}`).join(" / ")}`);
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
