"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./lib/supabase";
import { saveTranscriptSession, deleteTranscriptSession, getRecoverableSessions, genSessionId } from "./lib/transcript-autosave";
import dynamic from "next/dynamic";

// === カウンセリング評価レーダーチャート（SSR無効でロード） ===
const CS_SCORE_ITEMS = ["傾聴力","共感力","質問の質","ニーズ把握","説明力","信頼関係構築","提案力","クロージング"];
const ScoreRadar = dynamic(()=>import("./ScoreRadar"),{ssr:false,loading:()=><div style={{width:"100%",height:320,display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",fontSize:12,background:"#faf9ff",borderRadius:12,border:"1px solid #e9e6ff"}}>📊 チャート読み込み中...</div>});
const UsageBarChart = dynamic(()=>import("./UsageBarChart"),{ssr:false,loading:()=><div style={{width:"100%",height:220,display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",fontSize:12}}>📈 グラフ読み込み中...</div>});
const UsageDailyChart = dynamic(()=>import("./UsageDailyChart"),{ssr:false,loading:()=><div style={{width:"100%",height:220,display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",fontSize:12}}>📅 グラフ読み込み中...</div>});

// === スコアパース（ロバスト版・別名対応） ===
const CS_SCORE_ALIASES = {
  "傾聴力": ["傾聴力", "傾聴度", "傾聴スキル", "傾聴"],
  "共感力": ["共感力", "共感度", "共感スキル", "共感"],
  "質問の質": ["質問の質", "質問力", "質問スキル", "質問"],
  "ニーズ把握": ["ニーズ把握", "ニーズ理解", "ニーズの把握", "ニーズ"],
  "説明力": ["説明力", "説明度", "説明スキル", "説明"],
  "信頼関係構築": ["信頼関係構築", "信頼関係", "信頼構築", "信頼"],
  "提案力": ["提案力", "提案度", "提案スキル", "提案"],
  "クロージング": ["クロージング力", "クロージング度", "クロージングスキル", "クロージング"],
};
const parseCsScores = (text) => {
  const scores = {};
  if (!text) return scores;

  // 1) ```json ... ``` ブロックがあれば優先パース
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*({[\s\S]*?})\s*```/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[1].trim().replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
      CS_SCORE_ITEMS.forEach(item => {
        for (const alias of (CS_SCORE_ALIASES[item] || [item])) {
          const v = obj[alias];
          if (typeof v === "number" && !isNaN(v) && v > 0) { scores[item] = Math.min(10, Math.max(0, v)); break; }
          if (typeof v === "string") { const n = parseFloat(v); if (!isNaN(n) && n > 0) { scores[item] = Math.min(10, Math.max(0, n)); break; } }
        }
      });
      if (Object.keys(scores).length >= 6) return scores;
    } catch {}
  }

  // 2) マークダウン本文から「項目名 ... : 数値」を抽出（太字・括弧書き・記号・別名に強い）
  const cleaned = text.replace(/\*\*/g, "").replace(/[【】「」『』]/g, "");
  CS_SCORE_ITEMS.forEach(item => {
    if (scores[item]) return;
    // 別名は長いものから順に試行（クロージング力 > クロージング のように部分一致誤検出を防ぐ）
    const aliases = (CS_SCORE_ALIASES[item] || [item]).slice().sort((a,b)=>b.length-a.length);
    for (const alias of aliases) {
      const esc = alias.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const re = new RegExp(esc + "[^:：\\d\\n]{0,30}[:：]\\s*(\\d+(?:\\.\\d+)?)\\s*(?:/\\s*10|点)?");
      const m = cleaned.match(re);
      if (m) {
        const n = parseFloat(m[1]);
        if (!isNaN(n) && n > 0) { scores[item] = Math.min(10, Math.max(0, n)); break; }
      }
    }
  });

  return scores;
};

// === RESPONSIVE HOOK ===
function useResponsive(){
const[w,setW]=useState(1024);
useEffect(()=>{setW(window.innerWidth);const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h)},[]);
return{isMobile:w<640,isTablet:w>=640&&w<1024,w};
}

// === COLOR THEMES ===
const THEMES = {
  "pearl": {
    name: "🌿 Pearl Breeze（現行）",
    bg: "linear-gradient(135deg, #e8f8e0, #d8f4a8)",
    headerBg: "linear-gradient(135deg, rgba(200,240,160,0.6), rgba(220,248,180,0.5), rgba(240,252,200,0.45))",
    cardBg: "rgba(255,255,255,0.7)",
    cardBorder: "rgba(160,220,100,0.2)",
    p: "#5a9040", pD: "#3a6820", pDD: "#2a5018",
    pL: "rgba(160,220,100,0.25)", pLL: "rgba(200,240,160,0.15)",
    g50: "rgba(255,255,255,0.5)", g100: "rgba(240,252,228,0.6)", g200: "rgba(160,220,100,0.2)", g400: "#a8a29e", g500: "#5a8838",
    btnRecBg: "linear-gradient(135deg, rgba(140,210,80,0.8), rgba(180,230,100,0.75), rgba(200,240,120,0.7))",
    btnRecColor: "#1a3a10",
    bodyBg: "linear-gradient(135deg, #e8f8e0, #d8f4a8)",
    swatch: "#a8d878",
  },
  "ultra-cream": {
    name: "🤍 Ultra Cream",
    bg: "#fffefc",
    headerBg: "rgba(255,254,252,0.9)",
    cardBg: "#fffef9",
    cardBorder: "#eee8da",
    p: "#b8a888", pD: "#8a7c68", pDD: "#6a6050",
    pL: "rgba(216,200,168,0.3)", pLL: "rgba(245,240,229,0.4)",
    g50: "#fffef9", g100: "#f5f0e5", g200: "#ece4d4", g400: "#c8b898", g500: "#a89878",
    btnRecBg: "#b8a888",
    btnRecColor: "#fffefc",
    bodyBg: "#fffefc",
    swatch: "#d8c8a8",
  },
  "soft-linen": {
    name: "✨ Soft Linen",
    bg: "#fefdf8",
    headerBg: "rgba(254,253,248,0.9)",
    cardBg: "#fefcf6",
    cardBorder: "#ede6d8",
    p: "#a89878", pD: "#826e54", pDD: "#584840",
    pL: "rgba(200,184,152,0.3)", pLL: "rgba(240,232,216,0.4)",
    g50: "#fefcf6", g100: "#f0e8d8", g200: "#e8dece", g400: "#c8b898", g500: "#a89878",
    btnRecBg: "linear-gradient(135deg, #c8b898, #a89878)",
    btnRecColor: "#fefdf8",
    bodyBg: "#fefdf8",
    swatch: "#c8b898",
  },
  "morning-cream": {
    name: "🌱 Morning Cream",
    bg: "#fffefc",
    headerBg: "rgba(255,254,252,0.9)",
    cardBg: "#fefdf8",
    cardBorder: "#e5e0d0",
    p: "#78a860", pD: "#589040", pDD: "#3a6828",
    pL: "rgba(152,192,128,0.3)", pLL: "rgba(242,248,238,0.4)",
    g50: "#fefdf8", g100: "#f2f8ee", g200: "#d8ecd0", g400: "#98c080", g500: "#78a860",
    btnRecBg: "linear-gradient(135deg, #98c080, #78a860)",
    btnRecColor: "#fffefc",
    bodyBg: "#fffefc",
    swatch: "#98c080",
  },
  "dark": {
    name: "🌙 ダークモード",
    bg: "#0f172a",
    headerBg: "rgba(30,41,59,0.95)",
    cardBg: "#1e293b",
    cardBorder: "#334155",
    p: "#4ade80", pD: "#86efac", pDD: "#bbf7d0",
    pL: "#16a34a", pLL: "#14532d",
    g50: "#0f172a", g100: "#1e293b", g200: "#334155", g400: "#94a3b8", g500: "#cbd5e1",
    btnRecBg: "linear-gradient(135deg, #16a34a, #4ade80)",
    btnRecColor: "#0f172a",
    bodyBg: "#0f172a",
    swatch: "#1e293b",
    w: "#1e293b",
    g300: "#475569", g600: "#e2e8f0", g700: "#f1f5f9", g800: "#f8fafc", g900: "#ffffff",
    rG: "#4ade80", warn: "#fbbf24", err: "#f87171",
  },
  "dark-teal": {
    name: "🌊 ダーク青緑",
    bg: "#0f2027",
    headerBg: "rgba(26,47,58,0.95)",
    cardBg: "#1a2f3a",
    cardBorder: "#234455",
    p: "#2dd4bf", pD: "#5eead4", pDD: "#99f6e4",
    pL: "#0d9488", pLL: "#0f3d38",
    g50: "#0f2027", g100: "#1a2f3a", g200: "#234455", g400: "#7ecce0", g500: "#a5dde8",
    btnRecBg: "linear-gradient(135deg, #0d9488, #2dd4bf)",
    btnRecColor: "#0f2027",
    bodyBg: "#0f2027",
    swatch: "#0f2027",
    w: "#1a2f3a",
    g300: "#2d5a6e", g600: "#cceef5", g700: "#e6f7fb", g800: "#f0fbff", g900: "#ffffff",
    rG: "#2dd4bf", warn: "#fbbf24", err: "#f87171",
  },
};
const _defaultC={p:"#5a9040",pD:"#3a6820",pDD:"#2a5018",pL:"rgba(160,220,100,0.25)",pLL:"rgba(200,240,160,0.15)",w:"rgba(255,255,255,0.7)",g50:"rgba(255,255,255,0.5)",g100:"rgba(240,252,228,0.6)",g200:"rgba(160,220,100,0.2)",g300:"#d6d3d1",g400:"#a8a29e",g500:"#5a8838",g600:"#57534e",g700:"#44403c",g800:"#292524",g900:"#1c1917",err:"#f43f5e",warn:"#f59e0b",rG:"#5a9040",pLL2:"rgba(200,240,160,0.15)"};
let C=_defaultC;

const exportToExcel=async(tasks,todos,minHist,title)=>{
const XLSX=await import("xlsx");
const wb=XLSX.utils.book_new();
const quadrants=[
{name:"緊急×重要",filter:t=>t.urgency>=3&&t.importance>=3},
{name:"非緊急×重要",filter:t=>t.urgency<3&&t.importance>=3},
{name:"緊急×非重要",filter:t=>t.urgency>=3&&t.importance<3},
{name:"非緊急×非重要",filter:t=>t.urgency<3&&t.importance<3}
];
const roleLabels={director:"院長",manager:"マネジャー",leader:"リーダー",staff:"スタッフ"};
const catLabels={operations:"運営",medical:"医療",hr:"人事",finance:"経理"};
const allData=[];
quadrants.forEach((q,qi)=>{
if(qi>0)allData.push({象限:"",タスク:"",役職:"",カテゴリ:"",担当:"",期限:"",完了:"",TODO数:"",TODO完了:"",議事録日:""});
const filtered=tasks.filter(q.filter);
filtered.forEach(t=>{
const taskTodos=todos.filter(td=>td.task_id===t.id);
const m=minHist.find(h=>h.id===t.minute_id);
allData.push({象限:q.name,タスク:t.title,役職:roleLabels[t.role_level]||"スタッフ",カテゴリ:catLabels[t.category]||t.category,担当:t.assignee||"未定",期限:t.due_date||"未定",完了:t.done?"✓":"",TODO数:taskTodos.length,TODO完了:taskTodos.filter(td=>td.done).length,議事録日:m?new Date(m.created_at).toLocaleDateString("ja-JP"):""});
if(taskTodos.length>0){taskTodos.forEach(td=>{allData.push({象限:"",タスク:"  → "+td.title,役職:"",カテゴリ:"",担当:td.assignee||"",期限:td.due_date||"",完了:td.done?"✓":"",TODO数:"",TODO完了:"",議事録日:""})})}
})});
const ws=XLSX.utils.json_to_sheet(allData);
ws["!cols"]=[{wch:14},{wch:40},{wch:12},{wch:8},{wch:10},{wch:12},{wch:4},{wch:6},{wch:6},{wch:12}];
XLSX.utils.book_append_sheet(wb,ws,"四象限マトリクス");
quadrants.forEach(q=>{
const filtered=tasks.filter(q.filter);
if(filtered.length>0){
const data=filtered.map(t=>({タスク:t.title,役職:roleLabels[t.role_level]||"スタッフ",カテゴリ:catLabels[t.category]||t.category,担当:t.assignee||"未定",期限:t.due_date||"未定",完了:t.done?"✓":""}));
const s=XLSX.utils.json_to_sheet(data);
s["!cols"]=[{wch:40},{wch:12},{wch:8},{wch:10},{wch:12},{wch:4}];
XLSX.utils.book_append_sheet(wb,s,q.name);
}});
XLSX.writeFile(wb,(title||"四象限マトリクス")+".xlsx");
};

const exportToPDF=async(tasks,todos,minHist,title)=>{
const roleLabels={director:"院長",manager:"マネジャー",leader:"リーダー",staff:"スタッフ"};
const catLabels={operations:"運営",medical:"医療",hr:"人事",finance:"経理"};
const quadrants=[
{name:"緊急×重要",filter:t=>t.urgency>=3&&t.importance>=3,color:"#fecaca",emoji:"🔴"},
{name:"非緊急×重要",filter:t=>t.urgency<3&&t.importance>=3,color:"#fef08a",emoji:"🟡"},
{name:"緊急×非重要",filter:t=>t.urgency>=3&&t.importance<3,color:"#fed7aa",emoji:"🟠"},
{name:"非緊急×非重要",filter:t=>t.urgency<3&&t.importance<3,color:"#bbf7d0",emoji:"🟢"}
];
let html='<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:10mm}body{font-family:"Hiragino Sans","Yu Gothic",sans-serif;padding:10px;font-size:11px}h1{color:#3f6212;font-size:18px;margin-bottom:4px}h2{font-size:14px;padding:4px 8px;border-radius:6px;margin:12px 0 6px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid #d6d3d1;padding:4px 6px;text-align:left;font-size:10px}th{background:#f7fee7;color:#3f6212;font-weight:bold}.done{text-decoration:line-through;color:#a8a29e}.todo-row td{padding-left:20px;font-size:9px;color:#57534e;background:#fafaf9}</style></head><body>';
html+='<h1>'+(title||'四象限マトリクス')+'</h1>';
html+='<p style="color:#78716c;font-size:10px">'+new Date().toLocaleDateString("ja-JP")+' 作成</p>';
html+='<div class="grid">';
quadrants.forEach(q=>{
const filtered=tasks.filter(q.filter);
html+='<div><h2 style="background:'+q.color+'">'+q.emoji+' '+q.name+' ('+filtered.length+'件)</h2>';
if(filtered.length>0){
html+='<table><tr><th>タスク</th><th>役職</th><th>担当</th><th>期限</th><th>状態</th></tr>';
filtered.forEach(t=>{
const cls=t.done?' class="done"':'';
html+='<tr'+cls+'><td>'+t.title+'</td><td>'+(roleLabels[t.role_level]||'スタッフ')+'</td><td>'+(t.assignee||'未定')+'</td><td>'+(t.due_date||'未定')+'</td><td>'+(t.done?'完了':'未完了')+'</td></tr>';
const taskTodos=todos.filter(td=>td.task_id===t.id);
taskTodos.forEach(td=>{
html+='<tr class="todo-row"><td colspan="3">'+(td.done?'✓ ':'☐ ')+td.title+'</td><td>'+(td.due_date||'')+'</td><td>'+(td.done?'完了':'')+'</td></tr>';
})});
html+='</table>';
}else{html+='<p style="color:#a8a29e;font-size:10px">タスクなし</p>'}
html+='</div>';
});
html+='</div></body></html>';
const printWin=window.open('','_blank','width=1100,height=800');
printWin.document.write(html);
printWin.document.close();
setTimeout(()=>{printWin.print()},500);
};

const exportToWord=async(tasks,todos,minHist,title)=>{
const roleLabels={director:"院長",manager:"マネジャー",leader:"リーダー",staff:"スタッフ"};
const catLabels={operations:"運営",medical:"医療",hr:"人事",finance:"経理"};
const quadrants=[
{name:"🔴 緊急×重要",filter:t=>t.urgency>=3&&t.importance>=3,color:"#fecaca"},
{name:"🟡 非緊急×重要",filter:t=>t.urgency<3&&t.importance>=3,color:"#fef08a"},
{name:"🟠 緊急×非重要",filter:t=>t.urgency>=3&&t.importance<3,color:"#fed7aa"},
{name:"🟢 非緊急×非重要",filter:t=>t.urgency<3&&t.importance<3,color:"#bbf7d0"}
];
let html='<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:20px}h1{color:#3f6212}h2{color:#3f6212;padding:6px 12px;border-radius:6px;margin:8px 0 6px}table{border-collapse:collapse;width:100%;margin-bottom:12px}th,td{border:1px solid #e7e5e4;padding:6px 10px;font-size:12px;text-align:left}th{background:#f7fee7;font-weight:bold;color:#3f6212}.done{text-decoration:line-through;color:#a8a29e}.todo{color:#57534e;padding-left:20px;font-size:11px}</style></head><body>';
html+="<h1>"+(title||"四象限マトリクス")+"</h1>";
html+="<p>"+new Date().toLocaleDateString("ja-JP")+" 作成</p>";
html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
quadrants.forEach(q=>{
const filtered=tasks.filter(q.filter);
html+='<div>';
html+='<h2 style="background:'+q.color+'">'+q.name+" ("+filtered.length+"件)</h2>";
if(filtered.length>0){
html+="<table><tr><th>タスク</th><th>役職</th><th>カテゴリ</th><th>担当</th><th>期限</th><th>状態</th></tr>";
filtered.forEach(t=>{
const cls=t.done?' class="done"':"";
html+="<tr"+cls+"><td>"+t.title+"</td><td>"+(roleLabels[t.role_level]||"スタッフ")+"</td><td>"+(catLabels[t.category]||t.category)+"</td><td>"+(t.assignee||"未定")+"</td><td>"+(t.due_date||"未定")+"</td><td>"+(t.done?"✓完了":"未完了")+"</td></tr>";
const taskTodos=todos.filter(td=>td.task_id===t.id);
taskTodos.forEach(td=>{
html+='<tr class="todo"><td colspan="4" style="padding-left:30px">'+(td.done?"✓ ":"☐ ")+td.title+"</td><td>"+(td.assignee||"")+"</td><td>"+(td.due_date||"")+"</td></tr>";
})});
html+="</table>";
}else{html+='<p style="color:#a8a29e;font-size:11px">タスクなし</p>'}
html+='</div>';
});
html+="</div></body></html>";
const blob=new Blob([html],{type:"application/msword;charset=utf-8"});
const url=URL.createObjectURL(blob);
const a=document.createElement("a");
a.href=url;
a.download=(title||"四象限マトリクス")+".doc";
a.click();
URL.revokeObjectURL(url);
};

// === トップメニュー定義（表示/非表示のカスタマイズ対象。動作はmenuActionsで付与） ===
const TOP_MENU=[{p:"hist",i:"📂",t:"履歴"},{p:"settings",i:"⚙️",t:"設定"},{p:"doc",i:"📄",t:"資料作成"},{p:"minutes",i:"📝",t:"議事録",mh:"tabs_minutes"},{p:"seminar",i:"🎓",t:"セミナー学習",mh:"tabs_seminar"},{p:"counsel",i:"🧠",t:"分析",mh:"tabs_analysis"},{p:"summary_lab",i:"📝",t:"要約ラボ",mh:"tabs_summary_lab"},{p:"caselib",i:"📚",t:"症例ライブラリ",mh:"tabs_caselibrary"},{p:"roleplay",i:"🎭",t:"ロールプレイ",mh:"tabs_roleplay"},{p:"sns",i:"📣",t:"SNS",mh:"tabs_sns"},{p:"satisfaction",i:"📊",t:"満足度分析"},{p:"shortcuts",i:"⌨️",t:"ショートカット"},{p:"tasks",i:"✅",t:"タスク",mh:"tabs_tasks"},{p:"knowledge",i:"📚",t:"育成・知識",mh:"tabs_knowledge"},{p:"help",i:"❓",t:"ヘルプ"},{p:"manual",i:"📖",t:"マニュアル"}];
// 未設定時の既定表示（設定は常時表示のため必ず含める）。院長が設定画面で自由に変更可
const DEFAULT_TOP_MENU_VISIBLE=["hist","settings","minutes","tasks"];

// === TEMPLATES ===
const DEFAULT_VISIBLE_TPLS=["soap-std","soap-min","counseling-std"];
const T=[
{id:"soap",name:"📋 詳細",prompt:`あなたは皮膚科専門の医療秘書です。以下の書き起こしテキストをカルテ形式で要約してください。

【話者分離ルール】
- 「です」「ます」「ください」等の丁寧語・指示語は医師/医療従事者の発言と判断
- 「痛い」「かゆい」「気になる」「〜してほしい」等の訴え・希望は患者の発言と判断
- 「塗ってください」「飲んでください」は医師の指示
- 「塗っています」「飲んでいます」は患者の報告
- 診断名・処方の決定は医師、症状の訴えは患者として分離

【複数疾患への対応】
- 会話中に複数の疾患・症状が話題になった場合、疾患ごとに「# 疾患名 A）/S）/O）/P）/患者情報）」をまとめる
- 各疾患ブロックを --- で区切る

【A）評価のルール】
- A）は医師の評価・治療方針判断・重症度・経過判断を記載
- 1〜3行程度の簡潔な記載（重症度 + 治療方針判断）
- 例: 「軽症、外用継続で改善見込み」「中等症、生物学的製剤導入を検討」「慢性化、長期管理が必要」

【# 疾患名の記載ルール】
- # の後には「平易な表現（正式な医学用語）」の形式で記載する
- 例: # 水虫（足白癬）、# ニキビ（尋常性ざ瘡）、# イボ（尋常性疣贅）
- 医師が病名を明言した場合はその病名を優先
- 明言がない場合は主訴と所見から推定
- 変換表: 水虫（足白癬）、爪水虫（爪白癬）、たむし（体部白癬）、しらくも（頭部白癬）、ニキビ（尋常性ざ瘡）、イボ（尋常性疣贅）、アトピー（アトピー性皮膚炎）、かぶれ（接触性皮膚炎）、脂漏性湿疹（脂漏性皮膚炎）、乾燥肌の湿疹（皮脂欠乏性湿疹）、手荒れ（手湿疹）、汗の湿疹（汗疱）、じんましん（蕁麻疹）、薬のアレルギー（薬疹）、ヘルペス（単純疱疹）、帯状ヘルペス（帯状疱疹）、とびひ（伝染性膿痂疹）、水いぼ（伝染性軟属腫）、あせも（汗疹）、しもやけ（凍瘡）、シミ（肝斑）、老人性シミ（日光黒子）、老人性イボ（脂漏性角化症）、ホクロ（色素性母斑）、タコ（胼胝）、ウオノメ（鶏眼）、やけど（熱傷）、床ずれ（褥瘡）、赤ら顔（酒さ）、かゆみ（皮膚掻痒症）、円形ハゲ（円形脱毛症）、薄毛（男性型脱毛症）、白斑（尋常性白斑）、粉瘤（表皮嚢腫）、おでき（せつ）
- 専門用語が一般的にもわかりやすい場合はそのまま使用: 乾癬（尋常性乾癬）、掌蹠膿疱症、ケロイド、蜂窩織炎、多形紅斑、光線過敏症、扁平苔癬、疥癬
- 該当がない場合は会話中の表現をそのまま使用

【出力フォーマット（厳守）】
# 疾患名
S）主訴内容
O）所見内容
A）評価・治療方針
P）計画内容
患者情報）背景やイベント情報

【複数疾患の場合の例】
# かぶれ（接触性皮膚炎）
S）両前腕の痒み
O）紅斑性丘疹を散在性に認める
A）軽症、外用で1週間経過観察
P）リンデロン-VG軟膏 1日2回
---
# 水虫（足白癬）
S）足指の間がジュクジュクする
O）第3-4趾間に浸軟・鱗屑
A）慢性化、外用継続必要
P）ルリコン液 1日1回

【フォーマットの厳密なルール】
- 1行目は「# 疾患名」のみ。次の行から S）を記載する（病名と同じ行に並べない）
- 順番は必ず S）→ O）→ A）→ P）（標準SOAP順）。A）評価・診断は O）と P）の間に置く
- S）O）A）P）患者情報）の直後に内容を続ける（改行しない）
- 各行の間に空行を入れない
- イベント情報（結婚式・旅行等）は患者情報）に記載
- 会話にない情報は推測しない
- 会話に含まれない項目は出力しない（「言及なし」と書かない）
- コンパクトに詰めて記載`},
{id:"soap-std",name:"📋 標準",prompt:`皮膚科の医療秘書として簡潔にカルテ要約。話者分離：丁寧語は医師、訴えは患者。

【ルール】
- 冗長な表現は避け、要点のみ記載
- 修飾語は最小限にする
- 薬剤は名称と用法のみ（「〜軟膏を塗布するよう指示」→「〜軟膏 1日2回」）
- 所見は箇条書き的に短く
- 複数疾患は --- で区切る
- 会話にない情報は推測しない
- 会話に含まれない項目は出力しない（「言及なし」「詳細不明」「記載なし」等は絶対に書かない）
- 用法が不明な薬剤は薬剤名のみ記載（「用法不明」とは書かない）
- A）は評価・治療方針判断を簡潔に（例: 軽症で経過観察 / 増悪傾向 / コントロール良好 など）
- # の後は「平易な表現（医学用語）」形式で記載（例: 水虫（足白癬）、ニキビ（尋常性ざ瘡）、イボ（尋常性疣贅）、かぶれ（接触性皮膚炎）、じんましん（蕁麻疹）、ヘルペス（単純疱疹）、とびひ（伝染性膿痂疹）、あせも（汗疹）、シミ（肝斑）、ホクロ（色素性母斑）、アトピー（アトピー性皮膚炎）、手荒れ（手湿疹）、乾燥肌の湿疹（皮脂欠乏性湿疹）、粉瘤（表皮嚢腫）、赤ら顔（酒さ））
- 医師が病名を言った場合はそれを優先、なければ所見から推定
- 患者情報）には直近のイベント・希望・ライフイベント・趣味嗜好など生活背景を記載。情報がない場合は患者情報）行ごと省略する

【出力フォーマット（厳守）】
# 疾患名
S）主訴（1文）
O）所見（簡潔に）
A）評価・治療方針
P）処方・指示
患者情報）生活背景・イベント・希望（情報がある場合のみ記載）
※ 病名は1行目に「# 疾患名」のみ。次の行から S）を置き、病名と同じ行に並べない。順番は S）→ O）→ A）→ P）。

【例】
# アトピー（アトピー性皮膚炎）
S）手足の痒み、夜間増悪
O）四肢に紅斑・丘疹、顔面に赤み
A）軽症〜中等症、外用継続で経過観察
P）ステロイド外用 1日2回、2週後再診
患者情報）来月結婚式あり、それまでに改善希望
---
# イボ（尋常性疣贅）
S）手の疣贅
O）手背に多発
A）多発性、冷凍凝固で治療開始
P）冷凍凝固療法`},
{id:"soap-min",name:"📋 簡潔",prompt:`皮膚科の医療秘書として最小限にカルテ要約。

【ルール】
- 1疾患あたり最大4行で完結
- 修飾語・詳細な説明は全て省く
- A）は重症度や治療方針判断を1〜2語で簡潔に（例: 軽症 / 慢性化 / 経過良好 / 増悪）
- 薬剤名と用法のみ
- 複数疾患は --- で区切る
- 推測しない
- # の後は「平易な表現（医学用語）」形式（例: 水虫（足白癬）、ニキビ（尋常性ざ瘡）等）

【出力フォーマット（厳守）】
# 疾患名
S）一言
O）一言
A）評価
P）処方名のみ
※ 病名は1行目に「# 疾患名」のみ。次の行から S）を置き、同じ行に並べない。順番は S）→ O）→ A）→ P）。

【例】
# かぶれ（接触性皮膚炎）
S）両前腕の痒み
O）紅斑性丘疹
A）軽症
P）リンデロン-VG 1日2回`},
{id:"disease",name:"🏥 疾患名",prompt:`皮膚科専門の医療秘書として疾患情報を抽出。話者分離：丁寧語・指示語は医師、訴え・希望は患者。

【出力フォーマット（厳守）】
■ 疾患名（正式医学用語。複数あれば改行で列挙）
■ 部位
■ 重症度・範囲
■ 既往歴
■ 鑑別診断（医師が言及した場合のみ）

俗称は正式名称に変換（水虫→足白癬、ニキビ→ざ瘡）。推測しない。コンパクトに。`},
{id:"cosmetic",name:"✨ 美容",prompt:`美容皮膚科専門の医療秘書として施術記録を要約。話者分離：丁寧語・指示語は医師、訴え・希望は患者。

【出力フォーマット（厳守）】
■ 施術名
■ 施術部位
■ 患者の希望・主訴
■ 施術内容・パラメータ
■ 使用薬剤・機器
■ 施術後注意事項
■ 次回予定
■ 患者情報（イベント等）

施術機器名は正式名称（ノーリス、ポテンツァ、メソナJ、MIINレーザー、AGNES）。コンパクトに。`},
{id:"procedure",name:"🔧 処置",prompt:`皮膚科専門の医療秘書として処置記録を要約。話者分離：丁寧語・指示語は医師、訴え・希望は患者。

【出力フォーマット（厳守）】
■ 処置名
■ 部位・範囲
■ 麻酔（種類・量）
■ 処置内容（時系列）
■ 使用器具・材料
■ 検体提出
■ 術後指示・処方
■ 次回予定

サイズmm、量mL/g。コンパクトに。`},
{id:"counseling-std",name:"💬 カウンセリング",prompt:`美容皮膚科専門の医療秘書として美容カウンセリング記録を**要点だけの簡潔な記録**に要約。話者分離：説明・提案・所見はカウンセラー/医師、悩み・希望・質問・懸念は患者。文体はカルテ調。

【出力フォーマット（厳守・8項目すべて■見出しで出力）】
■相談内容・主訴
■患者の希望・ゴール
■所見・肌状態
■提案した施術・治療プラン
■説明した内容
■患者の反応・懸念
■決定事項
■次回・フォロー

【各項目に書く内容】
- 相談内容・主訴: 悩み・部位・きっかけの要点
- 患者の希望・ゴール: どうなりたいか、期限・イベント予定
- 所見・肌状態: 所見、肌質、既往・アレルギー・内服、過去の施術歴
- 提案した施術・治療プラン: 施術名と提案理由。施術名は院内メニュー名で正確に（IPL/Potenza（ポテンツァ）/メソナJ/AGNES/ダーマペン4/リジュラン/ピーリング/医療脱毛（GentleMax Pro Plus）等）
- 説明した内容: 何を説明したか（効果・回数・ダウンタイム・リスク・費用・代替案）とその要点
- 患者の反応・懸念: 前向き/迷い、懸念点
- 決定事項: 契約・施術決定の有無、選択プラン・回数、当日施術かどうか
- 次回・フォロー: 次回予約、検討持ち帰り、宿題（パッチテスト・同意書等）

【簡潔化ルール（最重要）】
- 各■項目は箇条書き最大3個・3行以内（厳守。超えそうな場合は関連事項を1行に統合。例:「痛み対策とリスク説明実施」を1行に）。全体で400〜600字以内
- 1つの箇条書きは1文、体言止めか短文。会話の経緯・言い回しは再現せず結論のみ（「〜したが〜だった」の連鎖禁止）
- 悪い例: 「毎日のヒゲ剃りによる肌への負担が大きく、剃るたびに毎回炎症が起きてしまう。炎症がひどい時は化膿してポツポツとできものができ、治るまでに1週間ほどかかる。シェーバーを変えたり、クリームでふやかして剃ったりしても肌荒れするため、ヒゲ剃りから解放されたい。」
- 良い例: 「ヒゲ剃りのたびに炎症・化膿を繰り返す。自己対策でも改善せず、ヒゲ剃りから解放されたい。」
- 一般論の解説（脱毛の仕組み等）は「仕組み・回数・痛み・費用を説明」程度に圧縮。雑談・相槌・経緯の詳細は削除
- ただし以下は短くても必ず残す: 既往（アトピー等）・アレルギー・内服・リスク説明の実施／施術名・回数・金額・決定事項・次回予約／キャンペーン等の約束事（例: 麻酔クリーム無料）
- 該当情報が話されていない■項目は「（言及なし）」の1行のみ（サブ項目単位で並べない）
- 会話にない情報は推測しない。金額・回数・期間は話された数値を正確に記載`},
{id:"followup",name:"🔄 経過",prompt:`皮膚科専門の医療秘書として経過記録を要約。話者分離：丁寧語・指示語は医師、訴え・希望は患者。複数疾患があれば疾患ごとにまとめ、---で区切る。

【出力フォーマット（厳守）】
■ 疾患名
■ 前回からの経過
■ 現在の症状（患者）
■ 現在の所見（医師）
■ 治療効果判定（改善/不変/悪化）
■ 今後の方針
■ 次回予定

前回比較を明確に。コンパクトに。`},
{id:"free",name:"📝 フリー",prompt:`皮膚科専門の医療秘書として簡潔に要約。話者分離：丁寧語・指示語は医師、訴え・希望は患者。医学用語は正式名称。時系列で整理。推測しない。コンパクトに。`}
];

const R=[{id:"r1",l:"診察室1",i:"1"},{id:"r2",l:"診察室2",i:"2"},{id:"r3",l:"診察室3",i:"3"},{id:"r4",l:"施術室1",i:"①"},{id:"r5",l:"施術室2",i:"②"},{id:"r6",l:"施術室3",i:"③"},{id:"r7",l:"カウンセリング",i:"💬"}];
const ROOM_COLORS={
r1:{bg:"#dbeafe",text:"#1e40af",border:"#93c5fd",accent:"#3b82f6",name:"診察1"},
r2:{bg:"#dcfce7",text:"#166534",border:"#86efac",accent:"#22c55e",name:"診察2"},
r3:{bg:"#fce7f3",text:"#9d174d",border:"#f9a8d4",accent:"#ec4899",name:"診察3"},
r4:{bg:"#fef9c3",text:"#854d0e",border:"#fde047",accent:"#eab308",name:"施術1"},
r5:{bg:"#ffedd5",text:"#9a3412",border:"#fdba74",accent:"#f97316",name:"施術2"},
r6:{bg:"#f3e8ff",text:"#6b21a8",border:"#d8b4fe",accent:"#a855f7",name:"施術3"},
r7:{bg:"#e0f2fe",text:"#0c4a6e",border:"#7dd3fc",accent:"#0ea5e9",name:"カウンセリング"},
};

const DEFAULT_SHORTCUTS=[
{id:"rec",label:"🎙 録音開始/停止",key:"F1",enabled:true,showOnTop:true},
{id:"sum",label:"✓ 要約",key:"F2",enabled:true,showOnTop:true},
{id:"clear",label:"🗑 クリア",key:"F3",enabled:true,showOnTop:false},
{id:"next",label:"▶ 次へ",key:"F4",enabled:true,showOnTop:true},
{id:"copy",label:"📋 コピー",key:"F5",enabled:true,showOnTop:false},
{id:"pip",label:"🌟 小窓",key:"F6",enabled:true,showOnTop:false},
{id:"doc",label:"📄 資料作成",key:"F7",enabled:true,showOnTop:false},
{id:"counsel",label:"🧠 分析",key:"F8",enabled:true,showOnTop:false},
{id:"undo",label:"↩ 元に戻す",key:"Ctrl+Z",enabled:true,showOnTop:false},
{id:"room1",label:"診察室1",key:"Ctrl+1",enabled:true,showOnTop:false},
{id:"room2",label:"診察室2",key:"Ctrl+2",enabled:true,showOnTop:false},
{id:"room3",label:"診察室3",key:"Ctrl+3",enabled:true,showOnTop:false},
{id:"room4",label:"施術室1",key:"Ctrl+4",enabled:true,showOnTop:false},
{id:"room5",label:"施術室2",key:"Ctrl+5",enabled:true,showOnTop:false},
{id:"room6",label:"施術室3",key:"Ctrl+6",enabled:true,showOnTop:false},
{id:"room7",label:"カウンセリング",key:"Ctrl+7",enabled:true,showOnTop:false},
];

const DEFAULT_DICT=[
["りんでろん","リンデロン"],["リンデロンVG","リンデロン-VG"],["りんでろんぶいじー","リンデロン-VG"],["アンテベート","アンテベート"],["でるもべーと","デルモベート"],["ロコイド","ロコイド"],["プロトピック","プロトピック"],["キンダベート","キンダベート"],["ヒルドイド","ヒルドイド"],["ひるどいど","ヒルドイド"],["プロペト","プロペト"],
["アクアチム","アクアチムクリーム"],["ダラシン","ダラシンTゲル"],["ゼビアックス","ゼビアックスローション"],["デュアック","デュアック配合ゲル"],["べピオ","ベピオゲル"],["エピデュオ","エピデュオゲル"],["ディフェリン","ディフェリンゲル"],["アダパレン","アダパレン"],
["イソトレチノイン","イソトレチノイン"],["いそとれちのいん","イソトレチノイン"],["トラネキサム酸","トラネキサム酸"],["とらねきさむさん","トラネキサム酸"],["ハイドロキノン","ハイドロキノン"],["トレチノイン","トレチノイン"],
["デュピクセント","デュピクセント"],["でゅぴくせんと","デュピクセント"],["ミチーガ","ミチーガ"],["オルミエント","オルミエント"],["リンヴォック","リンヴォック"],["サイバインコ","サイバインコ"],["コレクチム","コレクチム軟膏"],["モイゼルト","モイゼルト軟膏"],
["ルミセフ","ルミセフ"],["コセンティクス","コセンティクス"],["スキリージ","スキリージ"],["トルツ","トルツ"],["オテズラ","オテズラ"],["ソーティクツ","ソーティクツ"],
["ゾレア","ゾレア"],["ビラノア","ビラノア"],["デザレックス","デザレックス"],["ルパフィン","ルパフィン"],["アレグラ","アレグラ"],
["あとぴー","アトピー性皮膚炎"],["かんせん","乾癬"],["じんましん","蕁麻疹"],["たいじょうほうしん","帯状疱疹"],["はくせん","白癬"],["ふんりゅう","粉瘤"],["しろうせい","脂漏性皮膚炎"],["しゅさ","酒さ"],["ほうかしきえん","蜂窩織炎"],["とびひ","伝染性膿痂疹"],["にきび","ざ瘡"],["ニキビ","ざ瘡"],["かんぱん","肝斑"],["そばかす","雀卵斑"],
["ノーリス","ノーリス（IPL光治療）"],["のーりす","ノーリス（IPL光治療）"],["ポテンツァ","ポテンツァ"],["ぽてんつぁ","ポテンツァ"],["ジュベルック","ジュベルック"],["じゅべるっく","ジュベルック"],["メソナJ","メソナJ"],["めそな","メソナJ"],["AGNES","AGNES"],["あぐねす","AGNES"],["MIIN","MIINレーザー"],["みいん","MIINレーザー"],["美人レーザー","MIINレーザー"],
["サリチル酸マクロゴールピーリング","サリチル酸マクロゴールピーリング"],["マッサージピール","マッサージピール"],["リバースピール","リバースピール"],
["ゼオスキン","ゼオスキンヘルス"],["ぜおすきん","ゼオスキンヘルス"],["ミラミン","ミラミン"],["ミラミックス","ミラミックス"],
["カレシム","カレシム美容液"],["ドロップスクリーン","ドロップスクリーン"],["どろっぷすくりーん","ドロップスクリーン"],
["えーじーえー","AGA（男性型脱毛症）"],["エキシマ","エキシマライト"],["ナローバンド","ナローバンドUVB"],
["液体窒素","液体窒素凍結療法"],["えきたいちっそ","液体窒素凍結療法"],["生検","皮膚生検"],["せいけん","皮膚生検"],
["ひるまいど","ヒルドイド"],["ひるまいどローション","ヒルドイドローション"],["でゅぴくせんと","デュピクセント"],["デュピクセント注射","デュピクセント皮下注"],["おてずら","オテズラ"],
["じぇんとるまっくす","ジェントルマックスプロプラス"],["じぇんとる","ジェントルマックスプロプラス"],["ジェントルマックス","ジェントルマックスプロプラス"],
["トライフィル","トライフィルプロ"],["とらいふぃる","トライフィルプロ"],["キュアジェット","キュアジェット"],["きゅあじぇっと","キュアジェット"],
["ターゲットクール","ターゲットクール"],["たーげっとくーる","ターゲットクール"],["ブルーレーザー","ブルーレーザー"],["ぶるーれーざー","ブルーレーザー"],
["プラズマペン","プラズマペン"],["ぷらずまぺん","プラズマペン"],
["スキンマリア","スキンマリア"],["すきんまりあ","スキンマリア"],
["あざくりあ","AZAクリアクリーム"],["AZAクリア","AZAクリアクリーム"],
["スキンピールバー","スキンピールバー"],["すきんぴーるばー","スキンピールバー"],
["ナディカル","ナディカルフェイスローション"],["なでぃかる","ナディカルフェイスローション"],
["えすえーしー","S-ACクリーム"],["SAC","S-ACクリーム"],
["ステムアドバンス","DRXステムアドバンスセラム"],["すてむあどばんす","DRXステムアドバンスセラム"],
["デイリーPD","デイリーPD"],["でいりーぴーでぃー","デイリーPD"],
["バランサートナー","バランサートナー"],["ばらんさーとなー","バランサートナー"],
["リバースピール","リバースピール"],["りばーすぴーる","リバースピール"],
["ぼとっくす","ボトックス"],["ボトックス注射","ボトックス注"],["ひあるろんさん","ヒアルロン酸"],["ヒアルロン酸注入","ヒアルロン酸注入"],
["しみとり","シミ取りレーザー"],["ほくろとり","ホクロ除去"],
["だーまぺん","ダーマペン"],["ダーマペン","ダーマペン4"],
["うるせら","ウルセラ"],["ハイフ","HIFU"],["はいふ","HIFU"],
["しーおーつーれーざー","CO2レーザー"],["炭酸ガスレーザー","CO2レーザー"],
["ていれーざー","T字レーザー"],
["フラクショナル","フラクショナルレーザー"],["ふらくしょなる","フラクショナルレーザー"],
["ケミカルピーリング","ケミカルピーリング"],["けみかるぴーりんぐ","ケミカルピーリング"],
["いおんとふぉれーしす","イオントフォレーシス"],["イオン導入","イオントフォレーシス"],
["えれくとろぽれーしょん","エレクトロポレーション"],["電気穿孔法","エレクトロポレーション"],
["ぴこれーざー","ピコレーザー"],["ぴことーにんぐ","ピコトーニング"],
["きゅーすいっち","Qスイッチレーザー"],["Qスイッチ","Qスイッチレーザー"],
["びたみんしー","ビタミンC誘導体"],["びたみんC","ビタミンC誘導体"],
["れちのーる","レチノール"],["せらみど","セラミド"],["ないあしんあみど","ナイアシンアミド"],
["りどかいん","リドカイン"],["きしろかいん","キシロカイン"],["ペンレス","ペンレステープ"],["ぺんれす","ペンレステープ"],["エムラ","エムラクリーム"],["えむら","エムラクリーム"],
["SPF","SPF"],["ぴーえー","PA"],
["りょうせいしゅよう","良性腫瘍"],["あくせいしゅよう","悪性腫瘍"],["きていさいぼうがん","基底細胞癌"],["ゆうきょくさいぼうがん","有棘細胞癌"],["あくせいこくしょくしゅ","悪性黒色腫"],["メラノーマ","悪性黒色腫"],["めらのーま","悪性黒色腫"],
["けろいど","ケロイド"],["ひこうせいはんこん","肥厚性瘢痕"],
["びらん","びらん"],
["ほっしん","発疹"],["こうはん","紅斑"],["きゅうしん","丘疹"],["すいほう","水疱"],["のうほう","膿疱"],["りんせつ","鱗屑"],["かひ","痂皮"],
["あとぴー","アトピー性皮膚炎"],["あとぴーせいひふえん","アトピー性皮膚炎"],["しろせいひふえん","脂漏性皮膚炎"],["しろせい","脂漏性"],
["じんましん","蕁麻疹"],["じんましん","蕁麻疹"],["かんぱん","肝斑"],["そばかす","雀卵斑"],
["たいじょうほうしん","帯状疱疹"],["たいじょう","帯状疱疹"],["ヘルペス","単純ヘルペス"],["へるぺす","単純ヘルペス"],
["みずぼうそう","水痘"],["とびひ","伝染性膿痂疹"],["みずいぼ","伝染性軟属腫"],
["にきび","ざ瘡"],["ニキビ","ざ瘡"],["にきびあと","ざ瘡瘢痕"],["ニキビ跡","ざ瘡瘢痕"],["にきび痕","ざ瘡瘢痕"],
["しゅさ","酒さ"],["しゅさようひふえん","酒さ様皮膚炎"],["くちまわりひふえん","口囲皮膚炎"],
["かんせん","乾癬"],["じょうじょうせいかんせん","尋常性乾癬"],["てきじょう","滴状乾癬"],
["しょうせきのうほうしょう","掌蹠膿疱症"],["しょうせき","掌蹠膿疱症"],
["えんけいだつもうしょう","円形脱毛症"],["だつもうしょう","脱毛症"],["AGA","男性型脱毛症"],
["はくはん","白斑"],["じんじょうせいはくはん","尋常性白斑"],
["しみ","色素沈着"],["くすみ","色素沈着"],["ほくろ","色素性母斑"],["あざ","母斑"],
["いぼ","疣贅"],["じんじょうせいゆうぜい","尋常性疣贅"],["ウイルス性イボ","ウイルス性疣贅"],
["ふんりゅう","粉瘤（アテローム）"],["あてろーむ","粉瘤（アテローム）"],["ひのうほう","皮膚嚢腫"],
["うおのめ","鶏眼"],["けいがん","鶏眼"],
["まきづめ","巻き爪"],["かんにゅうそう","陥入爪"],
["みずむし","足白癬"],["たむし","体部白癬"],["いんきんたむし","股部白癬"],["つめみずむし","爪白癬"],
["ひふか","皮膚科"],["びようひふか","美容皮膚科"],
["すてろいど","ステロイド外用薬"],["ステロイド","ステロイド外用薬"],
["でるもべーと","デルモベート"],["あんてべーと","アンテベート"],["まいざー","マイザー"],["りんでろん","リンデロン"],["ろこいど","ロコイド"],["きんだべーと","キンダベート"],
["ぷろとぴっく","プロトピック"],["たくろりむす","タクロリムス"],["これくちむ","コレクチム"],["もいぜると","モイゼルト"],
["ひるどいど","ヒルドイド"],["わせりん","白色ワセリン"],["プロペト","プロペト（白色ワセリン）"],
["べぴおげる","ベピオゲル"],["でぃふぇりん","ディフェリン"],["えぴでゅお","エピデュオ"],["でゅあっく","デュアック"],
["あだぱれん","アダパレン"],["くりんだまいしん","クリンダマイシン"],
["あくあちむ","アクアチム"],["ぜびあっくす","ゼビアックス"],["なじふろ","ナジフロ"],
["でるもぞーる","デルモゾール"],["にぞらーる","ニゾラール"],["るりこん","ルリコン"],
["てるびなふぃん","テルビナフィン"],["いとらこなぞーる","イトラコナゾール"],
["ふぇきそふぇなじん","フェキソフェナジン"],["あれぐら","アレグラ"],["びらのあ","ビラノア"],["でざれっくす","デザレックス"],["るぱふぃん","ルパフィン"],["たりおん","タリオン"],["あれろっく","アレロック"],["ざいざる","ザイザル"],
["ばるとれっくす","バルトレックス"],["あめなりーふ","アメナリーフ"],["ばらしくろびる","バラシクロビル"],
["よくいにん","ヨクイニン"],["はとむぎ","ヨクイニン"],
["めととれきさーと","メトトレキサート"],["しくろすぽりん","シクロスポリン"],["ねおーらる","ネオーラル"],
["かろなーる","カロナール"],["あせとあみのふぇん","アセトアミノフェン"],["ろきそにん","ロキソニン"],
["りりか","リリカ"],["たりーじぇ","タリージェ"],["ぷれがばりん","プレガバリン"],["みろがばりん","ミロガバリン"],
["あずのーる","アズノール"],["げんたしん","ゲンタシン"],["ふしじんさん","フシジン酸"],
];

// 議事録の「表示専用」整形レンダラ。保存テキストは一切変えず、CSSの余白だけで可読化する。
// ・見出し(■/【】) ・箇条書き(・/･/-) ・番号(1.) ・空行 を判定し、項目間の余白とぶら下げインデントを付ける。
// 長い項目は句点「。」で“表示上だけ”文分割し、2文ごとに小さな空きを入れて壁を崩す（元テキストは不変）。
function mvSplitLong(s){
  const sentences=String(s).split(/(?<=。)/).filter(x=>x.length>0);
  if(sentences.length<=1)return [s];
  const groups=[];for(let i=0;i<sentences.length;i+=2){groups.push(sentences.slice(i,i+2).join(""))}
  return groups;
}
function mvBody(s){
  const text=String(s);
  const isLong=text.length>100||(text.match(/。/g)||[]).length>=3;
  if(!isLong)return text;
  const groups=mvSplitLong(text);
  return groups.map((g,i)=>(<div key={i} style={{marginBottom:i<groups.length-1?"0.35em":0}}>{g}</div>));
}
function MinutesFormatted({text}){
  const raw=String(text||"");
  if(!raw.trim())return null;
  const lines=raw.split("\n");
  const out=[];let k=0;
  for(const line of lines){
    const t=line.trim();
    if(t===""){out.push(<div key={k++} style={{height:"0.5em"}}/>);continue;}
    if(t.startsWith("■")||/^【.+】$/.test(t)){
      out.push(<div key={k++} style={{fontWeight:700,fontSize:"1.06em",color:"#2a5018",margin:"0.95em 0 0.3em",lineHeight:1.5}}>{t.replace(/^■\s*/,"")}</div>);continue;
    }
    const numM=t.match(/^(\d+)[.．]\s*(.*)$/);
    if(numM){
      out.push(<div key={k++} style={{display:"flex",gap:6,marginBottom:"0.55em",lineHeight:1.85}}><span style={{flex:"0 0 auto",fontWeight:600,minWidth:"1.5em"}}>{numM[1]}.</span><div style={{flex:1,minWidth:0}}>{mvBody(numM[2])}</div></div>);continue;
    }
    const bulM=t.match(/^[・･\-]\s*(.*)$/);
    if(bulM){
      out.push(<div key={k++} style={{display:"flex",gap:6,marginBottom:"0.55em",lineHeight:1.85}}><span style={{flex:"0 0 auto"}}>・</span><div style={{flex:1,minWidth:0}}>{mvBody(bulM[1])}</div></div>);continue;
    }
    out.push(<div key={k++} style={{marginBottom:"0.5em",lineHeight:1.85}}>{mvBody(t)}</div>);
  }
  return <div style={{whiteSpace:"normal"}}>{out}</div>;
}

// === MAIN COMPONENT ===
export default function Home(){
const{isMobile:mob,isTablet:tab,w:winW}=useResponsive();
const[themeName,setThemeName]=useState("pearl");
const theme=THEMES[themeName]||THEMES["pearl"];
C={p:theme.p,pD:theme.pD,pDD:theme.pDD,pL:theme.pL,pLL:theme.pLL,g50:theme.g50,g100:theme.g100||"rgba(240,252,228,0.6)",g200:theme.g200,g300:"#d6d3d1",g400:theme.g400,g500:theme.g500,g600:"#57534e",g700:"#44403c",g800:"#292524",g900:"#1c1917",err:"#f43f5e",warn:"#f59e0b",rG:"#5a9040",w:theme.cardBg,pLL2:theme.pLL};
const applyTheme=(name)=>{setThemeName(name);try{localStorage.setItem("mk_theme",name)}catch{}};
const btn=(bg,c,extra)=>({padding:mob?"5px 10px":"6px 14px",borderRadius:12,border:`1px solid ${C.pL}`,background:bg,color:c,fontSize:mob?15:16,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:`0 3px 12px ${C.pL}`,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",transition:"all 0.15s ease",transform:"translateY(0)",...extra});
const ib={padding:mob?"7px 10px":"8px 12px",borderRadius:mob?10:12,border:`1.5px solid ${C.g200}`,fontSize:15,fontFamily:"inherit",outline:"none",background:C.w,color:C.g900,transition:"border-color 0.2s",WebkitAppearance:"none"};
const card={borderRadius:14,border:`1px solid ${theme.cardBorder}`,padding:mob?14:20,background:theme.cardBg,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",marginBottom:mob?12:16,boxShadow:"0 1px 4px rgba(0,0,0,.03)"};
const rb={borderRadius:"50%",border:"none",fontFamily:"inherit",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s ease",boxShadow:"0 2px 8px rgba(0,0,0,.08)"};
const[page,setPage]=useState("main"); // main|room|hist|settings|help|about
const[modelCheck,setModelCheck]=useState(null); // Geminiモデル稼働チェック結果 {ok,missing,missingPreview,known_new,available,checkedAt}
const[modelChecking,setModelChecking]=useState(false);
const[rs,sRS]=useState("inactive"),[inp,sInp]=useState(""),[out,sOut]=useState(""),[st,sSt]=useState("待機中"),[el,sEl]=useState(0),[ld,sLd]=useState(false),[prog,setProg]=useState(0),[lv,sLv]=useState(0),[md,sMd]=useState("gemini"),[geminiModel,setGeminiModel]=useState(""),[summaryModel,setSummaryModel]=useState("gemini"),[minutesModel,setMinutesModel]=useState("gemini-3-5-flash"),[rxItems,setRxItems]=useState([]),[rxLd,setRxLd]=useState(false),[rxOpen,setRxOpen]=useState(false),[autoTplMsg,setAutoTplMsg]=useState(""),[pc,sPC]=useState(0),[tid,sTid]=useState("soap-std"),[rid,sRid]=useState("r1");
// トップメニューのカスタマイズ表示: 表示onのボタンのみトップに常時表示し、残りは「⋯その他」で展開。設定はlocalStorage(mk_topMenuVisible)
const[topMenuVisible,setTopMenuVisible]=useState(null);
const[menuMore,setMenuMore]=useState(false);
// 診察モードの書き起こし/要約結果欄の高さ倍率。小=1(従来: mob150/PC200px)/中=2(既定)/大=4。両欄共通・localStorageで永続化
const[consultTaSize,setConsultTaSize]=useState(2);
useEffect(()=>{try{const v=parseInt(localStorage.getItem("mk_consultTextareaHeight"));if([1,2,4].includes(v))setConsultTaSize(v)}catch{}},[]);
const[tplOrder,setTplOrder]=useState(null);
const[tplVisible,setTplVisible]=useState(null);
const[dragTpl,setDragTpl]=useState(null);
const[hist,sHist]=useState([]),[search,setSearch]=useState(""),[pName,sPName]=useState(""),[pId,sPId]=useState(""),[histTab,setHistTab]=useState({});
const[histPopup,setHistPopup]=useState(null);
const[hlMode,setHlMode]=useState(false);
const[todayStats,setTodayStats]=useState(null);
const[statsOpen,setStatsOpen]=useState(false);
const[calView,setCalView]=useState("list");
const[calYear,setCalYear]=useState(new Date().getFullYear());
const[calMonth,setCalMonth]=useState(new Date().getMonth());
const[qModal,setQModal]=useState(false);
const[qDisease,setQDisease]=useState("");
const[qFirstVisit,setQFirstVisit]=useState(true);
const[qResult,setQResult]=useState("");
const[qLd,setQLd]=useState(false);
const[visitType,setVisitType]=useState("");
const[prevRecord,setPrevRecord]=useState(null);
const[docLang,setDocLang]=useState("ja");
const[usageGuide,setUsageGuide]=useState("");
const[usageGuideLd,setUsageGuideLd]=useState(false);
const[usageGuideModal,setUsageGuideModal]=useState(false);
const[roomFilter,setRoomFilter]=useState("all");
const[badgePopup,setBadgePopup]=useState(null);
const[badgeLd,setBadgeLd]=useState(false);
const[selectedHistIds,setSelectedHistIds]=useState(new Set());
const[openDates,setOpenDates]=useState(new Set());
const[dailyMenu,setDailyMenu]=useState(null);
const[dailyLd,setDailyLd]=useState(false);
const[dailyResult,setDailyResult]=useState(null);
const[dailyTypoLd,setDailyTypoLd]=useState(null);
const[dailyTypoProgress,setDailyTypoProgress]=useState("");
const[dailyNoiseLd,setDailyNoiseLd]=useState(null);
const[dailyNoiseProgress,setDailyNoiseProgress]=useState("");
const[histTypoLd,setHistTypoLd]=useState(false);
const[histNoiseLd,setHistNoiseLd]=useState(false);
const[bulkMenu,setBulkMenu]=useState(false);
const[treatModal,setTreatModal]=useState(false);
const[treatLd,setTreatLd]=useState(false);
const[treatResult,setTreatResult]=useState(null);
const[bulkLd,setBulkLd]=useState(false);
const[bulkResult,setBulkResult]=useState(null);
const[bulkFavModal,setBulkFavModal]=useState(false);
const[pipWin,setPipWin]=useState(null),[pipActive,setPipActive]=useState(false);
const[dict,setDict]=useState(DEFAULT_DICT),[newFrom,setNewFrom]=useState(""),[newTo,setNewTo]=useState(""),[dictEnabled,setDictEnabled]=useState(true),[dictModal,setDictModal]=useState(false);
const[logoUrl,setLogoUrl]=useState(""),[logoSize,setLogoSize]=useState(32);
const[shortcuts,setShortcuts]=useState(DEFAULT_SHORTCUTS);
const[fontSize,setFontSize]=useState("medium");
const[fontFamily,setFontFamily]=useState("Zen Maru Gothic");
const[snippetFontSize,setSnippetFontSize]=useState(14);
const[noisePatterns,setNoisePatterns]=useState([]);
const[noiseScanLd,setNoiseScanLd]=useState(false);
const[noiseCandidates,setNoiseCandidates]=useState([]);
const[noiseModal,setNoiseModal]=useState(false);
const[newNoiseInput,setNewNoiseInput]=useState("");
useEffect(()=>{try{const saved=localStorage.getItem("mk_theme")||"pearl";if(saved!==themeName){setThemeName(saved);}const t=THEMES[saved]||THEMES["pearl"];document.body.style.background=t.bodyBg;document.body.style.minHeight="100vh"}catch{}},[]);
useEffect(()=>{try{const l=localStorage.getItem("mk_logo");if(l)setLogoUrl(l);const s=localStorage.getItem("mk_logoSize");if(s)setLogoSize(parseInt(s));const d=localStorage.getItem("mk_dict");if(d)setDict(JSON.parse(d));const sn=localStorage.getItem("mk_snippets");if(sn)setSnippets(JSON.parse(sn));const ps=localStorage.getItem("mk_pipSnippets");if(ps)setPipSnippets(JSON.parse(ps));const as=localStorage.getItem("mk_audioSave");if(as)setAudioSave(as==="1");const de=localStorage.getItem("mk_dictEnabled");if(de)setDictEnabled(de==="1");const sc=localStorage.getItem("mk_shortcuts");if(sc)setShortcuts(JSON.parse(sc));const o=localStorage.getItem("mk_tplOrder");if(o)setTplOrder(JSON.parse(o));const tm=localStorage.getItem("mk_topMenuVisible");if(tm){const tmArr=JSON.parse(tm);if(Array.isArray(tmArr))setTopMenuVisible(tmArr)}const tv=localStorage.getItem("mk_tplVisible");if(tv){let tvArr=JSON.parse(tv);if(!localStorage.getItem("mk_tplVisibleCounselMig")){if(Array.isArray(tvArr)&&!tvArr.includes("counseling-std")){tvArr=[...tvArr,"counseling-std"];localStorage.setItem("mk_tplVisible",JSON.stringify(tvArr))}localStorage.setItem("mk_tplVisibleCounselMig","1")}setTplVisible(tvArr)}const dt=localStorage.getItem("mk_defaultTpl");if(dt)sTid(dt);const sm=localStorage.getItem("mk_summaryModel");if(sm)setSummaryModel(sm);const mm=localStorage.getItem("mk_minutesModel");if(mm&&["gemini-3-5-flash","gemini-3-pro","claude"].includes(mm))setMinutesModel(mm);const smm=localStorage.getItem("mk_smnSummaryModel");if(smm&&["gemini-3-5-flash","gemini-3-pro","claude"].includes(smm))setSmnSummaryModel(smm);const rph=localStorage.getItem("mk_rpHistory");if(rph)setRpHistory(JSON.parse(rph));const snsh=localStorage.getItem("mk_snsHistory");if(snsh)setSnsHistory(JSON.parse(snsh));const fs=localStorage.getItem("mk_fontSize");if(fs)setFontSize(fs);const ff=localStorage.getItem("mk_fontFamily");if(ff)setFontFamily(ff);const mh=localStorage.getItem("mk_mobileHide");if(mh)setMobileHideItems(JSON.parse(mh));const sfs=localStorage.getItem("mk_snippetFontSize");if(sfs)setSnippetFontSize(parseInt(sfs));const np=localStorage.getItem("mk_noisePatterns");if(np)setNoisePatterns(JSON.parse(np));const ae=localStorage.getItem("mk_asrEngine");if(ae)setAsrEngine(ae);const stv=localStorage.getItem("mk_silenceThreshold");if(stv!==null&&!isNaN(parseFloat(stv)))setSilenceThreshold(parseFloat(stv))}catch{}},[]);
useEffect(()=>{try{const ua=navigator.userAgent||"";const ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);setIsIOSDevice(ios)}catch{}},[]);
// Geminiモデル稼働チェック（ListModels照合）。手動ボタン＆起動時14日経過で自動実行。失敗しても本体機能に影響させない。
const runModelCheck=async(manual=false)=>{try{setModelChecking(true);const res=await fetch("/api/gemini-model-check");const data=await res.json();if(data&&data.ok){setModelCheck(data);try{localStorage.setItem("mk_modelCheckAt",String(Date.now()));localStorage.setItem("mk_modelCheckResult",JSON.stringify(data))}catch{}}else if(manual){setModelCheck({ok:false,error:(data&&data.error)||"チェックに失敗しました",checkedAt:new Date().toISOString()})}}catch(e){if(manual)setModelCheck({ok:false,error:"チェックに失敗しました",checkedAt:new Date().toISOString()})}finally{setModelChecking(false)}};
useEffect(()=>{try{const raw=localStorage.getItem("mk_modelCheckResult");if(raw)setModelCheck(JSON.parse(raw));const at=Number(localStorage.getItem("mk_modelCheckAt")||0);const FOURTEEN=14*24*60*60*1000;if(!at||Date.now()-at>FOURTEEN){runModelCheck(false)}}catch{}},[]);
useEffect(()=>{if(!supabase)return;(async()=>{try{const{data}=await supabase.from("dictionary").select("from_text,to_text").order("created_at",{ascending:false});if(data&&data.length>0){setDict(prev=>{const sbEntries=data.map(r=>[r.from_text,r.to_text]);const localOnly=prev.filter(([f])=>!sbEntries.some(([sf])=>sf===f));const merged=[...sbEntries,...localOnly];try{localStorage.setItem("mk_dict",JSON.stringify(merged))}catch{}return merged})}}catch(e){console.error("dict load from supabase error:",e)}
// ノイズパターンをSupabaseから読み込む
try{const{data:npData}=await supabase.from("noise_patterns").select("pattern").order("created_at",{ascending:false});if(npData&&npData.length>0){const patterns=npData.map(r=>r.pattern);setNoisePatterns(patterns);try{localStorage.setItem("mk_noisePatterns",JSON.stringify(patterns))}catch{}}}catch(e){console.error("noise_patterns load error:",e)}
loadTodayStats();
})()},[]);
useEffect(()=>{const sizes={small:"12px",medium:"14px",large:"16px"};document.documentElement.style.fontSize=sizes[fontSize]||"14px";const zooms={small:"0.85",medium:"1",large:"1.2"};document.documentElement.style.zoom=zooms[fontSize]||"1";localStorage.setItem("mk_fontSize",fontSize)},[fontSize]);
useEffect(()=>{document.documentElement.style.fontFamily=`'${fontFamily}', sans-serif`;document.body.style.fontFamily=`'${fontFamily}', sans-serif`;localStorage.setItem("mk_fontFamily",fontFamily)},[fontFamily]);
useEffect(()=>{const t=THEMES[themeName]||THEMES["pearl"];document.body.style.background=t.bodyBg;document.body.style.minHeight="100vh";const isDark=themeName.startsWith("dark");document.body.style.color=isDark?(t.g700||"#f1f5f9"):"";return()=>{document.body.style.color=""}},[themeName]);
const[micDevices,setMicDevices]=useState([]),[selectedMic,setSelectedMic]=useState("");
// マイク入力テスト（録音コアとは独立。専用のctx/stream/refで録音用 msR/acR/anR を一切共有しない）
const[micTesting,setMicTesting]=useState(false),[micTestLv,setMicTestLv]=useState(0),[micTestMsg,setMicTestMsg]=useState("");
const micTestRef=useRef(null);
const loadMics=async()=>{try{await navigator.mediaDevices.getUserMedia({audio:true}).then(s=>s.getTracks().forEach(t=>t.stop()));const devs=await navigator.mediaDevices.enumerateDevices();const mics=devs.filter(d=>d.kind==="audioinput");setMicDevices(mics);if(mics.length>0){const curExists=selectedMic&&mics.some(m=>m.deviceId===selectedMic);if(!curExists){/* 前回選択マイクの復元: id一致→label一致→既定。保存値が無効なら既定+クリア */let savedId="",savedLabel="";try{savedId=localStorage.getItem("mk_preferredMicId")||"";savedLabel=localStorage.getItem("mk_preferredMicLabel")||""}catch{}const byId=savedId&&mics.find(m=>m.deviceId===savedId);const byLabel=!byId&&savedLabel&&mics.find(m=>m.label&&m.label===savedLabel);if(byId){setSelectedMic(byId.deviceId)}else if(byLabel){setSelectedMic(byLabel.deviceId);try{localStorage.setItem("mk_preferredMicId",byLabel.deviceId)}catch{}}else{setSelectedMic(mics[0].deviceId);if(savedId||savedLabel){try{localStorage.removeItem("mk_preferredMicId");localStorage.removeItem("mk_preferredMicLabel")}catch{}}}}}}catch(e){console.error("Mic enumeration error:",e)}};
useEffect(()=>{loadMics();navigator.mediaDevices.addEventListener("devicechange",loadMics);return()=>navigator.mediaDevices.removeEventListener("devicechange",loadMics)},[]);
useEffect(()=>{if(!document.getElementById("spin-kf")){const s=document.createElement("style");s.id="spin-kf";s.textContent="@keyframes spin{to{transform:rotate(360deg)}} button{transition:all 0.15s ease !important} button:hover{transform:translateY(-1px) !important;box-shadow:0 4px 12px rgba(0,0,0,.2), 0 2px 4px rgba(0,0,0,.1) !important} button:active{transform:translateY(1px) !important;box-shadow:0 1px 3px rgba(0,0,0,.15) !important}";document.head.appendChild(s)}},[]);
useEffect(()=>{if(!document.querySelector('meta[name="viewport"]')){const m=document.createElement("meta");m.name="viewport";m.content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no";document.head.appendChild(m)}},[]);
const DEFAULT_SNIPPETS=[
{title:"f/u 1w",text:"f/u 1w後（1週間後再診）",cat:"フォロー"},
{title:"f/u 2w",text:"f/u 2w後（2週間後再診）",cat:"フォロー"},
{title:"f/u 4w",text:"f/u 4w後（4週間後再診）",cat:"フォロー"},
{title:"f/u 2M",text:"f/u 2M後（2ヶ月後再診）",cat:"フォロー"},
{title:"f/u 3M",text:"f/u 3M後（3ヶ月後再診）",cat:"フォロー"},
{title:"経過観察",text:"経過観察。症状増悪時は早めに再診。",cat:"フォロー"},
{title:"処方箋発行",text:"処方箋発行済み",cat:"記録"},
{title:"説明同意",text:"治療内容・リスク・副作用について説明し、同意を得た。",cat:"記録"},
{title:"写真撮影",text:"臨床写真撮影済み",cat:"記録"},
{title:"紹介状",text:"紹介状作成：　病院　科宛",cat:"記録"},
{title:"検査オーダー",text:"検査オーダー：血液検査（CBC, CRP）",cat:"記録"},
{title:"アレルギー検査",text:"ドロップスクリーン（41種アレルギー検査）施行",cat:"記録"},
{title:"皮膚生検",text:"皮膚生検施行。検体を病理組織検査に提出。結果は約2週間後。",cat:"記録"},
{title:"粉瘤切除",text:"【手術記録】粉瘤摘出術\n部位：\nサイズ：約 mm\n麻酔：1%キシロカイン（エピ入り） mL局注\n術式：紡錘形切開にて被膜ごと摘出\n止血確認後、 -0ナイロンにて縫合（ 針）\n検体：病理提出\n術後：ゲンタシン軟膏+ガーゼ保護\n抜糸予定：7-10日後",cat:"手術"},
{title:"皮膚腫瘍切除",text:"【手術記録】皮膚腫瘍切除術\n部位：\n臨床診断：\nサイズ：約 mm（マージン mm含む）\n麻酔：1%キシロカイン（エピ入り） mL局注\n術式：マーキング後、紡錘形に切除\n止血確認後、真皮縫合+ -0ナイロンにて縫合\n検体：病理提出\n術後：ガーゼ保護\n抜糸予定：7-14日後",cat:"手術"},
{title:"切開排膿",text:"【手術記録】切開排膿術\n部位：\n麻酔：1%キシロカイン mL局注\n所見：膿汁排出あり、内容物を十分に排出\nドレナージ：ガーゼドレーン挿入\n術後：ゲンタシン軟膏+ガーゼ保護、毎日洗浄交換\n抗生剤処方：",cat:"手術"},
{title:"液体窒素",text:"液体窒素凍結療法施行\n部位：\n回数：　回（各 秒程度）\n対象：尋常性疣贅\nf/u 2w後",cat:"処置"},
{title:"光線（NB-UVB）",text:"ナローバンドUVB照射\n照射量： mJ/cm²\n部位：\n回数：本日 回目\n皮膚反応：紅斑（-/±/+）\n次回照射量：　mJ/cm²に増量予定",cat:"処置"},
{title:"光線（エキシマ）",text:"エキシマライト照射\n照射量： mJ/cm²\n部位：\n回数：本日 回目\n皮膚反応：紅斑（-/±/+）\n次回照射量：　mJ/cm²",cat:"処置"},
{title:"デュピクセント",text:"デュピクセント皮下注射施行\n投与量：300mg（初回のみ600mg）\n投与部位：\n副作用確認：注射部位反応（-）、結膜炎（-）\n次回投与：2w後\nEASIスコア：",cat:"生物学的製剤"},
{title:"ミチーガ",text:"ミチーガ皮下注射施行\n投与量：60mg\n投与部位：\n副作用確認：注射部位反応（-）\n次回投与：4w後",cat:"生物学的製剤"},
{title:"コセンティクス",text:"コセンティクス皮下注射施行\n投与量：150mg/300mg\n投与部位：\n副作用確認：注射部位反応（-）\n次回投与：（初期は毎週→4w後）\nPASIスコア：",cat:"生物学的製剤"},
{title:"ゾレア",text:"ゾレア皮下注射施行\n投与量：300mg\n投与部位：\n副作用確認：注射部位反応（-）、アナフィラキシー（-）\n次回投与：4w後\nUAS7スコア：",cat:"生物学的製剤"},
{title:"スキリージ",text:"スキリージ皮下注射施行\n投与量：150mg\n投与部位：\n副作用確認：注射部位反応（-）\n次回投与：（初期12w→8w後）\nPASIスコア：",cat:"生物学的製剤"},
{title:"ノーリス",text:"ノーリス（IPL光治療）施行\n照射部位：顔全体\nフィルター：\nフルエンス：\nパス数：\n冷却：施行\n術後：日焼け止め塗布・保湿指導",cat:"美容施術"},
{title:"ポテンツァ",text:"ポテンツァ施行\nチップ：\n部位：\n出力：\nパス数：\n麻酔：表面麻酔クリーム（ mm塗布 分待機）\n術後：鎮静パック施行、保湿・遮光指導",cat:"美容施術"},
{title:"メソナJ",text:"メソナJ施行\nコース：トータル美容/美肌コース\n導入成分：\n部位：顔全体（目元含む）\n施術時間：約 分\n術後：特記事項なし",cat:"美容施術"},
{title:"ピーリング",text:"サリチル酸マクロゴールピーリング施行\n部位：顔全体\n塗布時間：5分\n皮膚反応：軽度発赤（±）\n術後：保湿・遮光指導",cat:"美容施術"},
{title:"外用指導",text:"外用指導：1日2回（朝・入浴後）患部に薄く塗布。改善後は1日1回に減量可。",cat:"患者指導"},
{title:"保湿指導",text:"保湿指導：1日2回以上、入浴後すぐに保湿剤を全身に塗布。こすらず押さえるように。",cat:"患者指導"},
{title:"遮光指導",text:"遮光指導：日焼け止め（SPF30以上）を毎日塗布。2-3時間おきに塗り直し。",cat:"患者指導"},
{title:"外用FTU",text:"外用量目安（FTU）：人差し指の先端から第一関節まで（約0.5g）で手のひら2枚分の面積に塗布。",cat:"患者指導"},
{title:"重ね塗り順序",text:"外用順序：①保湿剤を広範囲に塗布→②ステロイド外用薬を患部のみに重ね塗り",cat:"患者指導"},
{title:"プロアクティブ",text:"プロアクティブ療法：症状改善後も週2-3回の外用を継続。再燃予防のため自己判断で中止しない。徐々に週1回→隔週と間隔を延長。",cat:"患者指導"},
{title:"ステロイド漸減",text:"ステロイド漸減：\n1-2週目：1日2回\n3-4週目：1日1回\n5-6週目：2日に1回\n以降：週2-3回（プロアクティブ療法へ移行）",cat:"患者指導"},
{title:"抗ヒス内服指導",text:"抗ヒスタミン薬：毎日決まった時間に服用。症状なくても自己判断で中止せず継続。眠気あれば就寝前に服用。",cat:"患者指導"},
{title:"帯状疱疹指導",text:"帯状疱疹指導：抗ウイルス薬5-7日間確実に内服。水疱は清潔に保ち破らない。疼痛持続時は早めに相談。水痘未罹患の乳幼児・妊婦との接触を避ける。",cat:"患者指導"},
{title:"術後注意（縫合）",text:"術後注意（縫合創）：\n・当日は安静、飲酒・激しい運動控える\n・翌日からシャワー可（洗浄後、軟膏+ガーゼ保護）\n・湯船は抜糸まで不可\n・出血時は清潔なガーゼで圧迫し連絡\n・抜糸予定：　日後",cat:"術後注意"},
{title:"術後注意（切開）",text:"術後注意（切開排膿後）：\n・毎日シャワーで洗浄→軟膏+ガーゼ交換\n・膿や浸出液は正常な経過\n・発熱・腫れ拡大時は早めに受診\n・抗生剤は最後まで内服",cat:"術後注意"},
{title:"施術後（レーザー）",text:"施術後注意（レーザー）：\n・赤み腫れは数日で改善\n・24h洗顔・化粧控える\n・かさぶたを剥がさない\n・日焼け止め必須\n・保湿十分に\n・こすらない（色素沈着予防）",cat:"術後注意"},
{title:"施術後（IPL）",text:"施術後注意（ノーリス/IPL）：\n・シミが一時的に濃くなる→1-2wで剥がれる\n・当日から洗顔メイク可\n・日焼け止め必須\n・1w刺激の強い化粧品を避ける",cat:"術後注意"},
{title:"施術後（ポテンツァ）",text:"施術後注意（ポテンツァ）：\n・赤み腫れ点状出血→2-3日で改善\n・当日洗顔メイク不可、翌日から可\n・24h飲酒・運動・入浴控える\n・日焼け止め必須",cat:"術後注意"},
{title:"施術後（ピーリング）",text:"施術後注意（ピーリング）：\n・当日から洗顔メイク可\n・数日間皮むけ乾燥あり\n・保湿十分に・日焼け止め必須\n・1wスクラブ使用不可",cat:"術後注意"},
{title:"ゼオスキン開始",text:"ゼオスキンヘルス開始\nコース：\n製品：\n注意：A反応（赤み皮むけ乾燥）は2-6wで改善。日焼け止め必須。妊娠授乳中はトレチノイン使用不可。",cat:"その他"},
{title:"イソトレチノイン",text:"イソトレチノイン内服開始　mg/日\n注意：避妊必須（女性：前1M〜後1M）、献血不可、定期血液検査（肝機能・脂質）、保湿（唇・皮膚・眼の乾燥対策）\n次回血液検査：4w後",cat:"その他"},
{title:"帯状疱疹ワクチン",text:"帯状疱疹ワクチン（シングリックス）説明：\n・不活化ワクチン、2回接種（2ヶ月間隔）\n・予防効果90%以上、50歳以上対象\n・接種部位の痛み腫れは数日で改善",cat:"その他"},
];
const[snippets,setSnippets]=useState(DEFAULT_SNIPPETS),[newSnTitle,setNewSnTitle]=useState(""),[newSnText,setNewSnText]=useState(""),[pipSnippets,setPipSnippets]=useState([0,1,2,3,4]);
const[snCatOpen,setSnCatOpen]=useState(null);
const[docDisease,setDocDisease]=useState(""),[docOut,setDocOut]=useState(""),[docLd,setDocLd]=useState(false),[docFreePrompt,setDocFreePrompt]=useState("");
const[suggestLd,setSuggestLd]=useState(false),[suggestedSnippets,setSuggestedSnippets]=useState([]);
const[pastInput,setPastInput]=useState(""),[pastDisease,setPastDisease]=useState(""),[pastSource,setPastSource]=useState(""),[pastLd,setPastLd]=useState(false),[pastCount,setPastCount]=useState(0),[pastMsg,setPastMsg]=useState("");
const[csOut,setCsOut]=useState(""),[csLd,setCsLd]=useState(false),[csMode,setCsMode]=useState("full"),[csTx,setCsTx]=useState(""),[csCount,setCsCount]=useState(0);
// 書き起こし選択時に引き継ぐ患者ID・元書き起こし日時（手動入力時は空＝ラベル非表示）
const[csSourcePatientId,setCsSourcePatientId]=useState(""),[csSourceDate,setCsSourceDate]=useState("");
const[csScores,setCsScores]=useState({}),[csAiModel,setCsAiModel]=useState(""),[csSaving,setCsSaving]=useState(false),[csSaveMsg,setCsSaveMsg]=useState(""),[csUsage,setCsUsage]=useState(null);
const[csHistory,setCsHistory]=useState([]),[csShowHistory,setCsShowHistory]=useState(false),[csHistoryLd,setCsHistoryLd]=useState(false);
const[csModel,setCsModel]=useState("gemini-3-pro");
const[csModels,setCsModels]=useState(["gemini-3-pro","gemini-3-5-flash","claude"]);
const[csResults,setCsResults]=useState([]);
const[csCompareTab,setCsCompareTab]=useState("all");
const[csPickOpen,setCsPickOpen]=useState(false),[csPickList,setCsPickList]=useState([]),[csPickLoading,setCsPickLoading]=useState(false),[csPickSearch,setCsPickSearch]=useState("");
useEffect(()=>{try{
  const sm=localStorage.getItem("mk_csModels");
  if(sm){
    const arr=JSON.parse(sm);
    if(Array.isArray(arr)&&arr.length>0){
      const valid=arr.filter(x=>x==="gemini-3-pro"||x==="gemini-3-5-flash"||x==="claude");
      if(valid.length>0){setCsModels(valid);setCsModel(valid[0]);return}
    }
  }
  const s=localStorage.getItem("mk_csModel");
  if(s==="gemini-3-pro"||s==="claude"){setCsModel(s);setCsModels([s]);localStorage.setItem("mk_csModels",JSON.stringify([s]))}
  else if(s==="gemini"||s==="gemini-pro"){const def=["gemini-3-pro","gemini-3-5-flash","claude"];setCsModel(def[0]);setCsModels(def);localStorage.setItem("mk_csModels",JSON.stringify(def));localStorage.removeItem("mk_csModel")}
}catch{}},[]);
const csModelLabel=(m)=>{
  if(!m)return"Gemini 2.5 Pro";
  // 既に整形済みのラベルが渡された場合はそのまま返す（履歴の ai_model 互換）
  if(/^(Gemini |Claude )/i.test(m))return m;
  const s=String(m).toLowerCase();
  // 内部キー
  if(s==="gemini-3-pro")return"Gemini 3.1 Pro";
  if(s==="claude")return"Claude Sonnet 4.6";
  if(s==="gemini-pro")return"Gemini 2.5 Pro";
  if(s==="gemini-3-5-flash")return"Gemini 3.5 Flash";
  if(s==="gemini")return"Gemini 3.5 Flash";
  // API応答の実モデル名（最新版優先）
  if(s.includes("claude"))return"Claude Sonnet 4.6";
  if(s.includes("3.1-pro")||s.includes("3-pro-preview")||s.includes("gemini-3-pro"))return"Gemini 3.1 Pro";
  if(s.includes("3.5-flash")||s.includes("3-5-flash")||s.includes("3.5flash"))return"Gemini 3.5 Flash";
  if(s.includes("2.5-pro")||s.includes("2.0-pro"))return"Gemini 2.5 Pro";
  if(s.includes("2.5-flash")||s.includes("2-5-flash")||s.includes("2.0-flash"))return"Gemini 2.5 Flash";
  if(s.includes("flash"))return"Gemini 3.5 Flash";
  if(s.includes("whisper"))return"Whisper";
  return m;
};
const csModelSubLabel=(m)=>{
  if(!m)return"";
  const s=String(m).toLowerCase();
  if(s==="gemini-3-pro"||s.includes("3.1-pro"))return"最新・最高精度 ⭐";
  if(s==="claude"||s.includes("claude"))return"日本語精度";
  if(s==="gemini-pro"||s.includes("2.5-pro"))return"バランス型";
  if(s==="gemini-3-5-flash"||s==="gemini"||s.includes("3.5-flash")||s.includes("3-5-flash"))return"最新・超高速 ✨";
  if(s.includes("2.5-flash")||s.includes("2-5-flash"))return"高速";
  return"";
};
const csModelColorByLabel=(model)=>{const lbl=csModelLabel(model);if(lbl==="Claude Sonnet 4.6")return"#d97706";if(lbl==="Gemini 3.1 Pro")return"#9333ea";if(lbl==="Gemini 3.5 Flash")return"#10b981";if(lbl==="Gemini 2.5 Flash")return"#10b981";return"#4285f4"};
// 生成モデル名バッジ（csModelLabel で表示名に変換、内部キーは露出させない）
const modelBadge=(model)=>{if(!model)return null;const col=csModelColorByLabel(model);return(<span style={{display:"inline-block",fontSize:11,fontWeight:600,color:col,background:col+"18",border:`1px solid ${col}55`,borderRadius:6,padding:"1px 8px",marginLeft:8,verticalAlign:"middle",whiteSpace:"nowrap"}}>{csModelLabel(model)}</span>)};
const csModelDesc=(m)=>m==="gemini-3-pro"?"最新・最高精度 ⭐":m==="claude"?"日本語精度":"バランス型";
const csModelColor=(m)=>m==="gemini-3-pro"?"#9333ea":m==="claude"?"#d97706":"#4285f4";
const csAbortRef=useRef(null);
const toggleCsModel=(m)=>{
  setCsModels(prev=>{
    let next;
    if(prev.includes(m)){
      if(prev.length===1){sSt("⚠️ 少なくとも1つのモデルを選択してください");return prev}
      next=prev.filter(x=>x!==m);
    }else{next=[...prev,m]}
    try{localStorage.setItem("mk_csModels",JSON.stringify(next))}catch{}
    setCsModel(next[0]);
    return next;
  });
};
const undoRef=useRef(null);
const shortcutsRef=useRef(shortcuts);
const loadCsCount=async()=>{if(!supabase)return;try{const{count}=await supabase.from("counseling_records").select("*",{count:"exact",head:true});setCsCount(count||0)}catch{}};
useEffect(()=>{loadCsCount()},[]);

// Keyboard shortcuts
const startRef=useRef(null),stopRef=useRef(null),sumRef=useRef(null),clrRef=useRef(null),undoFnRef=useRef(null),pipFnRef=useRef(null);
const escapeRef=useRef(null);
useEffect(()=>{
const handler=(e)=>{
if(e.key==="Escape"){e.preventDefault();if(escapeRef.current)escapeRef.current();return}
const tag=document.activeElement?.tagName;
if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"){
if(e.key==="ArrowDown"||e.key==="ArrowUp"||e.key==="ArrowLeft"||e.key==="ArrowRight")e.preventDefault();
return;
}
const key=e.key;const ctrl=e.ctrlKey||e.metaKey;
const findSC=(id)=>shortcutsRef.current.find(s=>s.id===id);
const matchKey=(sc)=>{
if(!sc||!sc.enabled)return false;
const k=sc.key;
if(k.startsWith("Ctrl+")){return ctrl&&key===k.replace("Ctrl+","");}
if(k.startsWith("Alt+")){return e.altKey&&key===k.replace("Alt+","");}
return key===k;
};
const scs=[
{id:"rec",fn:()=>{if(rsRef.current==="recording"){if(stopRef.current)stopRef.current()}else{if(startRef.current)startRef.current()}}},
{id:"sum",fn:()=>{if(sumRef.current)sumRef.current()}},
{id:"clear",fn:()=>{if(typeof saveUndo==="function")saveUndo();sInp("");sOut("");sSt("クリアしました")}},
{id:"next",fn:()=>{if(clrRef.current)clrRef.current()}},
{id:"copy",fn:()=>{if(out){try{navigator.clipboard.writeText(out);sSt("📋 コピーしました")}catch{}}}},
{id:"pip",fn:()=>{if(pipFnRef.current)pipFnRef.current()}},
{id:"doc",fn:()=>setPage("doc")},
{id:"counsel",fn:()=>setPage("counsel")},
{id:"undo",fn:()=>{if(undoFnRef.current)undoFnRef.current()}},
{id:"room1",fn:()=>sRid("r1")},{id:"room2",fn:()=>sRid("r2")},{id:"room3",fn:()=>sRid("r3")},
{id:"room4",fn:()=>sRid("r4")},{id:"room5",fn:()=>sRid("r5")},{id:"room6",fn:()=>sRid("r6")},
{id:"room7",fn:()=>sRid("r7")},
];
for(const sc of scs){
const cfg=findSC(sc.id);
if(matchKey(cfg)){e.preventDefault();sc.fn();return;}
}
};
window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler)},[out,shortcuts]);
const[minTitle,setMinTitle]=useState("");
const[minHist,setMinHist]=useState([]);
const[minHistTotal,setMinHistTotal]=useState(0);
const[tasks,setTasks]=useState([]);
const[staffList,setStaffList]=useState([]);
const[selMinutes,setSelMinutes]=useState([]);
const[taskView,setTaskView]=useState("matrix");
const[taskAnalysis,setTaskAnalysis]=useState("");
const[taskAnalLd,setTaskAnalLd]=useState(false);
const[openMinId,setOpenMinId]=useState(null);
const[editMinId,setEditMinId]=useState(null);
const[editMinText,setEditMinText]=useState("");
const[editMinTitle,setEditMinTitle]=useState("");
const[editMinSaving,setEditMinSaving]=useState(false);
// 議事録履歴の「書き起こし全文」編集用（本文編集editMin*と同じ操作感、保存先はminutes.input_text）
const[editMinTxId,setEditMinTxId]=useState(null);
const[editMinTxText,setEditMinTxText]=useState("");
const[editMinTxSaving,setEditMinTxSaving]=useState(false);
const[manualMinText,setManualMinText]=useState("");
const[manualMinTitle,setManualMinTitle]=useState("");
const[manualMinMode,setManualMinMode]=useState("text");
const[mergeLd,setMergeLd]=useState(false);
const[openTaskIds,setOpenTaskIds]=useState(new Set());
const[selRoles,setSelRoles]=useState(["director","manager","leader","staff"]);
const[matrixHistOpen,setMatrixHistOpen]=useState(true);
const[selMatrixDate,setSelMatrixDate]=useState(null);
const[selTaskIds,setSelTaskIds]=useState(new Set());
const[matrixMode,setMatrixMode]=useState("collapse");
const[openQuadrant,setOpenQuadrant]=useState(null);
const[todos,setTodos]=useState([]);
const[todoLd,setTodoLd]=useState(false);
const[minRS,setMinRS]=useState("inactive"),[minInp,setMinInp]=useState(""),[minOut,setMinOut]=useState(""),[minLd,setMinLd]=useState(false),[minEl,setMinEl]=useState(0),[minPrompt,setMinPrompt]=useState("");
const[minOutFontSize,setMinOutFontSize]=useState(14);
const[minOutHeight,setMinOutHeight]=useState(300);
// 議事録の書き起こし欄の高さ(px)。小=120(従来)/中=240(既定)/大=480。localStorageで永続化
const[minTaHeight,setMinTaHeight]=useState(240);
useEffect(()=>{try{const v=parseInt(localStorage.getItem("mk_minTranscriptHeight"));if([120,240,480].includes(v))setMinTaHeight(v)}catch{}},[]);
const[minutesGenModel,setMinutesGenModel]=useState("");
const[minTruncated,setMinTruncated]=useState(false);
const[minChunkSummaries,setMinChunkSummaries]=useState([]);
const[minFinalIntegrationFailed,setMinFinalIntegrationFailed]=useState(false);
const[minFinalIntegrationError,setMinFinalIntegrationError]=useState("");
const[minHistFontSize,setMinHistFontSize]=useState(13);
const[minHistHeight,setMinHistHeight]=useState(500);
const[minTypoLd,setMinTypoLd]=useState(false);
const[minDraftId,setMinDraftId]=useState(null);
const minDraftIdRef=useRef(null);
const updateMinDraftId=(id)=>{setMinDraftId(id);minDraftIdRef.current=id;};
const lastSavedMinInpRef=useRef("");
const lastSavedMinOutRef=useRef("");
const[unsavedMinModal,setUnsavedMinModal]=useState(false);
const[minSavingNext,setMinSavingNext]=useState(false);
const[minAutoSaving,setMinAutoSaving]=useState(false);
const minAutoSaveRef=useRef(null);
const[minAudioSave,setMinAudioSave]=useState(false);
const minAllAudioChunks=useRef([]);
// 議事録削除確認モーダル（null=非表示, {ids,count,hasAudio}=表示）
const[minDeleteConfirm,setMinDeleteConfirm]=useState(null);
const[minDeleting,setMinDeleting]=useState(false);
// === セミナー学習機能 state ===
const[smnMode,setSmnMode]=useState("record"); // 'record' | 'paste'
const[smnRS,setSmnRS]=useState("inactive"); // 'inactive' | 'recording' | 'paused'
const[smnEl,setSmnEl]=useState(0);
const[smnTitle,setSmnTitle]=useState("");
const[smnTranscript,setSmnTranscript]=useState("");
const[smnSummary,setSmnSummary]=useState("");
const[smnSummaryLoading,setSmnSummaryLoading]=useState(false);
const[smnSummaryModel,setSmnSummaryModel]=useState("gemini-3-5-flash");
const[smnSummaryModelUsed,setSmnSummaryModelUsed]=useState("");
const[smnGensparkText,setSmnGensparkText]=useState("");
const[smnGensparkLoading,setSmnGensparkLoading]=useState(false);
const[smnInsights,setSmnInsights]=useState("");
const[smnInsightsLoading,setSmnInsightsLoading]=useState(false);
const[smnHistOpen,setSmnHistOpen]=useState(false);
const[smnHistList,setSmnHistList]=useState([]);
// セミナー保存済み状態（保存完了で true、内容変更で false）
const[smnSaved,setSmnSaved]=useState(false);
// R-3: セミナー音声保存切替
const[smnAudioSave,setSmnAudioSave]=useState(()=>{if(typeof window==="undefined")return false;try{return localStorage.getItem("mk_smnAudioSave")==="true"}catch{return false}});
// === D-1〜D-3 複数選択削除モード state ===
const[csSelectMode,setCsSelectMode]=useState(false);
const[csSelectedIds,setCsSelectedIds]=useState(new Set());
const[journeySelectMode,setJourneySelectMode]=useState(false);
const[journeySelectedIds,setJourneySelectedIds]=useState(new Set());
const[smnSelectMode,setSmnSelectMode]=useState(false);
const[smnSelectedIds,setSmnSelectedIds]=useState(new Set());
const smnMR=useRef(null);
const smnSR=useRef(null);
const smnTR=useRef(null);
// R-3: 音声保存用
const smnAllAudioChunksRef=useRef([]);
const smnAudioPathRef=useRef(null);
// restore中フラグ: 復元時の内容変更で smnSaved を false に戻さないため
const smnRestoringRef=useRef(false);
const smnTextRef=useRef("");
useEffect(()=>{smnTextRef.current=smnTranscript},[smnTranscript]);
const[audioSave,setAudioSave]=useState(false),[audioChunks,setAudioChunks]=useState([]),[savedMsg,setSavedMsg]=useState("");
const[audioSaveNote,setAudioSaveNote]=useState(null);// 音声保存の成否表示（無言失敗の可視化）
const[audioList,setAudioList]=useState([]),[audioListLoading,setAudioListLoading]=useState(false),[audioSignedUrls,setAudioSignedUrls]=useState({}),[audioListMsg,setAudioListMsg]=useState("");
const[selectedAudios,setSelectedAudios]=useState(new Set()),[audioDeleting,setAudioDeleting]=useState(false);
const[mp3Converting,setMp3Converting]=useState({}); // {[path]: "loading"|"converting"|"done"|null}
const[apiUsageMonth,setApiUsageMonth]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`});
const[apiUsageSummary,setApiUsageSummary]=useState(null),[apiUsageMonthly,setApiUsageMonthly]=useState([]),[apiUsageTop10,setApiUsageTop10]=useState([]),[apiUsageLoading,setApiUsageLoading]=useState(false);
const[apiUsageDaily,setApiUsageDaily]=useState([]);
const[csvPeriod,setCsvPeriod]=useState("current_month"),[csvExporting,setCsvExporting]=useState(false);
const[budgetJpy,setBudgetJpy]=useState(0),[currentMonthJpy,setCurrentMonthJpy]=useState(0);
useEffect(()=>{try{const v=localStorage.getItem("mk_apiBudgetJpy");if(v)setBudgetJpy(Number(v)||0)}catch{}},[]);

const loadApiUsageStats=async()=>{
  if(!supabase)return;
  setApiUsageLoading(true);
  try{
    const[y,m]=apiUsageMonth.split("-").map(Number);
    const startD=new Date(y,m-1,1);
    const endD=new Date(y,m,1);
    const start=startD.toISOString();
    const end=endD.toISOString();
    const{data:summaryRows}=await supabase.from("api_usage_logs").select("model_family,cost_jpy,total_tokens").gte("created_at",start).lt("created_at",end);
    const byFamily={};let totalJpy=0,totalCount=0,totalTokens=0;
    (summaryRows||[]).forEach(r=>{const f=r.model_family||"unknown";byFamily[f]=(byFamily[f]||0)+Number(r.cost_jpy||0);totalJpy+=Number(r.cost_jpy||0);totalTokens+=Number(r.total_tokens||0);totalCount++});
    setApiUsageSummary({totalJpy:Math.round(totalJpy*100)/100,totalCount,totalTokens,byFamily});
    const monthly=[];
    for(let i=5;i>=0;i--){
      const d=new Date(y,m-1-i,1);
      const ms=d.toISOString();
      const me=new Date(d.getFullYear(),d.getMonth()+1,1).toISOString();
      const{data:rs}=await supabase.from("api_usage_logs").select("cost_jpy").gte("created_at",ms).lt("created_at",me);
      const sum=(rs||[]).reduce((s,x)=>s+Number(x.cost_jpy||0),0);
      monthly.push({month:`${d.getMonth()+1}月`,yearMonth:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,jpy:Math.round(sum*100)/100});
    }
    setApiUsageMonthly(monthly);
    const{data:routes}=await supabase.from("api_usage_logs").select("route,cost_jpy").gte("created_at",start).lt("created_at",end);
    const routeMap={};
    (routes||[]).forEach(r=>{const k=r.route||"unknown";if(!routeMap[k])routeMap[k]={count:0,jpy:0};routeMap[k].count++;routeMap[k].jpy+=Number(r.cost_jpy||0)});
    const top10=Object.entries(routeMap).map(([route,v])=>({route,count:v.count,jpy:Math.round(v.jpy*100)/100})).sort((a,b)=>b.jpy-a.jpy).slice(0,10);
    setApiUsageTop10(top10);
    // 4. 日別推移（選択中の月）
    const daysInMonth=new Date(y,m,0).getDate();
    const{data:dailyRaw}=await supabase.from("api_usage_logs").select("created_at,cost_jpy").gte("created_at",start).lt("created_at",end);
    const dailyMap={};for(let d=1;d<=daysInMonth;d++)dailyMap[d]=0;
    (dailyRaw||[]).forEach(r=>{const d=new Date(r.created_at);const dayJST=new Date(d.getTime()+9*60*60*1000).getUTCDate();dailyMap[dayJST]=(dailyMap[dayJST]||0)+Number(r.cost_jpy||0)});
    const now2=new Date();const isCurrentMonth=y===now2.getFullYear()&&m===now2.getMonth()+1;
    const lastDay=isCurrentMonth?now2.getDate():daysInMonth;
    const daily=[];for(let d=1;d<=lastDay;d++)daily.push({day:`${d}日`,dayNum:d,jpy:Math.round((dailyMap[d]||0)*100)/100});
    setApiUsageDaily(daily);
  }catch(e){console.error("[apiUsageStats] error:",e)}
  finally{setApiUsageLoading(false)}
};
useEffect(()=>{if(page==="settings")loadApiUsageStats()},[page,apiUsageMonth]);

const loadCurrentMonthTotal=async()=>{
  if(!supabase)return;
  try{
    const now=new Date();
    const start=new Date(now.getFullYear(),now.getMonth(),1).toISOString();
    const end=new Date(now.getFullYear(),now.getMonth()+1,1).toISOString();
    const{data}=await supabase.from("api_usage_logs").select("cost_jpy").gte("created_at",start).lt("created_at",end);
    const sum=(data||[]).reduce((s,x)=>s+Number(x.cost_jpy||0),0);
    setCurrentMonthJpy(Math.round(sum*100)/100);
  }catch(e){console.error("[currentMonthTotal] error:",e)}
};
useEffect(()=>{loadCurrentMonthTotal();const t=setInterval(loadCurrentMonthTotal,5*60*1000);return()=>clearInterval(t)},[]);

const exportApiUsageCsv=async()=>{
  if(!supabase){sSt("⚠️ 接続先未設定です");return}
  setCsvExporting(true);
  try{
    const now=new Date();
    let startDt=null,endDt=null;
    if(csvPeriod==="current_month"){startDt=new Date(now.getFullYear(),now.getMonth(),1);endDt=new Date(now.getFullYear(),now.getMonth()+1,1)}
    else if(csvPeriod==="last_month"){startDt=new Date(now.getFullYear(),now.getMonth()-1,1);endDt=new Date(now.getFullYear(),now.getMonth(),1)}
    else if(csvPeriod==="last_3_months"){startDt=new Date(now.getFullYear(),now.getMonth()-2,1);endDt=new Date(now.getFullYear(),now.getMonth()+1,1)}
    let q=supabase.from("api_usage_logs").select("created_at,route,model,model_family,context,input_tokens,output_tokens,total_tokens,cost_usd,cost_jpy,success,request_meta").order("created_at",{ascending:false}).limit(10000);
    if(startDt)q=q.gte("created_at",startDt.toISOString());
    if(endDt)q=q.lt("created_at",endDt.toISOString());
    const{data,error}=await q;
    if(error)throw error;
    if(!data||data.length===0){sSt("⚠️ 対象期間のデータがありません");return}
    const headers=["日時(JST)","ルート","モデル","ファミリ","コンテキスト","入力tokens","出力tokens","合計tokens","料金USD","料金JPY","成功","メタ情報"];
    const rows=data.map(r=>{
      const dt=new Date(r.created_at).toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});
      const meta=r.request_meta?JSON.stringify(r.request_meta):"";
      return[dt,r.route||"",r.model||"",r.model_family||"",r.context||"",r.input_tokens||0,r.output_tokens||0,r.total_tokens||0,r.cost_usd||0,r.cost_jpy||0,r.success?"成功":"失敗",meta];
    });
    const escapeCsv=v=>`"${String(v).replace(/"/g,'""')}"`;
    const csvText=[headers.map(escapeCsv).join(","),...rows.map(row=>row.map(escapeCsv).join(","))].join("\r\n");
    const bom="﻿";
    const blob=new Blob([bom+csvText],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const periodLabel={current_month:"current",last_month:"last",last_3_months:"last3m",all_time:"all"}[csvPeriod]||"export";
    const todayStr=new Date().toISOString().slice(0,10);
    const a=document.createElement("a");a.href=url;a.download=`api-usage-${periodLabel}-${todayStr}.csv`;document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    sSt(`✓ ${data.length}件のデータをCSV出力しました`);
  }catch(e){console.error("[csv export] error:",e);sSt("⚠️ CSV出力に失敗しました: "+e.message)}
  finally{setCsvExporting(false)}
};
const generateMonthOptions=(monthsBack=12)=>{const opts=[];const now=new Date();for(let i=0;i<monthsBack;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;const label=`${d.getFullYear()}年${d.getMonth()+1}月`;opts.push({ym,label})}return opts};
const[asrEngine,setAsrEngine]=useState("whisper");
// iOS/iPadOS 判定: iOS Safari の10秒チャンクmp4はヘッダ不完全でAvalonがデコード不可(400)。
// → iOSではAvalon/両方比較を選んでもWhisperで書き起こす（方針B）。録音コアは不変。
const[isIOSDevice,setIsIOSDevice]=useState(false);
// 無音チャンクのスキップ用しきい値(RMS)。診察室の環境音に合わせ設定で調整可。既定は安全側(低め)。
const[silenceThreshold,setSilenceThreshold]=useState(0.01);
const silenceThrRef=useRef(0.01);
useEffect(()=>{silenceThrRef.current=silenceThreshold},[silenceThreshold]);
const silenceCtxRef=useRef(null);
const[cleaningTx,setCleaningTx]=useState(false);
// 緊急バイパス: 無音スキップ誤爆で書き起こしが止まった場合、設定トグルでlvゲート・無音判定を丸ごと無効化できる保険。
const disableSilenceSkipRef=useRef(false);
const[disableSilenceSkip,setDisableSilenceSkip]=useState(false);
useEffect(()=>{try{const v=localStorage.getItem("mk_disableSilenceSkip")==="1";disableSilenceSkipRef.current=v;setDisableSilenceSkip(v)}catch{}},[]);
useEffect(()=>{disableSilenceSkipRef.current=disableSilenceSkip},[disableSilenceSkip]);
// チャンク診断カウンタ: どの段階でチャンクが消えているかの見える化（計測のみ・フロー非干渉）。
const[diagCnt,setDiagCnt]=useState({rec:0,lv:0,sil:0,sent:0,ok:0,err:0});
const[diagErr,setDiagErr]=useState("");
const[diagLastLen,setDiagLastLen]=useState(null); // 直近の応答テキスト文字数（「届いているが空」の検出用）
const[diagMR,setDiagMR]=useState(""); // MediaRecorderのmimeType/state/直近チャンクサイズ
// updater内(レンダー時実行)の例外もページを壊さないよう、値アクセスはすべてフォールバック付き。
const bumpDiag=(k)=>{try{setDiagCnt(p=>({...(p||{}),[k]:(((p||{})[k])||0)+1}))}catch{}};
const noteDiagMR=(mr,size)=>{try{setDiagMR(`${(mr&&mr.mimeType)||"?"} / ${(mr&&mr.state)||"?"} / ${(size!=null?size:"?")}B`)}catch{}};
const DiagRow=({active})=>{
try{
const c=diagCnt||{};
const n=(v)=>(typeof v==="number"?v:0);
if(!active&&n(c.rec)<=0)return null;
return(
<div style={{fontSize:10,color:"#6b7280",background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8,padding:"4px 10px",marginBottom:8,fontVariantNumeric:"tabular-nums",lineHeight:1.6}}>
<div>📊 チャンク: 録音 {n(c.rec)} ／ ゲート通過 {n(c.lv)} ／ 無音判定通過 {n(c.sil)} ／ 送信 {n(c.sent)} ／ 応答OK {n(c.ok)}{typeof diagLastLen==="number"?`（直近${diagLastLen}字）`:""} ／ エラー {n(c.err)}{diagErr?<span style={{color:"#dc2626"}}>　⚠ {String(diagErr)}</span>:null}</div>
{diagMR?<div>🎛 MR: {String(diagMR)}</div>:null}
</div>
);
}catch{return null}
};
// === 書き起こし自動保存・復元（充電切れ・誤クローズ対策）===
// 書き起こしフローには一切割り込まない独立レイヤ。保存/復元の失敗は console.warn のみで握り、録音・書き起こしに影響させない。
const[recoverySessions,setRecoverySessions]=useState([]);
const[autosaveAt,setAutosaveAt]=useState({exam:null,minutes:null,seminar:null});
const examSessionIdRef=useRef(null);
const minSessionIdRef=useRef(null);
const smnSessionIdRef=useRef(null);
const restoreTranscriptSession=(session)=>{try{
if(!session)return;
if(session.mode==="exam"){examSessionIdRef.current=session.sessionId;sInp(String(session.text||""))}
else if(session.mode==="minutes"){minSessionIdRef.current=session.sessionId;setMinInp(String(session.text||""))}
else if(session.mode==="seminar"){smnSessionIdRef.current=session.sessionId;setSmnTranscript(String(session.text||""))}
setRecoverySessions(prev=>(prev||[]).filter(s=>s&&s.sessionId!==session.sessionId));
sSt("✓ 書き起こしを復元しました");
}catch(e){console.warn("[autosave] restore error:",e)}};
const discardTranscriptSession=(session)=>{try{
if(!session)return;
if(!window.confirm("この書き起こしの復元データを破棄しますか？"))return;
deleteTranscriptSession(session.sessionId);
setRecoverySessions(prev=>(prev||[]).filter(s=>s&&s.sessionId!==session.sessionId));
}catch(e){console.warn("[autosave] discard error:",e)}};
// 復元バナー(防御的レンダリング: 例外時はnull=非表示に留め、ページを壊さない)
const RecoveryBanner=({mode})=>{
try{
const list=(recoverySessions||[]).filter(s=>s&&s.mode===mode&&typeof s.text==="string");
if(!list.length)return null;
return(<>{list.map(s=>{
let when="";try{when=new Date(s.updatedAt||0).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}catch{}
return(
<div key={String(s.sessionId)} style={{marginBottom:8,padding:"10px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
<span style={{fontSize:12,color:"#92400e",fontWeight:600}}>⚠️ 前回の書き起こしが途中で終了しています（{when}・約{(s.text||"").length}文字）</span>
<div style={{display:"flex",gap:6}}>
<button onClick={()=>restoreTranscriptSession(s)} style={{padding:"5px 14px",borderRadius:8,border:"none",background:"#f59e0b",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>復元する</button>
<button onClick={()=>discardTranscriptSession(s)} style={{padding:"5px 14px",borderRadius:8,border:"1px solid #f59e0b",background:"#fff",color:"#92400e",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>破棄</button>
</div>
</div>
);})}</>);
}catch{return null}
};
// 分割補正の進捗（{cur,total}）と、補正取り消し用の退避（{apply,original,key}）。元テキストを失わないための保護。
const[cleanProg,setCleanProg]=useState(null);
const[undoClean,setUndoClean]=useState(null);
// チャンクがほぼ無音か判定（WebAudioでRMS算出）。判定失敗時は「送る」側に倒す（書き起こしを止めない）。
const isSilentChunk=async(blob)=>{if(disableSilenceSkipRef.current)return false;try{if(!blob||blob.size<300)return true;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;if(!silenceCtxRef.current||silenceCtxRef.current.state==="closed"){silenceCtxRef.current=new AC()}const ctx=silenceCtxRef.current;const buf=await blob.arrayBuffer();const audio=await ctx.decodeAudioData(buf);const data=audio.getChannelData(0);let sum=0;for(let i=0;i<data.length;i++){sum+=data[i]*data[i]}const rms=Math.sqrt(sum/data.length);return rms<silenceThrRef.current}catch{return false}};
// 1ブロックをGeminiで補正（捏造除去＋皮膚科用語の文脈補正）。要約ではない。失敗時は元テキストを返す。
const cleanOneBlock=async(text)=>{try{if(!text||!text.trim())return text;const r=await fetch("/api/transcript-clean",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});if(!r.ok)return text;const d=await r.json();return(d&&typeof d.text==="string"&&d.text.trim())?d.text:text}catch{return text}};
// 長文を行境界で安全なサイズ（既定2500字）に分割。文を途中で割らない（Geminiの出力上限での途中欠落を防ぐため）。
const splitForClean=(text,maxChars=2500)=>{const lines=String(text).split("\n");const blocks=[];let cur="";for(const ln of lines){if(cur&&(cur.length+ln.length+1)>maxChars){blocks.push(cur);cur=ln}else{cur=cur?cur+"\n"+ln:ln}}if(cur)blocks.push(cur);return blocks.length?blocks:[String(text)];};
// 分割補正：各ブロックを順に補正して結合。全文を保持（要約・省略しない）。途中欠落を防ぐ本命対処。進捗はonProgressで通知。
const cleanTranscript=async(text,onProgress)=>{if(!text||!text.trim())return text;const blocks=splitForClean(text);const out=[];for(let i=0;i<blocks.length;i++){if(onProgress)onProgress(i+1,blocks.length);out.push(await cleanOneBlock(blocks[i]))}return out.join("\n");};
// 手動補正（書き起こし欄横の「✨補正」ボタンから）。apply で各画面のstateに反映。補正前テキストはundoCleanに退避し「↩元に戻す」で復元可能。
const manualClean=async(text,apply,key)=>{if(!text||!text.trim()||cleaningTx)return;setCleaningTx(true);setUndoClean(null);setCleanProg({cur:0,total:0});try{const c=await cleanTranscript(text,(cur,total)=>setCleanProg({cur,total}));if(c&&typeof c==="string"){apply(c);setUndoClean({apply,original:text,key})}}finally{setCleaningTx(false);setCleanProg(null)}};
// 補正ボタンのラベル（分割時は「補正中… 3/8」と進捗表示）。idleは非補正時の文言。
const cleanBtnLabel=(idle)=>cleaningTx?(cleanProg&&cleanProg.total>1?`⏳ 補正中… ${cleanProg.cur}/${cleanProg.total}`:"⏳ 補正中..."):idle;
// 「↩元に戻す」ボタン（直前の補正のkeyが一致するときのみ表示）。補正前の全文を即復元する。
const undoCleanBtn=(key)=>(undoClean&&undoClean.key===key&&!cleaningTx)?<button type="button" onClick={()=>{undoClean.apply(undoClean.original);setUndoClean(null)}} title="補正を取り消して元の書き起こしに戻す" style={{marginLeft:8,fontSize:12,color:"#6b7280",background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>↩ 元に戻す</button>:null;
// 「両方比較」A/B検証用（議事録）: Whisper / Avalon の累積結果・累積所要時間・フォールバック通知
const[abWhisper,setAbWhisper]=useState(""),[abAvalon,setAbAvalon]=useState(""),[abWhisperMs,setAbWhisperMs]=useState(0),[abAvalonMs,setAbAvalonMs]=useState(0),[abFallback,setAbFallback]=useState(false),[abAvalonError,setAbAvalonError]=useState(""),[abAvalonIOS,setAbAvalonIOS]=useState(false);
// 単独Avalonモードで Whisper に通知付きフォールバックした場合のお知らせ（理由つき）
const[avalonFellBack,setAvalonFellBack]=useState(false),[avalonFellBackReason,setAvalonFellBackReason]=useState("");
const[sessionAudioSave,setSessionAudioSave]=useState(null);
const[favorites,setFavorites]=useState([]),[favGroup,setFavGroup]=useState("保険"),[favModal,setFavModal]=useState(null),[favToast,setFavToast]=useState(""),[favDetailModal,setFavDetailModal]=useState(null),[favMoveModal,setFavMoveModal]=useState(null);
const[favSaveModal,setFavSaveModal]=useState(null);
const[selectedFavIds,setSelectedFavIds]=useState(new Set());
const[tooltip,setTooltip]=useState({text:"",x:0,y:0,visible:false});
const[favEditModal,setFavEditModal]=useState(null),[favEditTitle,setFavEditTitle]=useState(""),[favEditGroup,setFavEditGroup]=useState(""),[favEditContent,setFavEditContent]=useState("");
const[favGenModal,setFavGenModal]=useState(null),[favGenPurpose,setFavGenPurpose]=useState("患者向け説明文"),[favGenResult,setFavGenResult]=useState(""),[favGenLoading,setFavGenLoading]=useState(false);
const[caseSearch,setCaseSearch]=useState(""),[caseStudyModal,setCaseStudyModal]=useState(null),[caseStudyResult,setCaseStudyResult]=useState(""),[caseStudyLoading,setCaseStudyLoading]=useState(false);
const[qcModal,setQcModal]=useState(null),[qcResult,setQcResult]=useState(""),[qcLoading,setQcLoading]=useState(false);
const[rpInput,setRpInput]=useState(""),[rpResult,setRpResult]=useState(""),[rpLoading,setRpLoading]=useState(false),[rpHistory,setRpHistory]=useState([]),[rpCategory,setRpCategory]=useState("reception");
const[rpMaterialModal,setRpMaterialModal]=useState(false),[rpMaterialSize,setRpMaterialSize]=useState("A5"),[rpMaterialPrompt,setRpMaterialPrompt]=useState("");
const[rpStaffModal,setRpStaffModal]=useState(false),[rpStaffPrompt,setRpStaffPrompt]=useState("");
const[faqResult,setFaqResult]=useState(""),[faqLoading,setFaqLoading]=useState(false),[faqModal,setFaqModal]=useState(false);
const[menuResult,setMenuResult]=useState(""),[menuLoading,setMenuLoading]=useState(false),[menuModal,setMenuModal]=useState(false);
const[snsInput,setSnsInput]=useState(""),[snsPlatform,setSnsPlatform]=useState("Instagram"),[snsResult,setSnsResult]=useState(""),[snsLoading,setSnsLoading]=useState(false),[snsHistory,setSnsHistory]=useState([]);
const[satResult,setSatResult]=useState(""),[satLoading,setSatLoading]=useState(false);
const[kbResult,setKbResult]=useState(""),[kbLoading,setKbLoading]=useState(false),[kbMode,setKbMode]=useState(""),[kbFavGroup,setKbFavGroup]=useState("その他"),[kbModal,setKbModal]=useState(false);
const[calResult,setCalResult]=useState(""),[calLoading,setCalLoading]=useState(false),[calModal,setCalModal]=useState(false),[calFavGroup,setCalFavGroup]=useState("その他");
const[hpResult,setHpResult]=useState(""),[hpLoading,setHpLoading]=useState(false),[hpModal,setHpModal]=useState(false),[hpType,setHpType]=useState(""),[hpFavGroup,setHpFavGroup]=useState("その他");
const[trResult,setTrResult]=useState(""),[trLoading,setTrLoading]=useState(false),[trModal,setTrModal]=useState(false),[trType,setTrType]=useState(""),[trFavGroup,setTrFavGroup]=useState("その他"),[trCount,setTrCount]=useState(0);
const[pxResult,setPxResult]=useState(""),[pxLoading,setPxLoading]=useState(false),[pxModal,setPxModal]=useState(false),[pxType,setPxType]=useState(""),[pxFavGroup,setPxFavGroup]=useState("その他");
const[philResult,setPhilResult]=useState("");
const[philLoading,setPhilLoading]=useState(false);
const[philModal,setPhilModal]=useState(false);
const[personaResult,setPersonaResult]=useState("");
const[personaLoading,setPersonaLoading]=useState(false);
const[personaModal,setPersonaModal]=useState(false);
const[portfolioResult,setPortfolioResult]=useState("");
const[portfolioLoading,setPortfolioLoading]=useState(false);
const[portfolioModal,setPortfolioModal]=useState(false);
const[portfolioGroup,setPortfolioGroup]=useState("美容");
const[journeyResult,setJourneyResult]=useState("");
const[journeyLoading,setJourneyLoading]=useState(false);
const[journeyModal,setJourneyModal]=useState(false);
const[journeyMeta,setJourneyMeta]=useState(null); // {model, usage}
const[journeyModels,setJourneyModels]=useState(["gemini-3-pro","gemini-3-5-flash","claude"]);
const[journeyResults,setJourneyResults]=useState([]); // 並列実行用
const[journeyCompareTab,setJourneyCompareTab]=useState("all");
const[journeySaving,setJourneySaving]=useState(false),[journeySaveMsg,setJourneySaveMsg]=useState("");
const[journeyHistOpen,setJourneyHistOpen]=useState(false),[journeyHistList,setJourneyHistList]=useState([]),[journeyHistLoading,setJourneyHistLoading]=useState(false),[journeyHistSearch,setJourneyHistSearch]=useState("");
const journeyAbortRef=useRef(null);
useEffect(()=>{try{
  const s=localStorage.getItem("mk_journeyModels");
  // gemini-pro(Gemini 2.5 Pro)は選択肢から除外。既存ユーザーが選択中でもフィルタで落とす
  if(s){const arr=JSON.parse(s);if(Array.isArray(arr)&&arr.length>0){const valid=arr.filter(x=>x==="gemini-3-pro"||x==="gemini-3-5-flash"||x==="claude");if(valid.length>0)setJourneyModels(valid)}}
}catch{}},[]);
const toggleJourneyModel=(m)=>{
  setJourneyModels(prev=>{
    let next;
    if(prev.includes(m)){if(prev.length===1){sSt("⚠️ 少なくとも1つのモデルを選択してください");return prev}next=prev.filter(x=>x!==m)}
    else next=[...prev,m];
    try{localStorage.setItem("mk_journeyModels",JSON.stringify(next))}catch{}
    return next;
  });
};
// 要約テストラボ（4モデル並列比較）
const[labText,setLabText]=useState("");
const[labTemplate,setLabTemplate]=useState("free");
const[labModels,setLabModels]=useState(["gemini-pro","gemini-3-pro","gemini-3-5-flash","claude"]);
const[labResults,setLabResults]=useState([]);
const[labBusy,setLabBusy]=useState(false);
const labAbortRef=useRef(null);
const[labCompareTab,setLabCompareTab]=useState("all");
const[labHistOpen,setLabHistOpen]=useState(false);
const[labHistList,setLabHistList]=useState([]);
const[labHistLoading,setLabHistLoading]=useState(false);
const[labHistSearch,setLabHistSearch]=useState("");
const[labSelectMode,setLabSelectMode]=useState(false);
const[labSelectedIds,setLabSelectedIds]=useState([]);
const[labSaving,setLabSaving]=useState(false);
const[labSaveMsg,setLabSaveMsg]=useState("");
const[labExamTplId,setLabExamTplId]=useState("lab-exam-std");
// === 履歴タイトル インライン編集（4画面共通） ===
const[editingTitleId,setEditingTitleId]=useState(null);
const[editingTitleValue,setEditingTitleValue]=useState("");
const editingTitleInputRef=useRef(null);
const startEditTitle=(item)=>{
  setEditingTitleId(item.id);
  setEditingTitleValue(item.title||"");
  setTimeout(()=>{
    if(editingTitleInputRef.current){
      editingTitleInputRef.current.focus();
      editingTitleInputRef.current.select();
    }
  },0);
};
const cancelEditTitle=()=>{
  setEditingTitleId(null);
  setEditingTitleValue("");
};
const saveEditTitle=async(item,reloadFn,localUpdater)=>{
  const newTitle=editingTitleValue.trim();
  if(!newTitle){sSt("⚠️ タイトルを入力してください");return}
  if(newTitle===item.title){cancelEditTitle();return}
  if(!supabase){sSt("⚠️ Supabase未接続");return}
  try{
    const{error}=await supabase.from("counseling_analyses").update({title:newTitle}).eq("id",item.id);
    if(error)throw error;
    setEditingTitleId(null);
    setEditingTitleValue("");
    sSt("✓ タイトルを更新しました");
    if(typeof localUpdater==="function")localUpdater(item.id,newTitle);
    else if(typeof reloadFn==="function")await reloadFn();
  }catch(e){
    console.error("[saveEditTitle] error:",e);
    sSt("⚠️ タイトル更新失敗: "+(e.message||e));
  }
};
const renderTitleEditor=(item,opts)=>{
  const{reloadFn,isSelectMode,localUpdater,titleStyle,wrapperStyle}=opts||{};
  const isEditing=editingTitleId===item.id;
  if(isEditing){
    return(<div style={{display:"flex",gap:4,alignItems:"center",flex:1,minWidth:0,...(wrapperStyle||{})}} onClick={e=>e.stopPropagation()}>
      <input ref={editingTitleInputRef} type="text" value={editingTitleValue}
        onChange={e=>setEditingTitleValue(e.target.value)}
        onKeyDown={e=>{
          if(e.key==="Enter"){e.preventDefault();saveEditTitle(item,reloadFn,localUpdater)}
          else if(e.key==="Escape"){e.preventDefault();cancelEditTitle()}
        }}
        onClick={e=>e.stopPropagation()}
        style={{flex:1,minWidth:0,padding:"4px 8px",border:"2px solid #7c3aed",borderRadius:6,fontSize:13,fontWeight:600,fontFamily:"inherit",outline:"none"}}
      />
      <button onClick={e=>{e.stopPropagation();saveEditTitle(item,reloadFn,localUpdater)}}
        style={{padding:"4px 8px",background:"#10b981",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,flexShrink:0}}
        title="保存（Enter）">✓</button>
      <button onClick={e=>{e.stopPropagation();cancelEditTitle()}}
        style={{padding:"4px 8px",background:"#888",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,flexShrink:0}}
        title="キャンセル（Esc）">✕</button>
    </div>);
  }
  return(<div
    onClick={e=>{if(isSelectMode)return;e.stopPropagation();startEditTitle(item)}}
    onMouseEnter={e=>{if(!isSelectMode)e.currentTarget.style.background="#f0eaff"}}
    onMouseLeave={e=>{e.currentTarget.style.background="transparent"}}
    title={isSelectMode?"":"クリックして編集"}
    style={{cursor:isSelectMode?"default":"text",padding:"2px 4px",borderRadius:4,transition:"background 0.15s",wordBreak:"break-word",...(titleStyle||{})}}>
    {item.title||"（タイトルなし）"}{!isSelectMode&&<span style={{fontSize:11,color:"#888",marginLeft:4}}>✏️</span>}
  </div>);
};
useEffect(()=>{try{
  const s=localStorage.getItem("mk_labModels");
  if(s){const arr=JSON.parse(s);if(Array.isArray(arr)&&arr.length>0){const valid=arr.filter(x=>x==="gemini-pro"||x==="gemini-3-pro"||x==="gemini-3-5-flash"||x==="claude");if(valid.length>0)setLabModels(valid)}}
  const t=localStorage.getItem("mk_labTemplate");
  if(t&&["exam","minutes","counseling","free"].includes(t))setLabTemplate(t);
  const et=localStorage.getItem("mk_labExamTplId");
  if(et&&LAB_EXAM_TEMPLATES.find(x=>x.id===et))setLabExamTplId(et);
}catch{}},[]);
const toggleLabModel=(m)=>{
  setLabModels(prev=>{
    let next;
    if(prev.includes(m)){if(prev.length===1){sSt("⚠️ 少なくとも1つのモデルを選択してください");return prev}next=prev.filter(x=>x!==m)}
    else next=[...prev,m];
    try{localStorage.setItem("mk_labModels",JSON.stringify(next))}catch{}
    return next;
  });
};
const LAB_TEMPLATES={
  exam:{label:"🩺 診察要約",prompt:"以下の診察録音書き起こしを、SOAP形式で要約してください。\n- S（主訴・症状）\n- O（所見）\n- A（評価）\n- P（計画・処方）\n\n【書き起こし】\n{TEXT}"},
  minutes:{label:"📋 議事録要約",prompt:"以下の会議録音書き起こしを、議事録形式で要約してください。\n- 議題\n- 決定事項\n- 検討事項\n- アクションアイテム\n\n【書き起こし】\n{TEXT}"},
  counseling:{label:"💬 カウンセリング要約",prompt:"以下のカウンセリング書き起こしを要約してください。\n- 患者の主訴・希望\n- 提示した治療内容\n- 検討した懸念点\n- 患者の反応・合意状況\n\n【書き起こし】\n{TEXT}"},
  free:{label:"✨ フリーフォーマット",prompt:"以下のテキストを、構造化された要約にしてください。\n\n【テキスト】\n{TEXT}"}
};
// 要約ラボ専用の診察サブテンプレ（本番T配列とは独立、A)1行目配置の新フォーマット）
const LAB_EXAM_TEMPLATES=[
{id:"lab-exam-brief",name:"📋 簡潔",prompt:`皮膚科の医療秘書として最小限にカルテ要約。

【ルール】
- 1疾患あたり最大4行で完結
- 修飾語・詳細な説明は全て省く
- A）は重症度や治療方針判断を1〜2語で簡潔に（例: 軽症 / 慢性化 / 経過良好 / 増悪）
- 薬剤名と用法のみ
- 複数疾患は --- で区切る
- 推測しない
- # の後は「平易な表現（医学用語）」形式（例: 水虫（足白癬）、ニキビ（尋常性ざ瘡）等）

【出力フォーマット（厳守）】
# 疾患名　A）評価
S）一言
O）一言
P）処方名のみ

【例】
# かぶれ（接触性皮膚炎）　A）軽症
S）両前腕の痒み
O）紅斑性丘疹
P）リンデロン-VG 1日2回`},
{id:"lab-exam-std",name:"📋 標準",prompt:`皮膚科の医療秘書として簡潔にカルテ要約。話者分離：丁寧語は医師、訴えは患者。

【ルール】
- 冗長な表現は避け、要点のみ記載
- 修飾語は最小限にする
- A）は評価・治療方針判断を簡潔に（例: 軽症で経過観察 / 増悪傾向 / コントロール良好 など）
- 薬剤は名称と用法のみ（「〜軟膏を塗布するよう指示」→「〜軟膏 1日2回」）
- 所見は箇条書き的に短く
- 複数疾患は --- で区切る
- 会話にない情報は推測しない
- 会話に含まれない項目は出力しない（「言及なし」「詳細不明」「記載なし」等は絶対に書かない）
- 用法が不明な薬剤は薬剤名のみ記載（「用法不明」とは書かない）
- # の後は「平易な表現（医学用語）」形式で記載（例: 水虫（足白癬）、ニキビ（尋常性ざ瘡）、イボ（尋常性疣贅）、かぶれ（接触性皮膚炎）、じんましん（蕁麻疹）、ヘルペス（単純疱疹）、とびひ（伝染性膿痂疹）、あせも（汗疹）、シミ（肝斑）、ホクロ（色素性母斑）、アトピー（アトピー性皮膚炎）、手荒れ（手湿疹）、乾燥肌の湿疹（皮脂欠乏性湿疹）、粉瘤（表皮嚢腫）、赤ら顔（酒さ））
- 医師が病名を言った場合はそれを優先、なければ所見から推定
- 患者情報）には直近のイベント・希望・ライフイベント・趣味嗜好など生活背景を記載。情報がない場合は患者情報）行ごと省略する

【出力フォーマット（厳守）】
# 疾患名　A）評価・治療方針
S）主訴（1文）
O）所見（簡潔に）
P）処方・指示
患者情報）生活背景・イベント・希望（情報がある場合のみ記載）

【例】
# アトピー（アトピー性皮膚炎）　A）軽症〜中等症、外用継続で経過観察
S）手足の痒み、夜間増悪
O）四肢に紅斑・丘疹、顔面に赤み
P）ステロイド外用 1日2回、2週後再診
患者情報）来月結婚式あり、それまでに改善希望
---
# イボ（尋常性疣贅）　A）多発性、冷凍凝固で治療開始
S）手の疣贅
O）手背に多発
P）冷凍凝固療法`},
{id:"lab-exam-detail",name:"📋 詳細",prompt:`あなたは皮膚科専門の医療秘書です。以下の書き起こしテキストをカルテ形式で要約してください。

【話者分離ルール】
- 「です」「ます」「ください」等の丁寧語・指示語は医師/医療従事者の発言と判断
- 「痛い」「かゆい」「気になる」「〜してほしい」等の訴え・希望は患者の発言と判断
- 「塗ってください」「飲んでください」は医師の指示
- 「塗っています」「飲んでいます」は患者の報告
- 診断名・処方の決定は医師、症状の訴えは患者として分離

【複数疾患への対応】
- 会話中に複数の疾患・症状が話題になった場合、疾患ごとに「# 疾患名 A）/S）/O）/P）/患者情報）」をまとめる
- 各疾患ブロックを --- で区切る

【A）評価のルール】
- A）は医師の評価・治療方針判断・重症度・経過判断を記載
- 1〜3行程度の簡潔な記載（重症度 + 治療方針判断）
- 例: 「軽症、外用継続で改善見込み」「中等症、生物学的製剤導入を検討」「慢性化、長期管理が必要」

【# 疾患名の記載ルール】
- # の後には「平易な表現（正式な医学用語）」の形式で記載する
- 例: # 水虫（足白癬）、# ニキビ（尋常性ざ瘡）、# イボ（尋常性疣贅）
- 医師が病名を明言した場合はその病名を優先
- 明言がない場合は主訴と所見から推定
- 変換表: 水虫（足白癬）、爪水虫（爪白癬）、たむし（体部白癬）、しらくも（頭部白癬）、ニキビ（尋常性ざ瘡）、イボ（尋常性疣贅）、アトピー（アトピー性皮膚炎）、かぶれ（接触性皮膚炎）、脂漏性湿疹（脂漏性皮膚炎）、乾燥肌の湿疹（皮脂欠乏性湿疹）、手荒れ（手湿疹）、汗の湿疹（汗疱）、じんましん（蕁麻疹）、薬のアレルギー（薬疹）、ヘルペス（単純疱疹）、帯状ヘルペス（帯状疱疹）、とびひ（伝染性膿痂疹）、水いぼ（伝染性軟属腫）、あせも（汗疹）、しもやけ（凍瘡）、シミ（肝斑）、老人性シミ（日光黒子）、老人性イボ（脂漏性角化症）、ホクロ（色素性母斑）、タコ（胼胝）、ウオノメ（鶏眼）、やけど（熱傷）、床ずれ（褥瘡）、赤ら顔（酒さ）、かゆみ（皮膚掻痒症）、円形ハゲ（円形脱毛症）、薄毛（男性型脱毛症）、白斑（尋常性白斑）、粉瘤（表皮嚢腫）、おでき（せつ）
- 専門用語が一般的にもわかりやすい場合はそのまま使用: 乾癬（尋常性乾癬）、掌蹠膿疱症、ケロイド、蜂窩織炎、多形紅斑、光線過敏症、扁平苔癬、疥癬
- 該当がない場合は会話中の表現をそのまま使用

【出力フォーマット（厳守）】
# 疾患名　A）評価・治療方針
S）主訴内容
O）所見内容
P）計画内容
患者情報）背景やイベント情報

【複数疾患の場合の例】
# かぶれ（接触性皮膚炎）　A）軽症、外用で1週間経過観察
S）両前腕の痒み
O）紅斑性丘疹を散在性に認める
P）リンデロン-VG軟膏 1日2回
---
# 水虫（足白癬）　A）慢性化、外用継続必要
S）足指の間がジュクジュクする
O）第3-4趾間に浸軟・鱗屑
P）ルリコン液 1日1回

【フォーマットの厳密なルール】
- 1行目は「# 疾患名」の直後に全角スペースを入れ、続けて「A）評価内容」を同じ1行で記載
- S）O）P）患者情報）の直後に内容を続ける（改行しない）
- 各行の間に空行を入れない
- イベント情報（結婚式・旅行等）は患者情報）に記載
- 会話にない情報は推測しない
- 会話に含まれない項目は出力しない（「言及なし」と書かない）
- コンパクトに詰めて記載`}
];
const LAB_EXAM_TPL_IDS=["lab-exam-brief","lab-exam-std","lab-exam-detail"];
const[insightResult,setInsightResult]=useState("");
const[insightLoading,setInsightLoading]=useState(false);
const[insightModal,setInsightModal]=useState(false);
const[insightMode,setInsightMode]=useState("full");
const[mobileHideItems,setMobileHideItems]=useState({pip:true,shortcuts:true,fontsize:true,tabs_minutes:true,tabs_tasks:true,tabs_sns:true,tabs_analysis:true,tabs_roleplay:true,tabs_caselibrary:true,tabs_knowledge:true});
escapeRef.current=()=>{if(typoModal){setTypoModal(null);return}if(dictModal){setDictModal(false);return}if(histPopup){setHistPopup(null);return}if(qcModal){setQcModal(null);return}if(favModal){setFavModal(null);return}if(favMoveModal){setFavMoveModal(null);return}if(favEditModal){setFavEditModal(null);return}if(favGenModal){setFavGenModal(null);return}if(favDetailModal){setFavDetailModal(null);return}if(caseStudyModal){setCaseStudyModal(null);return}if(faqModal){setFaqModal(false);return}if(menuModal){setMenuModal(false);return}if(kbModal){setKbModal(false);return}if(calModal){setCalModal(false);return}if(hpModal){setHpModal(false);return}if(trModal){setTrModal(false);return}if(pxModal){setPxModal(false);return}if(page!=="main"){setPage("main");return}};
const FAV_GROUPS=["保険","美容","カウンセリング","治療説明","美容施術説明","その他"];
const showTip=(e,text)=>{const r=e.currentTarget.getBoundingClientRect();setTooltip({text,x:r.left+r.width/2,y:r.top-8,visible:true})};
const hideTip=()=>setTooltip(t=>({...t,visible:false}));
const loadFavorites=async()=>{if(!supabase)return;try{const{data}=await supabase.from("favorites").select("*").order("created_at",{ascending:false});if(data)setFavorites(data)}catch(e){console.error("Favorites load error:",e)}};
const saveFavorite=async(group,title,content,recordId)=>{if(!supabase)return;try{await supabase.from("favorites").insert({record_id:recordId||"",group_name:group,title,content});setFavToast(`⭐ ${group}グループに保存しました`);setTimeout(()=>setFavToast(""),2500);loadFavorites()}catch(e){console.error("Fav save error:",e)}};
const saveFavoriteSplit=async(group,dateTitle,inputText,outputText,recordId)=>{if(!supabase)return;try{const rows=[];if(inputText&&inputText.trim())rows.push({record_id:recordId||"",group_name:group,title:dateTitle+"|書き起こし",content:inputText});if(outputText&&outputText.trim())rows.push({record_id:recordId||"",group_name:group,title:dateTitle+"|要約",content:outputText});if(rows.length===0)return;await supabase.from("favorites").insert(rows);setFavToast(`⭐ 書き起こし・要約を${group}グループに保存しました`);setTimeout(()=>setFavToast(""),2500);loadFavorites()}catch(e){console.error("Fav split save error:",e)}};
const bulkSaveFavorites=async(group)=>{if(!supabase)return;const selected=filteredHist.filter(r=>selectedHistIds.has(r.id));if(!selected.length)return;try{const rows=[];selected.forEach(r=>{const date=r.created_at?new Date(r.created_at).toLocaleDateString("ja-JP"):"";const pid=r.patient_id||"";const baseTitle=date+(pid?" | "+pid:"");if(r.input_text&&r.input_text.trim())rows.push({record_id:r.id||"",group_name:group,title:baseTitle+"|書き起こし",content:r.input_text});if(r.output_text&&r.output_text.trim())rows.push({record_id:r.id||"",group_name:group,title:baseTitle+"|要約",content:r.output_text})});if(rows.length===0)return;await supabase.from("favorites").insert(rows);setFavToast(`⭐ ${selected.length}件の書き起こし・要約を${group}グループに保存しました`);setTimeout(()=>setFavToast(""),3000);loadFavorites()}catch(e){console.error("Bulk fav save error:",e)}};
const deleteFavorite=async(id)=>{if(!supabase||!confirm("削除しますか？"))return;try{await supabase.from("favorites").delete().eq("id",id);loadFavorites()}catch(e){console.error(e)}};
const moveFavorite=async(id,newGroup)=>{if(!supabase)return;try{await supabase.from("favorites").update({group_name:newGroup}).eq("id",id);setFavMoveModal(null);loadFavorites()}catch(e){console.error(e)}};
const openEditModal=(f)=>{setFavEditTitle(f.title||"");setFavEditGroup(f.group_name||"その他");setFavEditContent(f.content||"");setFavEditModal(f)};
const updateFavorite=async()=>{if(!supabase||!favEditModal)return;try{await supabase.from("favorites").update({title:favEditTitle,group_name:favEditGroup,content:favEditContent}).eq("id",favEditModal.id);setFavEditModal(null);setFavToast("✏️ 更新しました");setTimeout(()=>setFavToast(""),2500);loadFavorites()}catch(e){console.error("Fav update error:",e)}};
const openGenModal=(f)=>{setFavGenResult("");setFavGenPurpose("患者向け説明文");setFavGenModal(f)};
const generateMaterial=async()=>{if(!favGenModal)return;setFavGenLoading(true);setFavGenResult("");try{const res=await fetch("/api/generate-material",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({purpose:favGenPurpose,content:favGenModal.content||""})});const data=await res.json();if(data.error)throw new Error(data.error);setFavGenResult(data.result||"")}catch(e){setFavGenResult("エラー: "+e.message)}finally{setFavGenLoading(false)}};
const saveGenResultAsFavorite=async()=>{if(!supabase||!favGenModal||!favGenResult)return;const group=favGenModal.group_name||"その他";const title=`[${favGenPurpose}] ${(favGenModal.title||"無題").substring(0,30)}`;await saveFavorite(group,title,favGenResult,"");setFavToast("⭐ 生成結果を保存しました");setTimeout(()=>setFavToast(""),2500)};
const generateCaseStudy=async(f)=>{setCaseStudyModal(f);setCaseStudyResult("");setCaseStudyLoading(true);try{const res=await fetch("/api/case-study",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:f.content||""})});const data=await res.json();if(data.error)throw new Error(data.error);setCaseStudyResult(data.result||"")}catch(e){setCaseStudyResult("エラー: "+e.message)}finally{setCaseStudyLoading(false)}};
const runQualityCheck=async(r)=>{setQcModal(r);setQcResult("");setQcLoading(true);try{const res=await fetch("/api/quality-check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:r.input_text||""})});const data=await res.json();if(data.error)throw new Error(data.error);setQcResult(data.result||"")}catch(e){setQcResult("エラー: "+e.message)}finally{setQcLoading(false)}};
const generateRoleplay=async()=>{if(!rpInput.trim())return;setRpLoading(true);setRpResult("");try{const res=await fetch("/api/roleplay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({situation:rpInput})});const data=await res.json();if(data.error)throw new Error(data.error);setRpResult(data.result||"");const entry={id:Date.now(),situation:rpInput,result:data.result||"",date:new Date().toLocaleDateString("ja-JP")};try{const prev=JSON.parse(localStorage.getItem("mk_rpHistory")||"[]");const updated=[entry,...prev].slice(0,10);localStorage.setItem("mk_rpHistory",JSON.stringify(updated));setRpHistory(updated)}catch{}}catch(e){setRpResult("エラー: "+e.message)}finally{setRpLoading(false)}};
const generateMaterialPrompt=()=>{const sizeInstruction=rpMaterialSize==="A5"?"A5サイズ1枚（約400〜600文字）に収まるコンパクトな構成":"A4サイズ1枚（約800〜1200文字）に収まる詳細な構成";const prompt=`以下の皮膚科診療情報をもとに、患者向けの見やすい説明資料を作成してください。\n\n【資料の要件】\n- サイズ: ${rpMaterialSize}（${sizeInstruction}）\n- 対象: 患者・ご家族が自宅で読み返せる資料\n- デザイン: 清潔感のある医療系レイアウト、読みやすいフォント\n- 言語: 平易な日本語（専門用語には説明を添える）\n\n【必ず含める項目】\n1. 疾患・施術名（大きめのタイトル）\n2. どんな状態か（症状・特徴の簡単な説明）\n3. 治療・施術の効果（期待できること）\n4. 副作用・注意点（正直に、でも怖くなりすぎない表現で）\n5. 日常生活のポイント・Tips（すぐ実践できるアドバイス3〜5つ）\n6. 次回受診の目安\n${rpMaterialSize==="A4"?"7. よくある質問Q&A（2〜3問）\n8. クリニックからのメッセージ（温かい一言）":""}\n\n【元となる診療情報】\nシナリオ: ${rpInput}\n\n${rpResult}\n\n上記をもとに、患者さんが安心して治療に取り組めるような温かみのある資料を作成してください。`;setRpMaterialPrompt(prompt)};
const generateStaffPrompt=()=>{const prompt=`以下の皮膚科・美容皮膚科クリニックのロールプレイ研修内容をもとに、新人スタッフ向けの指導資料をGenspark（スライド形式）で作成してください。\n\n【資料の要件】\n- 形式: A4サイズ・1〜3枚程度のスライド資料\n- 対象: 皮膚科・美容皮膚科クリニックの新人スタッフ\n- 目的: 実際の現場で即実践できる接遇・対応スキルの習得\n- スタイル: シンプルで見やすい医療系デザイン、箇条書き中心\n\n【スライド構成（必須）】\nスライド1: タイトル + この研修で学ぶこと（概要）\nスライド2: 対応の基本ステップ（フローチャートまたは番号付きリスト）\nスライド3: 指導ポイント・配慮すべき点（具体的な言葉・態度を含む）\n最終スライド: 重要ポイント3点のみ（大きく・シンプルに・覚えやすく）\n\n【各スライドに含める要素】\n- 説明内容: 簡潔に要点のみ（1スライド5行以内）\n- 指導ポイント: 具体的な行動・言葉で記載\n- 配慮すべき点: 患者心理・状況への理解\n- NGワード/NG行動: 避けるべき言葉・態度\n- 最終スライドの重要ポイント3点: 一文で言い切れるシンプルな表現\n\n【研修シナリオ】\nテーマ: ${rpInput}\n\n【研修内容の詳細】\n${rpResult}\n\n上記をもとに、新人スタッフが研修後すぐに現場で実践できる、わかりやすく実践的な指導資料を作成してください。`;setRpStaffPrompt(prompt);setRpStaffModal(true)};
const generateFaq=async(group,favs)=>{setFaqLoading(true);setFaqResult("");setFaqModal(true);try{const content=favs.map(f=>`【${f.title||"無題"}】\n${f.content||""}`).join("\n---\n");const res=await fetch("/api/generate-faq",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});const data=await res.json();if(data.error)throw new Error(data.error);setFaqResult(data.result||"")}catch(e){setFaqResult("エラー: "+e.message)}finally{setFaqLoading(false)}};
const generateMenu=async(favs)=>{setMenuLoading(true);setMenuResult("");setMenuModal(true);try{const content=favs.map(f=>`【${f.title||"無題"}】\n${f.content||""}`).join("\n---\n");const res=await fetch("/api/generate-menu",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});const data=await res.json();if(data.error)throw new Error(data.error);setMenuResult(data.result||"")}catch(e){setMenuResult("エラー: "+e.message)}finally{setMenuLoading(false)}};
const generateSns=async()=>{if(!snsInput.trim())return;setSnsLoading(true);setSnsResult("");try{const res=await fetch("/api/generate-sns",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({platform:snsPlatform,theme:snsInput})});const data=await res.json();if(data.error)throw new Error(data.error);setSnsResult(data.result||"");const entry={id:Date.now(),platform:snsPlatform,theme:snsInput,result:data.result||"",date:new Date().toLocaleDateString("ja-JP")};try{const prev=JSON.parse(localStorage.getItem("mk_snsHistory")||"[]");const updated=[entry,...prev].slice(0,10);localStorage.setItem("mk_snsHistory",JSON.stringify(updated));setSnsHistory(updated)}catch{}}catch(e){setSnsResult("エラー: "+e.message)}finally{setSnsLoading(false)}};
const runSatisfactionAnalysis=async()=>{if(!supabase)return;setSatLoading(true);setSatResult("");try{const[{data:records},{data:counseling}]=await Promise.all([supabase.from("records").select("output_text,input_text").order("created_at",{ascending:false}).limit(30),supabase.from("counseling_records").select("transcription,summary").order("created_at",{ascending:false}).limit(30)]);let content="【診療記録】\n";if(records)content+=records.map(r=>r.output_text||r.input_text||"").filter(Boolean).join("\n---\n");content+="\n\n【カウンセリング記録】\n";if(counseling)content+=counseling.map(r=>r.summary||r.transcription||"").filter(Boolean).join("\n---\n");if(content.trim().length<20){setSatResult("分析に必要なデータが不足しています");setSatLoading(false);return}const res=await fetch("/api/satisfaction-analysis",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});const data=await res.json();if(data.error)throw new Error(data.error);setSatResult(data.result||"")}catch(e){setSatResult("エラー: "+e.message)}finally{setSatLoading(false)}};
const runKnowledgeBase=async(mode)=>{if(!supabase)return;setKbMode(mode);setKbLoading(true);setKbResult("");setKbModal(true);try{const{data}=await supabase.from("records").select("input_text,output_text,created_at").order("created_at",{ascending:false}).limit(30);if(!data||data.length<3){setKbResult("データが不足しています（最低3件の履歴が必要です）");setKbLoading(false);return}const endpoint=mode==="report"?"/api/quality-report":"/api/knowledge-base";const body=mode==="report"?{records:data}:{records:data,mode};const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await res.json();if(result.error)throw new Error(result.error);setKbResult(result.result||"")}catch(e){setKbResult("エラー: "+e.message)}finally{setKbLoading(false)}};
const runContentCalendar=async()=>{if(!supabase)return;setCalLoading(true);setCalResult("");setCalModal(true);try{const{data}=await supabase.from("records").select("output_text,created_at").order("created_at",{ascending:false}).limit(50);if(!data||data.length<3){setCalResult("データが不足しています（最低3件の履歴が必要です）");setCalLoading(false);return}const now=new Date();const nextMonth=new Date(now.getFullYear(),now.getMonth()+1,1);const month=`${nextMonth.getFullYear()}年${nextMonth.getMonth()+1}月`;const res=await fetch("/api/content-calendar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,month})});const result=await res.json();if(result.error)throw new Error(result.error);setCalResult(result.result||"")}catch(e){setCalResult("エラー: "+e.message)}finally{setCalLoading(false)}};
const runHomepageContent=async(type)=>{if(!supabase)return;setHpType(type);setHpLoading(true);setHpResult("");setHpModal(true);try{const{data}=await supabase.from("records").select("output_text").order("created_at",{ascending:false}).limit(50);if(!data||data.length<3){setHpResult("データが不足しています（最低3件の履歴が必要です）");setHpLoading(false);return}const res=await fetch("/api/homepage-content",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,type})});const result=await res.json();if(result.error)throw new Error(result.error);setHpResult(result.result||"")}catch(e){setHpResult("エラー: "+e.message)}finally{setHpLoading(false)}};
const runTrendReport=async(type)=>{if(!supabase)return;setTrType(type);setTrLoading(true);setTrResult("");setTrModal(true);setTrCount(0);try{const{data}=await supabase.from("records").select("output_text,created_at").order("created_at",{ascending:false}).limit(100);if(!data||data.length<3){setTrResult("データが不足しています（最低3件の履歴が必要です）");setTrLoading(false);return}setTrCount(data.length);const res=await fetch("/api/trend-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,type})});const result=await res.json();if(result.error)throw new Error(result.error);setTrResult(result.result||"")}catch(e){setTrResult("エラー: "+e.message)}finally{setTrLoading(false)}};
const runPatientExperience=async(type)=>{if(!supabase)return;setPxType(type);setPxLoading(true);setPxResult("");setPxModal(true);try{const{data}=await supabase.from("records").select("output_text,input_text,created_at").order("created_at",{ascending:false}).limit(50);if(!data||data.length<3){setPxResult("データが不足しています（最低3件の履歴が必要です）");setPxLoading(false);return}if(type==="patient"){const res=await fetch("/api/trend-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,type:"patient"})});const result=await res.json();if(result.error)throw new Error(result.error);setPxResult(result.result||"")}else{const res=await fetch("/api/knowledge-base",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,mode:"training"})});const result=await res.json();if(result.error)throw new Error(result.error);setPxResult(result.result||"")}}catch(e){setPxResult("エラー: "+e.message)}finally{setPxLoading(false)}};
const runPhilosophy=async()=>{
if(!supabase)return;
setPhilLoading(true);setPhilModal(true);setPhilResult("");
try{
const[{data:records},{data:counseling}]=await Promise.all([
supabase.from("records").select("input_text,output_text").order("created_at",{ascending:false}).limit(50),
supabase.from("counseling_records").select("transcription,summary").order("created_at",{ascending:false}).limit(20)
]);
let content="【診療記録】\n";
if(records)content+=records.map(r=>r.output_text||r.input_text||"").filter(Boolean).join("\n---\n");
content+="\n\n【カウンセリング記録】\n";
if(counseling)content+=counseling.map(r=>r.summary||r.transcription||"").filter(Boolean).join("\n---\n");
if(content.trim().length<50){setPhilResult("分析に必要なデータが不足しています（診療記録を増やしてから再度お試しください）");setPhilLoading(false);return}
const res=await fetch("/api/philosophy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});
const data=await res.json();
if(data.error)throw new Error(data.error);
setPhilResult(data.result||"");
}catch(e){setPhilResult("エラー: "+e.message)}finally{setPhilLoading(false)}
};
const runPersona=async()=>{
if(!supabase)return;
setPersonaLoading(true);setPersonaModal(true);setPersonaResult("");
try{
const[{data:minutes},{data:tasks}]=await Promise.all([
supabase.from("minutes").select("output_text").order("created_at",{ascending:false}).limit(20),
supabase.from("tasks").select("title,category,role_level,done").limit(100)
]);
let content="【議事録】\n";
if(minutes)content+=minutes.map(m=>m.output_text||"").filter(Boolean).join("\n---\n");
content+="\n\n【タスク実績】\n";
if(tasks)content+=tasks.map(t=>`${t.title}（${t.role_level||""}・${t.category||""}・${t.done?"完了":"未完了"}）`).join("\n");
if(content.trim().length<50){setPersonaResult("分析に必要なデータが不足しています（議事録・タスクを増やしてから再度お試しください）");setPersonaLoading(false);return}
const res=await fetch("/api/recruit-persona",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});
const data=await res.json();
if(data.error)throw new Error(data.error);
setPersonaResult(data.result||"");
}catch(e){setPersonaResult("エラー: "+e.message)}finally{setPersonaLoading(false)}
};
const runPortfolio=async(targetGroup)=>{
if(!supabase)return;
const grp=targetGroup||portfolioGroup;
setPortfolioLoading(true);setPortfolioModal(true);setPortfolioResult("");
try{
const{data:favs}=await supabase
.from("favorites")
.select("title,content,group_name,created_at")
.eq("group_name",grp)
.order("created_at",{ascending:false})
.limit(50);
if(!favs||favs.length===0){
setPortfolioResult("「"+grp+"」グループにデータがありません。\nお気に入りに症例を保存してから再度お試しください。");
setPortfolioLoading(false);return;
}
const content=favs.map(f=>`【${new Date(f.created_at).toLocaleDateString("ja-JP")}】\n${f.content||""}`).join("\n\n---\n\n");
const res=await fetch("/api/case-portfolio",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content,group:grp})});
const data=await res.json();
if(data.error)throw new Error(data.error);
setPortfolioResult(data.result||"");
}catch(e){setPortfolioResult("エラー: "+e.message)}finally{setPortfolioLoading(false)}
};
const fetchJourneyContent=async()=>{
  if(!supabase)return"";
  const[{data:counseling},{data:records}]=await Promise.all([
    supabase.from("counseling_records").select("transcription,summary,created_at").order("created_at",{ascending:false}).limit(30),
    supabase.from("records").select("input_text,output_text,created_at").order("created_at",{ascending:false}).limit(30)
  ]);
  let content="【カウンセリング記録】\n";
  if(counseling&&counseling.length>0)content+=counseling.map(r=>`[${new Date(r.created_at).toLocaleDateString("ja-JP")}]\n${r.summary||r.transcription||""}`).join("\n---\n");
  else content+="（カウンセリング記録なし）\n";
  content+="\n\n【診療記録】\n";
  if(records&&records.length>0)content+=records.map(r=>r.output_text||r.input_text||"").filter(Boolean).join("\n---\n");
  return content;
};
const runJourneyMap=async()=>{
if(!supabase)return;
setJourneyLoading(true);setJourneyModal(true);setJourneyResult("");setJourneyMeta(null);setJourneyResults([]);setJourneySaveMsg("");
try{
const content=await fetchJourneyContent();
if(content.trim().length<50){
setJourneyResult("分析に必要なデータが不足しています。\nカウンセリング記録・診療記録を増やしてから再度お試しください。");
setJourneyLoading(false);return;
}
const ctrl=new AbortController();journeyAbortRef.current=ctrl;
const mp=journeyModels[0]||"gemini-pro";
const res=await fetch("/api/journey-map",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content,model_preference:mp,context:"journey-map"}),signal:ctrl.signal});
const data=await res.json();
if(data.error)throw new Error(data.error);
setJourneyMeta({model:data.model,usage:data.usage});
setJourneyResult(data.result||"");
}catch(e){if(e.name==="AbortError"){setJourneyResult("");sSt("⏹ ジャーニーマップ生成を停止しました")}else setJourneyResult("エラー: "+e.message)}finally{setJourneyLoading(false);if(journeyAbortRef.current&&!Array.isArray(journeyAbortRef.current))journeyAbortRef.current=null}
};

const runSingleJourney=async(model,content,controller)=>{
  const res=await fetch("/api/journey-map",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({content,model_preference:model,context:"journey-map"}),
    signal:controller.signal,
  });
  if(!res.ok)throw new Error("HTTP "+res.status);
  const d=await res.json();
  if(d.error)throw new Error(d.error);
  return{output:d.result||"",usage:d.usage||null,modelLabel:d.model||csModelLabel(model)};
};

const runJourneyMapAll=async()=>{
  if(!supabase)return;
  if(journeyAbortRef.current){try{(Array.isArray(journeyAbortRef.current)?journeyAbortRef.current:[journeyAbortRef.current]).forEach(c=>{try{c.abort()}catch{}})}catch{}}
  setJourneyCompareTab("all");
  setJourneyLoading(true);setJourneyModal(true);setJourneyResult("");setJourneyMeta(null);setJourneySaveMsg("");
  const content=await fetchJourneyContent();
  if(content.trim().length<50){
    setJourneyResult("分析に必要なデータが不足しています。\nカウンセリング記録・診療記録を増やしてから再度お試しください。");
    setJourneyLoading(false);return;
  }
  const controllers=journeyModels.map(()=>new AbortController());
  journeyAbortRef.current=controllers;
  const initial=journeyModels.map(m=>({model:m,status:"running",output:"",usage:null,error:null,startedAt:Date.now(),endedAt:null}));
  setJourneyResults(initial);
  await Promise.allSettled(journeyModels.map((m,i)=>runSingleJourney(m,content,controllers[i])
    .then(r=>{setJourneyResults(prev=>prev.map((x,idx)=>idx===i?{...x,...r,status:"done",endedAt:Date.now()}:x))})
    .catch(e=>{const aborted=e.name==="AbortError";setJourneyResults(prev=>prev.map((x,idx)=>idx===i?{...x,status:aborted?"aborted":"error",error:e.message,endedAt:Date.now()}:x))})
  ));
  setJourneyLoading(false);journeyAbortRef.current=null;
};

const stopJourneyMap=()=>{
  if(journeyAbortRef.current){
    try{
      if(Array.isArray(journeyAbortRef.current))journeyAbortRef.current.forEach(c=>{try{c.abort()}catch{}});
      else journeyAbortRef.current.abort();
    }catch{}
    journeyAbortRef.current=null;
    sSt("⏹ ジャーニーマップ生成を停止しました");
  }
  setJourneyLoading(false);
};

const saveJourneyResult=async()=>{
  if(!supabase){setJourneySaveMsg("保存先が未設定です");return}
  if(!journeyResult||!journeyResult.trim()||journeyResult.startsWith("エラー:")||journeyResult.startsWith("分析に必要な")){setJourneySaveMsg("保存できる内容がありません");return}
  setJourneySaving(true);setJourneySaveMsg("");
  try{
    const nowStr=new Date().toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    const title=`[ジャーニーマップ${journeyMeta?.model?"/"+csModelLabel(journeyModels[0]||"gemini-pro"):""}] ${nowStr}`;
    const{error}=await supabase.from("counseling_analyses").insert({
      title,
      analysis_type:"journey_map",
      input_text:"(records/counseling_records 統合)",
      output_text:journeyResult,
      ai_model:journeyMeta?.model||csModelLabel(journeyModels[0]||"gemini-pro"),
      scores:null,
    });
    if(error){setJourneySaveMsg("保存失敗: "+error.message)}
    else{setJourneySaveMsg("保存しました ✓");setTimeout(()=>setJourneySaveMsg(""),3000)}
  }catch(e){setJourneySaveMsg("保存失敗: "+e.message)}
  finally{setJourneySaving(false)}
};

const saveJourneyResultsAll=async()=>{
  if(!supabase){setJourneySaveMsg("保存先が未設定です");return}
  const done=journeyResults.filter(r=>r.status==="done"&&r.output);
  if(done.length===0){setJourneySaveMsg("保存可能な結果がありません");return}
  setJourneySaving(true);setJourneySaveMsg("");
  const nowStr=new Date().toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  let ok=0,fail=0;
  for(const r of done){
    try{
      const{error}=await supabase.from("counseling_analyses").insert({
        title:`[ジャーニー/${csModelLabel(r.model)}] ${nowStr}`,
        analysis_type:"journey_map",
        input_text:"(records/counseling_records 統合)",
        output_text:r.output,
        ai_model:r.modelLabel||csModelLabel(r.model),
        scores:null,
      });
      if(error)fail++;else ok++;
    }catch{fail++}
  }
  setJourneySaving(false);
  setJourneySaveMsg(`${ok}件保存しました${fail>0?`（${fail}件失敗）`:" ✓"}`);
  setTimeout(()=>setJourneySaveMsg(""),3500);
};

const openJourneyHist=async()=>{
  setJourneyHistOpen(true);setJourneyHistLoading(true);setJourneyHistSearch("");
  if(!supabase){setJourneyHistLoading(false);setJourneyHistList([]);return}
  try{
    const{data,error}=await supabase.from("counseling_analyses").select("id,title,output_text,ai_model,created_at").eq("analysis_type","journey_map").order("created_at",{ascending:false}).limit(50);
    if(error)throw error;
    setJourneyHistList(data||[])
  }catch(e){console.error("[journeyHist] fetch error:",e);sSt("⚠️ 履歴の取得に失敗しました: "+e.message);setJourneyHistList([])}
  finally{setJourneyHistLoading(false)}
};

const restoreJourney=(item)=>{
  if(!item?.output_text){sSt("⚠️ この履歴には内容がありません");return}
  setJourneyResult(item.output_text);
  setJourneyResults([]);
  setJourneyMeta({model:item.ai_model,usage:null});
  setJourneyModal(true);
  setJourneyHistOpen(false);
  sSt(`✓ 履歴を読み込みました（${formatCsPickDate(item.created_at)}）`);
};

const deleteJourneyHist=async(id)=>{
  if(!supabase)return;
  if(!confirm("この履歴を削除しますか？"))return;
  try{
    const{error}=await supabase.from("counseling_analyses").delete().eq("id",id);
    if(error){alert("削除失敗: "+error.message);return}
    setJourneyHistList(prev=>prev.filter(r=>r.id!==id))
  }catch(e){alert("削除失敗: "+e.message)}
};
const runInsightDashboard=async(mode)=>{
if(!supabase)return;
const m=mode||insightMode;
setInsightLoading(true);setInsightModal(true);setInsightResult("");
try{
const[{data:records},{data:counseling},{data:favs}]=await Promise.all([
supabase.from("records").select("input_text,output_text,created_at").order("created_at",{ascending:false}).limit(100),
supabase.from("counseling_records").select("transcription,summary,created_at").order("created_at",{ascending:false}).limit(30),
supabase.from("favorites").select("title,content,group_name,created_at").order("created_at",{ascending:false}).limit(50)
]);
let content="【診療記録】\n";
if(records)content+=records.map(r=>r.output_text||r.input_text||"").filter(Boolean).join("\n---\n");
content+="\n\n【カウンセリング記録】\n";
if(counseling)content+=counseling.map(r=>r.summary||r.transcription||"").filter(Boolean).join("\n---\n");
content+="\n\n【お気に入り症例】\n";
if(favs)content+=favs.map(f=>`[${f.group_name}] ${f.content||""}`).filter(Boolean).join("\n---\n");
if(content.trim().length<50){setInsightResult("分析に必要なデータが不足しています。\n診療記録を増やしてから再度お試しください。");setInsightLoading(false);return}
const res=await fetch("/api/insight-dashboard",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content,mode:m})});
const data=await res.json();
if(data.error)throw new Error(data.error);
setInsightResult(data.result||"");
}catch(e){setInsightResult("エラー: "+e.message)}finally{setInsightLoading(false)}
};
const audioSaveRef=useRef(false),audioPartCounter=useRef(1),audioChunkTimer=useRef(null),audioPathsRef=useRef([]),minAudioPathsRef=useRef([]),lastRecordIdRef=useRef(null),audioPartStartTime=useRef(0),mR_save=useRef(null);
useEffect(()=>{const effective=sessionAudioSave!==null?sessionAudioSave:audioSave;audioSaveRef.current=effective},[audioSave,sessionAudioSave]);
const saveAudio=async(blob,partN,durationSec)=>{if(!supabase||!blob||blob.size<1000)return null;try{const ts=new Date().toISOString().replace(/[:.]/g,"-");const secStr=durationSec&&durationSec>0?`-${Math.round(durationSec)}s`:"";const partSeg=`_part${partN||1}${secStr}`;const path=`audio/${rid}/${ts}${partSeg}_${pIdRef.current||"unknown"}.webm`;const{error}=await supabase.storage.from("audio").upload(path,blob,{contentType:"audio/webm"});if(error){console.error("Audio save error:",error);setAudioSaveNote({t:"err",m:"⚠ 音声保存に失敗しました: "+(error.message||"不明なエラー")});return null}console.log("Audio saved:",path);setAudioSaveNote({t:"ok",m:`✓ 音声保存済み part${partN||1}`});audioPathsRef.current.push(path);if(lastRecordIdRef.current){try{await supabase.from("records").update({audio_path:audioPathsRef.current.join(",")}).eq("id",lastRecordIdRef.current)}catch(e){console.error("audio_path update error:",e)}}return path}catch(e){console.error("Audio save error:",e);setAudioSaveNote({t:"err",m:"⚠ 音声保存に失敗しました: "+(e.message||"不明なエラー")});return null}};
const saveMinAudio=async(blob,minuteTitle)=>{
if(!supabase||!blob||blob.size<1000)return null;
try{
const ts=new Date().toISOString().replace(/[:.]/g,"-");
const safeName=(minuteTitle||"minutes").replace(/[^a-zA-Z0-9\u3040-\u9fff\-_]/g,"_").substring(0,30);
const path=`minutes-audio/${ts}_${safeName}.webm`;
const{error}=await supabase.storage.from("audio").upload(path,blob,{contentType:"audio/webm"});
if(error){
console.error("Minutes audio save error:",error);
sSt("⚠️ 音声保存エラー: "+error.message);
return null;
}
console.log("Minutes audio saved:",path);
sSt("🎙️ 音声を保存しました");
minAudioPathsRef.current.push(path);
if(minDraftIdRef.current){
try{
await supabase.from("minutes").update({audio_path:minAudioPathsRef.current.join(",")}).eq("id",minDraftIdRef.current);
}catch(e){console.error("minutes audio_path update error:",e)}
}
return path;
}catch(e){
console.error("Minutes audio save error:",e);
return null;
}
};
const getAudioSignedUrl=async(path)=>{
if(!supabase||!path)return null;
try{
const{data,error}=await supabase.storage.from("audio").createSignedUrl(path,3600);
if(error){console.error("signedUrl error:",error,path);return null}
return data?.signedUrl||null;
}catch(e){console.error("signedUrl error:",e);return null}
};
const fetchAudioList=async()=>{
if(!supabase)return;
setAudioListLoading(true);setAudioListMsg("");
try{
const[recRes,minRes]=await Promise.all([
supabase.from("records").select("id,room,patient_id,patient_name,audio_path,created_at").not("audio_path","is",null).order("created_at",{ascending:false}).limit(100),
supabase.from("minutes").select("id,title,audio_path,created_at").not("audio_path","is",null).order("created_at",{ascending:false}).limit(100)
]);
const recs=(recRes.data||[]).map(r=>({type:"record",id:r.id,created_at:r.created_at,room:r.room,patient_id:r.patient_id,patient_name:r.patient_name,title:null,audio_path:r.audio_path}));
const mins=(minRes.data||[]).map(r=>({type:"minute",id:r.id,created_at:r.created_at,room:null,patient_id:null,patient_name:null,title:r.title,audio_path:r.audio_path}));
// Storage直接リスト: records/minutesに紐付いていない音声（要約せず停止した録音・紐付け前に画面遷移した録音）も一覧に出す
let orphans=[];
try{
const linked=new Set();
[...recs,...mins].forEach(it=>(it.audio_path||"").split(",").map(p=>p.trim()).filter(Boolean).forEach(p=>linked.add(p)));
try{const{data:smn}=await supabase.from("counseling_analyses").select("audio_path").not("audio_path","is",null).limit(200);(smn||[]).forEach(r=>(r.audio_path||"").split(",").map(p=>p.trim()).filter(Boolean).forEach(p=>linked.add(p)))}catch{}
const{data:roomDirs}=await supabase.storage.from("audio").list("audio",{limit:50});
const prefixes=(roomDirs||[]).filter(d=>!d.id).map(d=>"audio/"+d.name).concat(["seminar-audio"]);
const lists=await Promise.all(prefixes.map(async pfx=>{
const{data}=await supabase.storage.from("audio").list(pfx,{limit:100,sortBy:{column:"created_at",order:"desc"}});
return(data||[]).filter(f=>f.id).map(f=>({pfx,f}));
}));
orphans=lists.flat().filter(({pfx,f})=>!linked.has(pfx+"/"+f.name)).map(({pfx,f})=>{
const path=pfx+"/"+f.name;
const pm=f.name.match(/_part\d+(?:-\d+s)?_(.+)\.webm$/);
const pid=pm&&pm[1]!=="unknown"?pm[1]:"";
return{type:"storage",id:path,created_at:f.created_at,room:pfx.startsWith("audio/")?pfx.slice(6):"セミナー",patient_id:pid,patient_name:null,title:pfx==="seminar-audio"?f.name:null,audio_path:path};
});
}catch(e){console.error("storage list error:",e)}
const merged=[...recs,...mins,...orphans].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,150);
setAudioList(merged);
setAudioListMsg(`✓ ${merged.length}件取得（診察${recs.length}件・議事録${mins.length}件・未紐付け${orphans.length}件）`);
}catch(e){console.error("fetchAudioList error:",e);setAudioListMsg("取得エラー: "+e.message)}
finally{setAudioListLoading(false)}
};
const DEL_PWD="mkhifuka1199";
const audioKey=(item)=>item.type+"-"+item.id;
const toggleAudioSelected=(item)=>{
  const k=audioKey(item);
  setSelectedAudios(prev=>{const s=new Set(prev);if(s.has(k))s.delete(k);else s.add(k);return s});
};
const selectAllAudios=()=>{
  const ks=audioList.filter(a=>a.audio_path).map(a=>audioKey(a));
  setSelectedAudios(new Set(ks));
};
const deselectAllAudios=()=>setSelectedAudios(new Set());
const deleteSelectedAudios=async()=>{
  if(!supabase)return;
  const count=selectedAudios.size;
  if(count===0){alert("削除する音声を選択してください");return}
  if(!window.confirm(`選択した${count}件を削除します。\n\n⚠️ この操作は取り消せません。\n- Supabase Storage からファイル削除\n- records/minutes テーブルの audio_path を NULL に更新\n\n続行する場合は次の画面でパスワードを入力してください。`))return;
  const pwd=window.prompt("削除パスワードを入力してください:");
  if(pwd===null)return;
  if(pwd!==DEL_PWD){alert("パスワードが違います");return}
  setAudioDeleting(true);
  let success=0,failed=0;
  try{
    for(const key of selectedAudios){
      const item=audioList.find(a=>audioKey(a)===key);
      if(!item)continue;
      try{
        const paths=(item.audio_path||"").split(",").map(p=>p.trim()).filter(Boolean);
        if(paths.length>0){
          const{error:storageErr}=await supabase.storage.from("audio").remove(paths);
          if(storageErr)console.error("Storage削除エラー:",storageErr);
        }
        if(item.type==="storage"){success++}// 未紐付け音声はStorage削除のみ（DB行なし）
        else{
        const table=item.type==="record"?"records":"minutes";
        const{error:dbErr}=await supabase.from(table).update({audio_path:null}).eq("id",item.id);
        if(dbErr){console.error("DB更新エラー:",dbErr);failed++}
        else{success++}
        }
      }catch(e){console.error("削除エラー:",e);failed++}
    }
  }finally{setAudioDeleting(false)}
  alert(`${success}件削除しました${failed>0?`（${failed}件失敗）`:""}`);
  setSelectedAudios(new Set());
  await fetchAudioList();
};
const loadAudioSignedUrl=async(path)=>{
if(audioSignedUrls[path])return audioSignedUrls[path];
const url=await getAudioSignedUrl(path);
if(url)setAudioSignedUrls(prev=>({...prev,[path]:url}));
return url;
};
const downloadAudio=async(path)=>{
const url=await loadAudioSignedUrl(path);
if(!url){alert("音声ファイルが取得できませんでした");return}
const a=document.createElement("a");
a.href=url;
a.download=path.split("/").pop()||"audio.webm";
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
};

const convertAndDownloadMp3=async(path)=>{
  if(!path){alert("音声パスが取得できませんでした");return}
  if(mp3Converting[path]){return}
  setMp3Converting(prev=>({...prev,[path]:"loading"}));
  try{
    const url=await loadAudioSignedUrl(path);
    if(!url){throw new Error("音声ファイルが取得できませんでした")}
    const res=await fetch(url);
    if(!res.ok)throw new Error("音声取得失敗 HTTP "+res.status);
    const webmBlob=await res.blob();
    setMp3Converting(prev=>({...prev,[path]:"converting"}));
    const{convertWebmToMp3}=await import("./Mp3Converter");
    const mp3Blob=await convertWebmToMp3(webmBlob,{bitrate:"128k"});
    const baseName=(path.split("/").pop()||"audio.webm").replace(/\.webm$/i,".mp3");
    const dlUrl=URL.createObjectURL(mp3Blob);
    const a=document.createElement("a");
    a.href=dlUrl;
    a.download=baseName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(dlUrl),60000);
    setMp3Converting(prev=>{const n={...prev};delete n[path];return n});
  }catch(e){
    console.error("[mp3] convert error:",e);
    alert("mp3変換に失敗しました: "+e.message);
    setMp3Converting(prev=>{const n={...prev};delete n[path];return n});
  }
};
const mR=useRef(null),msR=useRef(null),acR=useRef(null),anR=useRef(null),laR=useRef(null),tR=useRef(null),cR=useRef(null),iR=useRef(""),oR=useRef(""),sumDoneRef=useRef(false);
const pipRef=useRef(null),elRef=useRef(0),lvRef=useRef(0),rsRef=useRef("inactive"),pNameRef=useRef(""),pIdRef=useRef(""),snippetsRef=useRef(DEFAULT_SNIPPETS),pipSnippetsRef=useRef([0,1,2,3,4]);
// レベル解析ループが最後に動いた時刻。ブラウザのautoplayポリシー等で解析が止まっている(lvが更新されない)環境では、
// lv<1の無音ゲートを素通りさせて送信する(fail-open)ための鮮度判定に使う。0=未稼働。
const lvLastUpdateRef=useRef(0);
const pipBtnUpdateRef=useRef(()=>{});
const tidRef=useRef("soap-std");
const autoTplRef=useRef(false);
const histDatesInitRef=useRef(false);
useEffect(()=>{iR.current=inp},[inp]);
useEffect(()=>{oR.current=out},[out]);
useEffect(()=>{elRef.current=el},[el]);
useEffect(()=>{lvRef.current=lv},[lv]);
useEffect(()=>{rsRef.current=rs},[rs]);
useEffect(()=>{tidRef.current=tid},[tid]);
// 部屋ベースの既定テンプレ切替: カウンセリング室(r7)はcounseling-std、他室は既定テンプレに戻す。
// 手動でテンプレを選択済み(autoTplRef=true)の場合はそちらを優先。内容ベースの自動判定(detectTemplate)は復活させない。
useEffect(()=>{if(autoTplRef.current)return;if(rid==="r7"){sTid("counseling-std")}else if(tidRef.current==="counseling-std"){let dt="soap-std";try{const v=localStorage.getItem("mk_defaultTpl");if(v&&v!=="counseling-std")dt=v}catch{};sTid(dt)}},[rid]);
useEffect(()=>{pNameRef.current=pName},[pName]);
useEffect(()=>{pIdRef.current=pId},[pId]);
useEffect(()=>{snippetsRef.current=snippets},[snippets]);
useEffect(()=>{shortcutsRef.current=shortcuts},[shortcuts]);
useEffect(()=>{pipSnippetsRef.current=pipSnippets},[pipSnippets]);
useEffect(()=>{if(rs==="recording"){tR.current=setInterval(()=>sEl(t=>t+1),1000)}else{clearInterval(tR.current);if(rs==="inactive")sEl(0)}return()=>clearInterval(tR.current)},[rs]);
useEffect(()=>{let lastSnHash="";const id=setInterval(()=>{if(!pipRef.current)return;const d=pipRef.current;const t=d.getElementById("pip-timer"),l=d.getElementById("pip-level"),s=d.getElementById("pip-status"),tr=d.getElementById("pip-transcript");if(t){const e=elRef.current;t.textContent=`${String(Math.floor(e/60)).padStart(2,"0")}:${String(e%60).padStart(2,"0")}`}if(l)l.style.width=`${lvRef.current}%`;if(s){const r=rsRef.current;s.textContent=r==="recording"?"録音中":r==="paused"?"一時停止":"停止";s.style.color=r==="recording"?C.rG:r==="paused"?C.warn:C.g400}if(tr){const r2=rsRef.current;if(r2==="inactive"&&oR.current){tr.textContent="✓ "+oR.current.split("\n")[0].substring(0,50)}else{const txt=iR.current;if(txt){const lines=txt.split("\n");tr.textContent=lines[lines.length-1]}else{tr.textContent=""}}}const c=d.getElementById("pip-snippets");if(c){const sn=snippetsRef.current;const ids=pipSnippetsRef.current;const hash=ids.join(",")+"|"+sn.length;if(hash!==lastSnHash){lastSnHash=hash;let html="";ids.forEach(idx=>{if(idx<sn.length){html+=`<button data-sn-idx="${idx}" style="padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;cursor:pointer">${sn[idx].title}</button>`}});c.innerHTML=html;c.querySelectorAll("button").forEach(b=>{b.onclick=()=>{const idx=parseInt(b.getAttribute("data-sn-idx"));const t2=snippetsRef.current[idx];if(t2)sOut(o=>o+(o?"\n":"")+t2.text)}})}}const soapB2=d.getElementById("pip-tpl-soap");const stdB2=d.getElementById("pip-tpl-std");const minB2=d.getElementById("pip-tpl-min");if(soapB2&&stdB2&&minB2){const cur=tidRef.current;[{btn:soapB2,id:"soap"},{btn:stdB2,id:"soap-std"},{btn:minB2,id:"soap-min"}].forEach(({btn,id})=>{if(cur===id){btn.style.border=`2px solid ${pipText}`;btn.style.background="rgba(255,255,255,0.8)";btn.style.fontWeight="700";btn.style.color=pipText}else{btn.style.border=`1px solid ${pipBorder}`;btn.style.background="rgba(255,255,255,0.5)";btn.style.fontWeight="600";btn.style.color=pipText}})}},500);return()=>clearInterval(id)},[]);

const fm=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
// UTC→JST変換して日付文字列を返す
const toJSTDate=(dateStr)=>{if(!dateStr)return"";const d=new Date(dateStr);const jst=new Date(d.getTime()+9*60*60*1000);return`${jst.getUTCFullYear()}/${String(jst.getUTCMonth()+1).padStart(2,"0")}/${String(jst.getUTCDate()).padStart(2,"0")}`;};
const ct=T.find(t=>t.id===tid)||T[0],cr=R.find(r=>r.id===rid);

// Supabase
const saveRecordRef=useRef(false);const saveRecord=async(input,output)=>{if(!supabase)return null;if(saveRecordRef.current){console.log("saveRecord: 重複呼び出しをスキップ");return null;}saveRecordRef.current=true;setTimeout(()=>{saveRecordRef.current=false},3000);try{const audioPath=audioPathsRef.current.length>0?audioPathsRef.current.join(","):null;const{data}=await supabase.from("records").insert({room:rid,template:tid,ai_model:md,input_text:input,output_text:output,patient_name:pNameRef.current,patient_id:pIdRef.current,audio_path:audioPath}).select("id").single();if(data?.id){setLastRecordId(data.id);lastRecordIdRef.current=data.id;}if(rid==="r7"){await supabase.from("counseling_records").insert({patient_name:pNameRef.current,patient_id:pIdRef.current,transcription:input,summary:output,room:"r7"})}return data?.id||null}catch(e){console.error("Save error:",e);return null}};
const saveFeedback=async(rating,note="")=>{if(!supabase||!lastRecordId)return;setFeedbackSaving(true);try{await supabase.from("summary_feedback").insert({record_id:lastRecordId,rating,note:note||"",summary_text:out.substring(0,1000),ai_model:geminiModel});setFeedback(rating);sSt(rating==="good"?"✓ フィードバックを保存しました":"✓ 改善点を記録しました")}catch(e){console.error("Feedback error:",e)}finally{setFeedbackSaving(false)}};
const generateDoc=async()=>{if(!docDisease.trim())return;setDocLd(true);setProg(10);setDocOut("");try{let histData=[];if(supabase){const{data}=await supabase.from("records").select("output_text").order("created_at",{ascending:false}).limit(500);if(data)histData=data.map(r=>r.output_text).filter(Boolean)}
const related=histData.filter(s=>s.includes(docDisease)).slice(0,20);
let pastKarte="";if(supabase){try{const{data:pd}=await supabase.from("past_records").select("content").or(`content.ilike.%${docDisease}%,disease.ilike.%${docDisease}%`).limit(20);if(pd&&pd.length>0)pastKarte=pd.map(r=>r.content).join("\n---\n")}catch{}}
const histText=(related.length>0?related.join("\n---\n"):"")+(pastKarte?"\n\n【過去のカルテ記録】\n"+pastKarte:"");
const sysPrompt=`あなたは皮膚科専門医です。以下の疾患/テーマについて患者向けの説明資料を作成してください。
【疾患名/テーマ】${docDisease}
${docFreePrompt?`【追加指示】${docFreePrompt}\n`:""}${histText?"【当院の過去の診療記録（参考）】\n"+histText+"\n":""}
以下の構成で患者さんにわかりやすく作成：
1. 疾患の概要（どんな病気か、原因）
2. 症状
3. 当院での治療方法（過去記録がある場合、当院で使用されている薬剤・施術を優先して記載）
4. 外用薬の使い方（該当する場合、FTU・塗り方・頻度・重ね塗り順序を含む）
5. 日常生活での注意点・スキンケア
6. 治療スケジュール・通院頻度の目安
7. 術後・施術後の注意点（該当する場合）
8. よくある質問（Q&A 2-3個）
※過去記録がある場合、当院で実際に使用されている薬剤名・施術名・治療プロトコルを反映
※専門用語は噛み砕いて説明
※美容施術の場合はカウンセリング用に効果・ダウンタイム・施術間隔も含める
※外用方法が関係する場合はFTU（1FTU=約0.5g）、塗布順序（保湿剤→ステロイド等）、プロアクティブ療法についても記載
※手術後の注意点が関係する場合はシャワー・入浴・抜糸・出血時の対応も記載`;
const langInst=docLang==="en"?"\n\nPlease write the patient explanation in English.":docLang==="zh"?"\n\n请用中文（简体）为患者写说明资料。":docLang==="ko"?"\n\n환자를 위한 설명 자료를 한국어로 작성해 주세요。":docLang==="th"?"\n\nกรุณาเขียนเอกสารอธิบายสำหรับผู้ป่วยเป็นภาษาไทย":"";
const sysPromptFinal=sysPrompt+langInst;
setProg(50);
const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:sysPromptFinal,mode:"gemini",prompt:"以下の指示に従って患者向け説明資料を作成してください。"})});const d=await r.json();if(d.error){setDocOut("エラー: "+d.error)}else{setDocOut(d.summary);setGeminiModel(d.model||"")}}catch(e){setDocOut("エラー: "+e.message)}finally{setDocLd(false);setProg(0)}};

const minMR=useRef(null),minSR=useRef(null),minIR=useRef(null),minTI=useRef(null);minIR.current=minInp;
// === 書き起こし自動保存: 起動時に未完了セッションを読み込み（失敗しても空のまま＝バナー非表示に留める） ===
useEffect(()=>{try{getRecoverableSessions().then(list=>setRecoverySessions(Array.isArray(list)?list:[])).catch(e=>console.warn("[autosave] load error:",e))}catch(e){console.warn("[autosave] load error:",e)}},[]);
// 蓄積書き起こしが更新されるたび（debounce 1.5s）にIndexedDBへ保存。effect全体をtry/catchし、失敗しても録音・書き起こしに影響させない。
useEffect(()=>{try{if(!inp||!inp.trim())return;const t=setTimeout(()=>{try{if(!examSessionIdRef.current)examSessionIdRef.current=genSessionId();saveTranscriptSession({sessionId:examSessionIdRef.current,mode:"exam",text:inp,engine:asrEngine}).then(()=>setAutosaveAt(p=>({...(p||{}),exam:Date.now()}))).catch(e=>console.warn("[autosave] save error:",e))}catch(e){console.warn("[autosave] save error:",e)}},1500);return()=>clearTimeout(t)}catch(e){console.warn("[autosave] effect error:",e)}},[inp]);
useEffect(()=>{try{if(!minInp||!minInp.trim())return;const t=setTimeout(()=>{try{if(!minSessionIdRef.current)minSessionIdRef.current=genSessionId();saveTranscriptSession({sessionId:minSessionIdRef.current,mode:"minutes",text:minInp,engine:asrEngine}).then(()=>setAutosaveAt(p=>({...(p||{}),minutes:Date.now()}))).catch(e=>console.warn("[autosave] save error:",e))}catch(e){console.warn("[autosave] save error:",e)}},1500);return()=>clearTimeout(t)}catch(e){console.warn("[autosave] effect error:",e)}},[minInp]);
useEffect(()=>{try{if(!smnTranscript||!smnTranscript.trim())return;const t=setTimeout(()=>{try{if(!smnSessionIdRef.current)smnSessionIdRef.current=genSessionId();saveTranscriptSession({sessionId:smnSessionIdRef.current,mode:"seminar",text:smnTranscript,engine:asrEngine}).then(()=>setAutosaveAt(p=>({...(p||{}),seminar:Date.now()}))).catch(e=>console.warn("[autosave] save error:",e))}catch(e){console.warn("[autosave] save error:",e)}},1500);return()=>clearTimeout(t)}catch(e){console.warn("[autosave] effect error:",e)}},[smnTranscript]);
// バックグラウンド化・タブ破棄時は即時フラッシュ保存（debounce待ちを飛ばす）。iOS Safariのタブ破棄対策。beforeunloadはiOSで信頼できないため使わない。
useEffect(()=>{
const flush=()=>{try{
if(iR.current&&iR.current.trim()&&examSessionIdRef.current)saveTranscriptSession({sessionId:examSessionIdRef.current,mode:"exam",text:iR.current,engine:asrEngine});
if(minIR.current&&minIR.current.trim()&&minSessionIdRef.current)saveTranscriptSession({sessionId:minSessionIdRef.current,mode:"minutes",text:minIR.current,engine:asrEngine});
if(smnTextRef.current&&smnTextRef.current.trim()&&smnSessionIdRef.current)saveTranscriptSession({sessionId:smnSessionIdRef.current,mode:"seminar",text:smnTextRef.current,engine:asrEngine});
}catch(e){console.warn("[autosave] flush error:",e)}};
const onVis=()=>{if(document.hidden)flush()};
document.addEventListener("visibilitychange",onVis);
window.addEventListener("pagehide",flush);
return()=>{document.removeEventListener("visibilitychange",onVis);window.removeEventListener("pagehide",flush)}
},[]);
const minGo=async()=>{minAudioPathsRef.current=[];const s=await sAM();if(!s)return;const mr=new MediaRecorder(s,{mimeType:"audio/webm;codecs=opus"});minMR.current=mr;let ch=[];mr.ondataavailable=e=>{if(e.data.size>0){ch.push(e.data);if(minAudioSave)minAllAudioChunks.current.push(e.data)}};mr.onstop=async()=>{if(ch.length>0){const b=new Blob(ch,{type:"audio/webm"});ch=[];if(b.size<500)return;
// 議事録も無音スキップ（音声レベル参照）
bumpDiag("rec");noteDiagMR(minMR.current,b.size);if(!disableSilenceSkipRef.current&&Date.now()-lvLastUpdateRef.current<5000&&lvRef.current<1)return;bumpDiag("lv");if(await isSilentChunk(b))return;bumpDiag("sil");try{const f=new FormData();f.append("audio",b,"audio.webm");if(asrEngine==="both"){const f2=new FormData();f2.append("audio",b,"audio.webm");f2.append("compare","1");const callW=async()=>{const s=performance.now();try{bumpDiag("sent");const r=await fetch("/api/transcribe",{method:"POST",body:f});if(r.ok)bumpDiag("ok");else{bumpDiag("err");setDiagErr("HTTP "+r.status)}const ct=r.headers.get("content-type")||"";if(!r.ok||!ct.includes("json"))return{failed:true,error:`Whisper ${r.status}`,ms:Math.round(performance.now()-s)};const d=await r.json();setDiagLastLen((d.text||"").length);return{text:d.text||"",ms:Math.round(performance.now()-s)}}catch(e){return{failed:true,error:"Whisper 例外",ms:Math.round(performance.now()-s)}}};const callA=async()=>{const s=performance.now();try{const r=await fetch("/api/transcribe-avalon",{method:"POST",body:f2});const ct=r.headers.get("content-type")||"";if(!r.ok||!ct.includes("json"))return{failed:true,error:`Avalon ${r.status}（非JSON）`,ms:Math.round(performance.now()-s)};const d=await r.json();if(d.failed)return{failed:true,error:d.error||"Avalon 接続失敗",ms:Math.round(performance.now()-s)};return{text:d.text||"",ms:Math.round(performance.now()-s)}}catch(e){return{failed:true,error:"Avalon 例外",ms:Math.round(performance.now()-s)}}};const[w,a]=await Promise.all([callW(),isIOSDevice?Promise.resolve({failed:true,error:"iOS（iPhone/iPad）は音声形式の制約でAvalon非対応のためWhisperのみ表示",ms:0,ios:true}):callA()]);if(!w.failed)fetch("/api/log-usage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({route:"/api/transcribe",model:"whisper-1",context:"transcribe-minutes-ab",duration_seconds:10,request_meta:{blob_size:b.size,text_length:(w.text||"").length}})}).catch(()=>{});if(w.failed){setAbWhisperMs(m=>m+w.ms)}else{const wn=filterTranscriptNoise((w.text||"").trim());if(wn)setAbWhisper(p=>foldAccum(p+(p?"\n":"")+wn));setAbWhisperMs(m=>m+w.ms)}if(a.failed){setAbAvalonError(a.error||"接続失敗");setAbAvalonIOS(!!a.ios);setAbAvalonMs(m=>m+a.ms)}else{setAbAvalonError("");setAbAvalonIOS(false);const an=filterTranscriptNoise((a.text||"").trim());if(an)setAbAvalon(p=>foldAccum(p+(p?"\n":"")+an));setAbAvalonMs(m=>m+a.ms)}return}const endpoint=(asrEngine==="avalon"&&!isIOSDevice)?"/api/transcribe-avalon":asrEngine==="qwen"?"/api/transcribe-qwen":asrEngine==="gemini"?"/api/transcribe-gemini":"/api/transcribe";bumpDiag("sent");const r=await fetch(endpoint,{method:"POST",body:f});if(r.ok)bumpDiag("ok");else{bumpDiag("err");setDiagErr("HTTP "+r.status)}const d=await r.json();if(r.ok)setDiagLastLen(((d&&d.text)||"").length);if(asrEngine==="avalon"){if(d&&d.fallback){setAvalonFellBack(true);setAvalonFellBackReason(d.avalonError||"")}else if(d&&!d.fallback){setAvalonFellBack(false);setAvalonFellBackReason("")}}if(endpoint==="/api/transcribe"){fetch("/api/log-usage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({route:"/api/transcribe",model:"whisper-1",context:"transcribe-minutes",duration_seconds:10,request_meta:{blob_size:b.size,text_length:(d.text||"").length}})}).catch(()=>{});}if(d.text&&d.text.trim()){const noise=filterTranscriptNoise(d.text.trim());if(noise){setMinInp(p=>foldAccum(p+(p?"\n":"")+noise))}}}catch(e){bumpDiag("err");setDiagErr(String((e&&e.message)||e))}}};mr.start();setMinRS("recording");setMinEl(0);const ti=setInterval(()=>{setMinEl(t=>t+1)},1000);const ci=setInterval(()=>{if(minMR.current&&minMR.current.state==="recording"){minMR.current.stop();setTimeout(()=>{if(minMR.current&&minSR.current!=="inactive"){minMR.current.start()}},200)}},10000);minTI.current={ti,ci};
// 30分ごとの自動下書き保存タイマー開始
if(minAutoSaveRef.current)clearInterval(minAutoSaveRef.current);
updateMinDraftId(null);
console.log("[saveMinDraft] auto-save interval: 30 minutes");
minAutoSaveRef.current=setInterval(()=>{saveMinDraft(true)},30*60*1000)};
const minStop=()=>{
if(minAutoSaveRef.current){clearInterval(minAutoSaveRef.current);minAutoSaveRef.current=null;}
if(minTI.current){if(minTI.current.ti)clearInterval(minTI.current.ti);if(minTI.current.ci)clearInterval(minTI.current.ci);minTI.current=null}
if(minMR.current&&minMR.current.state!=="inactive"){try{minMR.current.stop()}catch{}}
setMinRS("inactive");minSR.current="inactive";xAM();
// 録音停止時もドラフトを削除
if(minDraftId&&supabase){
  supabase.from("minutes").delete().eq("id",minDraftId).then(()=>{}).catch(()=>{});
  updateMinDraftId(null);
}
// 音声保存ONの場合、停止時に保存
if(minAudioSave&&minAllAudioChunks.current.length>0){
const blob=new Blob(minAllAudioChunks.current,{type:"audio/webm"});
minAllAudioChunks.current=[];
saveMinAudio(blob,minTitle);
}
};
// Stage 2: 議事録 pause/resume （minGo本体は無改修。minTI から ti/ci を取り出して操作する純粋追加）
const pauseMin=()=>{
  if(!minMR.current||minMR.current.state!=="recording")return;
  try{minMR.current.pause()}catch(e){console.warn("[pauseMin] MR pause error:",e);return}
  if(minTI.current){if(minTI.current.ti)clearInterval(minTI.current.ti);if(minTI.current.ci)clearInterval(minTI.current.ci);minTI.current=null;}
  setMinRS("paused");
};
const resumeMin=()=>{
  if(!minMR.current||minMR.current.state!=="paused")return;
  try{minMR.current.resume()}catch(e){console.warn("[resumeMin] MR resume error:",e);return}
  // minGo の ti/ci と完全に同じコードをコピー
  const ti=setInterval(()=>{setMinEl(t=>t+1)},1000);
  const ci=setInterval(()=>{if(minMR.current&&minMR.current.state==="recording"){minMR.current.stop();setTimeout(()=>{if(minMR.current&&minSR.current!=="inactive"){minMR.current.start()}},200)}},10000);
  minTI.current={ti,ci};
  setMinRS("recording");
};
// === セミナー学習: 録音（議事録 minGo/minStop/pauseMin/resumeMin の完全コピー＋R-3音声保存3箇所追加） ===
// R-3: セミナー音声保存（議事録 saveMinAudio の seminar-audio/ バケットパス版）
const saveSmnAudio=async(blob,title)=>{
  if(!supabase||!blob||blob.size<1000)return null;
  try{
    const ts=new Date().toISOString().replace(/[:.]/g,"-");
    const safeName=(title||"seminar").replace(/[^a-zA-Z0-9぀-鿿\-_]/g,"_").substring(0,30);
    const path=`seminar-audio/${ts}_${safeName}.webm`;
    const{error}=await supabase.storage.from("audio").upload(path,blob,{contentType:"audio/webm"});
    if(error){
      console.error("Seminar audio save error:",error);
      sSt("⚠️ 音声保存エラー: "+error.message);
      return null;
    }
    console.log("Seminar audio saved:",path);
    smnAudioPathRef.current=path;
    sSt("🎙️ 音声を保存しました");
    return path;
  }catch(e){
    console.error("[saveSmnAudio] exception:",e);
    return null;
  }
};
const smnGo=async()=>{smnAllAudioChunksRef.current=[];smnAudioPathRef.current=null;const s=await sAM();if(!s)return;const mr=new MediaRecorder(s,{mimeType:"audio/webm;codecs=opus"});smnMR.current=mr;let ch=[];mr.ondataavailable=e=>{if(e.data.size>0){ch.push(e.data);if(smnAudioSave)smnAllAudioChunksRef.current.push(e.data)}};mr.onstop=async()=>{if(ch.length>0){const b=new Blob(ch,{type:"audio/webm"});ch=[];if(b.size<500)return;
// セミナーも無音スキップ（音声レベル参照）
bumpDiag("rec");noteDiagMR(smnMR.current,b.size);if(!disableSilenceSkipRef.current&&Date.now()-lvLastUpdateRef.current<5000&&lvRef.current<1)return;bumpDiag("lv");if(await isSilentChunk(b))return;bumpDiag("sil");try{const f=new FormData();f.append("audio",b,"audio.webm");const endpoint=(asrEngine==="avalon"&&!isIOSDevice)?"/api/transcribe-avalon":asrEngine==="qwen"?"/api/transcribe-qwen":asrEngine==="gemini"?"/api/transcribe-gemini":"/api/transcribe";bumpDiag("sent");const r=await fetch(endpoint,{method:"POST",body:f});if(r.ok)bumpDiag("ok");else{bumpDiag("err");setDiagErr("HTTP "+r.status)}const d=await r.json();if(r.ok)setDiagLastLen(((d&&d.text)||"").length);if(asrEngine==="avalon"){if(d&&d.fallback){setAvalonFellBack(true);setAvalonFellBackReason(d.avalonError||"")}else if(d&&!d.fallback){setAvalonFellBack(false);setAvalonFellBackReason("")}}if(endpoint==="/api/transcribe"){fetch("/api/log-usage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({route:"/api/transcribe",model:"whisper-1",context:"transcribe-seminar",duration_seconds:10,request_meta:{blob_size:b.size,text_length:(d.text||"").length}})}).catch(()=>{});}if(d.text&&d.text.trim()){const noise=filterTranscriptNoise(d.text.trim());if(noise){setSmnTranscript(p=>foldAccum(p+(p?"\n":"")+noise))}}}catch(e){bumpDiag("err");setDiagErr(String((e&&e.message)||e))}}};mr.start();setSmnRS("recording");setSmnEl(0);const ti=setInterval(()=>{setSmnEl(t=>t+1)},1000);const ci=setInterval(()=>{if(smnMR.current&&smnMR.current.state==="recording"){smnMR.current.stop();setTimeout(()=>{if(smnMR.current&&smnSR.current!=="inactive"){smnMR.current.start()}},200)}},10000);smnTR.current={ti,ci};};
const smnStop=()=>{
if(smnTR.current){if(smnTR.current.ti)clearInterval(smnTR.current.ti);if(smnTR.current.ci)clearInterval(smnTR.current.ci);smnTR.current=null}
if(smnMR.current&&smnMR.current.state!=="inactive"){try{smnMR.current.stop()}catch{}}
setSmnRS("inactive");smnSR.current="inactive";xAM();
// R-3: 音声保存ONの場合、停止時に保存
if(smnAudioSave&&smnAllAudioChunksRef.current.length>0){
const blob=new Blob(smnAllAudioChunksRef.current,{type:"audio/webm"});
smnAllAudioChunksRef.current=[];
saveSmnAudio(blob,smnTitle);
}
};
// Stage 3: セミナー pause/resume （議事録 pauseMin/resumeMin の完全コピー、変数名のみ smn* に置換）
const pauseSmn=()=>{
  if(!smnMR.current||smnMR.current.state!=="recording")return;
  try{smnMR.current.pause()}catch(e){console.warn("[pauseSmn] MR pause error:",e);return}
  if(smnTR.current){if(smnTR.current.ti)clearInterval(smnTR.current.ti);if(smnTR.current.ci)clearInterval(smnTR.current.ci);smnTR.current=null;}
  setSmnRS("paused");
};
const resumeSmn=()=>{
  if(!smnMR.current||smnMR.current.state!=="paused")return;
  try{smnMR.current.resume()}catch(e){console.warn("[resumeSmn] MR resume error:",e);return}
  // smnGo の ti/ci と完全に同じコードをコピー
  const ti=setInterval(()=>{setSmnEl(t=>t+1)},1000);
  const ci=setInterval(()=>{if(smnMR.current&&smnMR.current.state==="recording"){smnMR.current.stop();setTimeout(()=>{if(smnMR.current&&smnSR.current!=="inactive"){smnMR.current.start()}},200)}},10000);
  smnTR.current={ti,ci};
  setSmnRS("recording");
};
// === セミナー学習: 詳細要約生成 ===
const runSmnSummary=async()=>{
  let txt=smnTextRef.current||smnTranscript;
  if(!txt||txt.length<100){sSt("⚠️ 書き起こしが短すぎます（100文字以上必要）");return;}
  setSmnSummaryLoading(true);setProg(20);
  // 高速化のため要約直前の自動補正(直列)は廃止。補正は手動「✨書き起こしを補正」ボタンで明示実行する。
  try{
    const r=await fetch("/api/seminar-summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:txt,model_preference:smnSummaryModel})});
    setProg(70);
    if(!r.ok){const t=await r.text();throw new Error("HTTP "+r.status+" "+t.substring(0,200))}
    const d=await r.json();
    if(d.error)throw new Error(d.error);
    setSmnSummary(d.summary||"");
    setSmnSummaryModelUsed(d.model||"");
    sSt("✓ 詳細要約を生成しました");
  }catch(e){
    console.error("[smnSummary] error:",e);
    sSt("⚠️ 要約生成に失敗: "+e.message);
  }finally{setSmnSummaryLoading(false);setProg(0)}
};
// === セミナー学習: Genspark共有用テキスト生成 ===
const runSmnGenspark=async()=>{
  if(!smnSummary||smnSummary.length<50){sSt("⚠️ 先に詳細要約を生成してください");return;}
  setSmnGensparkLoading(true);
  try{
    const r=await fetch("/api/seminar-genspark",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({summary:smnSummary,model_preference:smnSummaryModel})});
    if(!r.ok){const t=await r.text();throw new Error("HTTP "+r.status+" "+t.substring(0,200))}
    const d=await r.json();
    if(d.error)throw new Error(d.error);
    setSmnGensparkText(d.result||"");
    sSt("✓ Genspark用テキストを生成しました");
  }catch(e){
    console.error("[smnGenspark] error:",e);
    sSt("⚠️ Gensparkテキスト生成に失敗: "+e.message);
  }finally{setSmnGensparkLoading(false)}
};
// === セミナー学習: AI気づき・提案生成 ===
const runSmnInsights=async()=>{
  if(!smnSummary||smnSummary.length<50){sSt("⚠️ 先に詳細要約を生成してください");return;}
  setSmnInsightsLoading(true);
  try{
    const r=await fetch("/api/seminar-insights",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({summary:smnSummary,model_preference:smnSummaryModel})});
    if(!r.ok){const t=await r.text();throw new Error("HTTP "+r.status+" "+t.substring(0,200))}
    const d=await r.json();
    if(d.error)throw new Error(d.error);
    setSmnInsights(d.result||"");
    sSt("✓ AI気づき・提案を生成しました");
  }catch(e){
    console.error("[smnInsights] error:",e);
    sSt("⚠️ 気づき・提案生成に失敗: "+e.message);
  }finally{setSmnInsightsLoading(false)}
};
// === セミナー学習: 保存（counseling_analyses に analysis_type='seminar' で保存） ===
const saveSmnResult=async()=>{
  if(!supabase){sSt("Supabase未接続");return;}
  if(!smnSummary){sSt("⚠️ 要約がまだ生成されていません");return;}
  try{
    const title=smnTitle||`[セミナー] ${new Date().toLocaleString("ja-JP")}`;
    // R-3: audio_path カラム有無に関わらず安全に動作させるため、ref がある場合のみ追加
    const insertData={
      title,
      analysis_type:"seminar",
      input_text:smnTranscript||"",
      output_text:smnSummary,
      ai_model:smnSummaryModelUsed||smnSummaryModel,
      scores:{
        genspark:smnGensparkText||null,
        insights:smnInsights||null,
      },
    };
    if(smnAudioPathRef.current)insertData.audio_path=smnAudioPathRef.current;
    const{error}=await supabase.from("counseling_analyses").insert(insertData);
    if(error)throw error;
    setSmnSaved(true);
    sSt("✓ 保存しました");
  }catch(e){
    console.error("[smnSave] error:",e);
    sSt("⚠️ 保存に失敗: "+e.message);
  }
};
// セミナー: 停止して書き起こしを保存（要約なし）。議事録 minStopAndSaveOnly のセミナー版。
// セミナーはドラフト機構が無く競合しないため smnStop() をそのまま呼ぶ（音声保存ONならStorage保存も実施）。
// 要約APIは呼ばず、counseling_analyses に書き起こしのみ保存（saveSmnResult は要約必須のため流用不可）。再開は「録音開始」で続きから追記。
const smnStopAndSaveOnly=async()=>{
  const txt=smnTranscript||smnTextRef.current||"";
  if(!txt.trim()){sSt("書き起こしがありません");return}
  smnStop();
  if(!supabase){sSt("Supabase未接続");return}
  try{
    const title=smnTitle||`[セミナー] ${new Date().toLocaleString("ja-JP")}`;
    const insertData={
      title,
      analysis_type:"seminar",
      input_text:txt,
      output_text:"（要約未完了）",
      ai_model:smnSummaryModelUsed||smnSummaryModel,
      scores:{genspark:null,insights:null},
    };
    if(smnAudioPathRef.current)insertData.audio_path=smnAudioPathRef.current;
    const{error}=await supabase.from("counseling_analyses").insert(insertData);
    if(error)throw error;
    setSmnSaved(true);
    sSt("✅ 書き起こしを保存しました（要約なし）");
  }catch(e){
    console.error("[smnStopSave] error:",e);
    sSt("⚠️ 保存に失敗: "+e.message);
  }
};
const openSmnHist=async()=>{
  if(!supabase){sSt("Supabase未接続");return;}
  setSmnHistOpen(true);
  try{
    const{data,error}=await supabase.from("counseling_analyses").select("id,title,input_text,output_text,ai_model,scores,audio_path,created_at").eq("analysis_type","seminar").order("created_at",{ascending:false}).limit(50);
    if(error)throw error;
    setSmnHistList(data||[]);
  }catch(e){
    console.error("[smnHist] error:",e);
    sSt("⚠️ 履歴取得に失敗: "+e.message);
  }
};
const restoreSmnRecord=(item)=>{
  smnRestoringRef.current=true;
  setSmnTitle(item.title?item.title.replace(/^\[セミナー\]\s*/,""):"");
  setSmnTranscript(item.input_text||"");
  setSmnSummary(item.output_text||"");
  setSmnSummaryModelUsed(item.ai_model||"");
  if(item.scores){
    setSmnGensparkText(item.scores.genspark||"");
    setSmnInsights(item.scores.insights||"");
  }else{
    setSmnGensparkText("");setSmnInsights("");
  }
  // R-3: 音声パスも復元
  smnAudioPathRef.current=item.audio_path||null;
  setSmnHistOpen(false);
  setSmnSaved(true);
  sSt("✓ "+new Date(item.created_at).toLocaleDateString("ja-JP")+" のセミナーを復元しました");
};
const deleteSmnRecord=async(id)=>{
  if(!supabase)return;
  if(!window.confirm("このセミナー記録を削除しますか？"))return;
  try{
    const{error}=await supabase.from("counseling_analyses").delete().eq("id",id);
    if(error)throw error;
    setSmnHistList(p=>p.filter(x=>x.id!==id));
    sSt("✓ 削除しました");
  }catch(e){
    console.error("[smnDelete] error:",e);
    sSt("⚠️ 削除に失敗: "+e.message);
  }
};
const clearSmnAll=()=>{
  if(!window.confirm("入力中のセミナー学習内容（書き起こし・要約・Genspark・気づき）をすべてクリアしますか？"))return;
  try{if(smnSessionIdRef.current){deleteTranscriptSession(smnSessionIdRef.current);smnSessionIdRef.current=null}}catch{}
  smnStop();
  setSmnTitle("");setSmnTranscript("");setSmnSummary("");setSmnGensparkText("");setSmnInsights("");setSmnSummaryModelUsed("");
  setSmnSaved(false);
  // R-3: 音声状態もリセット
  smnAudioPathRef.current=null;smnAllAudioChunksRef.current=[];
};
const loadMinHist=async()=>{if(!supabase)return;try{const[{data},{count}]=await Promise.all([supabase.from("minutes").select("*").order("created_at",{ascending:false}).limit(500),supabase.from("minutes").select("*",{count:"exact",head:true})]);if(data)setMinHist(data);if(typeof count==="number")setMinHistTotal(count);console.log(`[minHist] fetched: ${data?.length||0}件 / total: ${count||0}件`)}catch(e){console.error("[minHist] load error:",e)}};
// 議事録画面を開いた時に履歴を自動取得
useEffect(()=>{if(page==="minutes"&&supabase){loadMinHist()}},[page]);
const saveMinInputOnly=async()=>{
  if(!supabase||!minIR.current?.trim()){
    sSt("書き起こしがありません");return;
  }
  try{
    const title=minTitle||new Date().toLocaleDateString("ja-JP")+" "+new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+"の議事録（書き起こしのみ）";
    if(minDraftId){
      await supabase.from("minutes").update({
        title,
        input_text:minIR.current,
        output_text:"（要約未完了）"
      }).eq("id",minDraftId);
      updateMinDraftId(null);
    }else{
      await supabase.from("minutes").insert({
        title,
        input_text:minIR.current,
        output_text:"（要約未完了）"
      });
    }
    lastSavedMinInpRef.current=minIR.current||"";
    await loadMinHist();
    sSt("✅ 書き起こしを保存しました");
  }catch(e){
    sSt("保存エラー: "+e.message);
  }
};
// 停止して内容を保存（要約なし）: 録音停止のみ行い書き起こしを保存。再開は「録音開始」で続きから追記（minInpは消さない）。
// ※ minStop() は呼ばない（minStop はドラフト行を削除するため、saveMinInputOnly のドラフト昇格と競合する）。
//   録音停止の手順は minStop と同等（音声保存含む）だが、ドラフト削除ブロックのみ意図的に省く。
const minStopAndSaveOnly=async()=>{
  if(!minIR.current?.trim()){sSt("書き起こしがありません");return}
  // --- 録音停止（minStop 同等：タイマー停止・MediaRecorder停止・状態inactive） ---
  if(minAutoSaveRef.current){clearInterval(minAutoSaveRef.current);minAutoSaveRef.current=null;}
  if(minTI.current){if(minTI.current.ti)clearInterval(minTI.current.ti);if(minTI.current.ci)clearInterval(minTI.current.ci);minTI.current=null}
  if(minMR.current&&minMR.current.state!=="inactive"){try{minMR.current.stop()}catch{}}
  setMinRS("inactive");minSR.current="inactive";xAM();
  // 音声保存ONなら音声も保存（minStop と同じ）
  if(minAudioSave&&minAllAudioChunks.current.length>0){
    const blob=new Blob(minAllAudioChunks.current,{type:"audio/webm"});
    minAllAudioChunks.current=[];
    saveMinAudio(blob,minTitle);
  }
  // --- 要約APIは呼ばない。書き起こしのみ保存（既存 saveMinInputOnly を流用：draftがあれば昇格・なければinsert） ---
  await saveMinInputOnly();
};
// 要約のみをSupabaseに保存（画面リセットなし）
const saveMinOutputOnly=async()=>{
  if(!supabase){sSt("Supabase未接続");return;}
  if(!minOut?.trim()||minOut.startsWith("エラー")){sSt("要約がありません");return;}
  try{
    const title=minTitle||new Date().toLocaleDateString("ja-JP")+" "+new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+"の議事録";
    const minAudioPath=minAudioPathsRef.current.length>0?minAudioPathsRef.current.join(","):null;
    if(minDraftIdRef.current){
      const updateData={title,input_text:minIR.current||"",output_text:minOut};
      if(minAudioPath)updateData.audio_path=minAudioPath;
      await supabase.from("minutes").update(updateData).eq("id",minDraftIdRef.current);
    }else{
      const{data:inserted}=await supabase.from("minutes").insert({
        title,
        input_text:minIR.current||"",
        output_text:minOut,
        audio_path:minAudioPath
      }).select().single();
      if(inserted)updateMinDraftId(inserted.id);
    }
    lastSavedMinInpRef.current=minIR.current||"";
    lastSavedMinOutRef.current=minOut;
    await loadMinHist();
    sSt("✅ 要約を保存しました");
  }catch(e){
    sSt("保存エラー: "+e.message);
  }
};
// 対策4: チャンク要約連結を議事録として保存（最終統合失敗時のフォールバック）
const saveMinPartial=async()=>{
  if(!supabase||!minIR.current?.trim()){sSt("書き起こしがありません");return;}
  if(!minChunkSummaries||minChunkSummaries.length===0){sSt("チャンク要約がありません");return;}
  try{
    const partialSummary="# ⚠️ 部分保存: 最終統合失敗のためチャンク要約を連結\n\n"+minChunkSummaries.join("\n\n---\n\n");
    const title=minTitle||new Date().toLocaleDateString("ja-JP")+" "+new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+"の議事録（部分保存）";
    const minAudioPath=minAudioPathsRef.current.length>0?minAudioPathsRef.current.join(","):null;
    if(minDraftId){
      const updateData={title,input_text:minIR.current,output_text:partialSummary};
      if(minAudioPath)updateData.audio_path=minAudioPath;
      await supabase.from("minutes").update(updateData).eq("id",minDraftId);
      updateMinDraftId(null);
    }else{
      await supabase.from("minutes").insert({title,input_text:minIR.current,output_text:partialSummary,audio_path:minAudioPath});
    }
    await loadMinHist();
    sSt("✓ チャンク要約で保存しました（"+minChunkSummaries.length+"チャンク分）");
  }catch(e){
    sSt("保存エラー: "+e.message);
  }
};
const saveMinEdit=async()=>{
  if(!supabase||!editMinId)return;
  setEditMinSaving(true);
  try{
    await supabase.from("minutes").update({
      title:editMinTitle,
      output_text:editMinText
    }).eq("id",editMinId);
    await loadMinHist();
    setEditMinId(null);
    setEditMinText("");
    setEditMinTitle("");
    sSt("✓ 議事録を保存しました");
  }catch(e){
    sSt("保存エラー: "+e.message);
  }finally{
    setEditMinSaving(false);
  }
};
// 書き起こし全文の上書き保存（既存カラム minutes.input_text をそのまま更新。saveMinEditと同パターン）
const saveMinTxEdit=async()=>{
  if(!supabase||!editMinTxId)return;
  setEditMinTxSaving(true);
  try{
    await supabase.from("minutes").update({input_text:editMinTxText}).eq("id",editMinTxId);
    await loadMinHist();
    setEditMinTxId(null);
    setEditMinTxText("");
    sSt("✓ 書き起こしを保存しました");
  }catch(e){
    sSt("保存エラー: "+e.message);
  }finally{
    setEditMinTxSaving(false);
  }
};
const saveManualMinute=async()=>{
if(!supabase||!manualMinText.trim())return;
setProg(10);sSt("議事録を保存中...");
try{
await supabase.from("minutes").insert({
title:manualMinTitle.trim()||new Date().toLocaleDateString("ja-JP")+"の議事録",
input_text:manualMinText,
output_text:manualMinText
});
setProg(50);
await loadMinHist();
setManualMinText("");
setManualMinTitle("");
sSt("✓ 議事録を登録しました");
}catch(e){
sSt("登録エラー: "+e.message);
}finally{setProg(0)}
};
const handleMinuteFile=async(file)=>{
if(!file)return;
setProg(10);sSt("ファイル読み込み中...");
try{
if(file.name.endsWith(".docx")){
const buf=await file.arrayBuffer();
const uint=new Uint8Array(buf);
let text="";
for(let i=0;i<uint.length;i++){
if(uint[i]>=32&&uint[i]<127)text+=String.fromCharCode(uint[i]);
}
setManualMinText(text.substring(0,5000)||"docxファイルの読み取りに失敗しました");
}else{
const text=await file.text();
setManualMinText(text);
}
if(!manualMinTitle.trim()){
setManualMinTitle(file.name.replace(/\.[^.]+$/,""));
}
sSt("✓ ファイルを読み込みました");
}catch(e){
sSt("ファイル読み込みエラー: "+e.message);
}finally{setProg(0)}
};
const loadTasks=async()=>{if(!supabase)return;try{const{data}=await supabase.from("tasks").select("*").order("created_at",{ascending:false});if(data)setTasks(data)}catch{}};
const loadTodos=async()=>{if(!supabase)return;try{const{data}=await supabase.from("todos").select("*").order("sort_order");if(data)setTodos(data)}catch{}};
const generateTodosForTask=async(task)=>{if(!supabase)return;setTodoLd(true);setProg(10);try{const p="以下のタスクについて、すぐに実行できる具体的なTODOリストを生成してください。皮膚科・美容皮膚科クリニックの実務に即した内容にしてください。\nJSON配列のみ返してください。\n[{\"title\":\"TODO内容\",\"assignee\":\"\",\"due_date\":null,\"sort_order\":1}]\n\nタスク: "+task.title;setProg(30);const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:p,mode:"gemini",prompt:"JSON配列のみ返してください。"})});const d=await r.json();setProg(60);if(d.summary){let j=d.summary.replace(/```json?\s*/gi,"").replace(/```\s*/g,"").trim();const si=j.indexOf("[");const ei=j.lastIndexOf("]");if(si!==-1&&ei!==-1){j=j.substring(si,ei+1);const parsed=JSON.parse(j);if(Array.isArray(parsed)){for(let i=0;i<parsed.length;i++){await supabase.from("todos").insert({task_id:task.id,title:parsed[i].title||"",assignee:parsed[i].assignee||"",due_date:parsed[i].due_date||null,sort_order:i+1})}await loadTodos();sSt("✓ "+parsed.length+"件のTODOを生成")}}}setProg(90)}catch(e){sSt("TODO生成エラー: "+e.message)}finally{setTodoLd(false);setProg(0)}};
const deleteTask=async(id)=>{if(!supabase)return;if(!window.confirm("このタスクを削除しますか？"))return;await supabase.from("tasks").delete().eq("id",id);await loadTasks();await loadTodos();sSt("✓ タスクを削除しました")};
const toggleTodo=async(id,done)=>{if(!supabase)return;await supabase.from("todos").update({done:!done}).eq("id",id);loadTodos()};
const updateTodo=async(id,field,value)=>{if(!supabase)return;await supabase.from("todos").update({[field]:value}).eq("id",id);loadTodos()};
const deleteTodo=async(id)=>{if(!supabase)return;await supabase.from("todos").delete().eq("id",id);loadTodos()};
const loadStaff=async()=>{if(!supabase)return;try{const{data}=await supabase.from("staff").select("*").order("name");if(data)setStaffList(data)}catch{}};
const toggleTask=async(id,done)=>{if(!supabase)return;await supabase.from("tasks").update({done:!done}).eq("id",id);loadTasks()};
const updateTask=async(id,field,value)=>{if(!supabase)return;await supabase.from("tasks").update({[field]:value}).eq("id",id);loadTasks()};
const generateTasksFromMinute=async(minute)=>{
if(!supabase||!minute.output_text)return;
sSt("タスク生成中...");setProg(5);
const maxClientRetries=2;
let attempt=0;
let td=null;
try{
setProg(15);
while(attempt<=maxClientRetries){
setProg(30);
const tr=await fetch("/api/extract-tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:minute.output_text||""})});
if(tr.status===429){
if(attempt<maxClientRetries){
const waitSec=(attempt+1)*10;
sSt("⏳ レート制限中。"+waitSec+"秒後に再試行します...("+(attempt+1)+"/"+maxClientRetries+")");
await new Promise(r=>setTimeout(r,waitSec*1000));
attempt++;
continue;
}
sSt("⏳ APIレート制限に達しました。議事録要約直後はAPIが混雑しています。1〜2分待ってから再度「タスク生成」を押してください。要約モデルをFlash↔Pro↔Claudeで切り替えると回避できることがあります。");
setProg(0);return;
}
if(!tr.ok){sSt("タスク生成エラー: HTTP "+tr.status);setProg(0);return}
td=await tr.json();
break;
}
if(!td){setProg(0);return}
setProg(55);
if(td.error&&(!td.tasks||td.tasks.length===0)){sSt("タスク生成エラー: "+td.error);setProg(0);return}
if(td.tasks&&Array.isArray(td.tasks)&&td.tasks.length>0){
const parsed=td.tasks;
setProg(70);
let count=0;
for(let i=0;i<parsed.length;i++){
const t=parsed[i];
await supabase.from("tasks").insert({
minute_id:minute.id,
title:t.title||"未定",
assignee:t.assignee||"",
due_date:t.due_date||null,
urgency:Math.min(4,Math.max(1,parseInt(t.urgency)||2)),
importance:Math.min(4,Math.max(1,parseInt(t.importance)||2)),
category:["operations","medical","hr","finance"].includes(t.category)?t.category:"operations",
role_level:["director","manager","leader","staff"].includes(t.role_level)?t.role_level:"staff"
});
count++;
setProg(70+Math.floor(i/parsed.length*20));
}
await loadTasks();
setProg(95);
let chunkMsg="";
if(td.chunked){chunkMsg="（"+td.chunkCount+"チャンク分割処理";if(td.failedChunkCount>0)chunkMsg+="、"+td.failedChunkCount+"チャンク失敗";chunkMsg+="）"}
sSt("");setTimeout(()=>{const ok=window.confirm(count+"件のタスクを生成しました！"+chunkMsg+"\n\n四象限マトリクスを表示しますか？");if(ok){loadTasks();setPage("tasks");setTaskView("matrix")}},300);
}else{
sSt("タスクが抽出できませんでした");
}
}catch(e){
console.error("Task gen error:",e);
const msg=e?.message||String(e);
if(msg.includes("429")||msg.includes("レート制限")){sSt("⏳ APIレート制限に達しました。1〜2分待ってから再度「タスク生成」を押してください。")}
else{sSt("タスク生成エラー: "+msg)}
}finally{setProg(0)}
};
const generateTasksFromSelected=async()=>{if(selMinutes.length===0)return;for(const id of selMinutes){const m=minHist.find(x=>x.id===id);if(m)await generateTasksFromMinute(m)}setSelMinutes([]);sSt("");setTimeout(()=>{const ok=window.confirm("選択した議事録からタスクを生成しました！\n\n四象限マトリクスを表示しますか？");if(ok){loadTasks();setPage("tasks");setTaskView("matrix")}},300)};
const analyzeSelectedMinutes=async()=>{if(selMinutes.length===0||!supabase)return;setTaskAnalLd(true);setTaskAnalysis("");try{const selected=selMinutes.map(id=>minHist.find(x=>x.id===id)).filter(Boolean).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));const combined=selected.map(m=>`【${new Date(m.created_at).toLocaleDateString("ja-JP")} ${m.title||"無題"}】\n${m.output_text||""}`).join("\n\n---\n\n");const prompt=`以下の複数の議事録を時系列で分析してください。\n\n${combined}\n\n以下の観点で分析：\n1. 各会議の要点サマリー\n2. 時系列での進捗・変化\n3. 繰り返し出ているテーマ・課題\n4. 未解決のアクションアイテム\n5. 次回会議への提言`;const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:prompt,mode:"gemini",prompt:"時系列分析してください。"})});const d=await r.json();if(d.summary)setTaskAnalysis(d.summary);else if(d.error)setTaskAnalysis("エラー: "+d.error)}catch(e){setTaskAnalysis("エラー: "+e.message)}finally{setTaskAnalLd(false)}};
const mergeSelectedMinutes=async()=>{
if(!supabase||selMinutes.length<2)return;
setMergeLd(true);sSt("議事録をまとめ中...");setProg(10);
try{
const selected=minHist.filter(m=>selMinutes.includes(m.id)).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
const combined=selected.map(m=>`【${new Date(m.created_at).toLocaleDateString("ja-JP")} ${m.title||"無題"}】\n${m.output_text||""}`).join("\n\n---\n\n");
const titles=selected.map(m=>m.title||"無題").join("、");
const dates=selected.map(m=>new Date(m.created_at).toLocaleDateString("ja-JP"));
const dateRange=dates[0]+"〜"+dates[dates.length-1];
setProg(40);
const r=await fetch("/api/summarize",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
text:combined,
mode:"gemini",
prompt:"以下の複数回分の議事録を1つの統合議事録にまとめてください。\n・各回の重要決定事項を漏れなく含める\n・重複する議題は統合する\n・時系列で整理する\n・アクションアイテムは担当者付きでまとめる\n・未解決事項は明記する\n皮膚科・美容皮膚科クリニックの経営・運営の観点で重要事項を優先してください。"
})
});
const d=await r.json();
setProg(80);
if(d.error){sSt("まとめエラー: "+d.error);return}
if(d.summary){
const sourceIds=selected.map(m=>m.id);
const mergedTitle="【まとめ】"+dateRange+" "+titles;
await supabase.from("minutes").insert({
title:mergedTitle,
input_text:JSON.stringify({merged_from:sourceIds,source_titles:selected.map(m=>({id:m.id,title:m.title||"無題",date:new Date(m.created_at).toLocaleDateString("ja-JP")}))}),
output_text:d.summary
});
if(d.model)setGeminiModel(d.model);
await loadMinHist();
setSelMinutes([]);
sSt("✓ 議事録をまとめました");
}
}catch(e){
sSt("まとめエラー: "+e.message);
}finally{setMergeLd(false);setProg(0)}
};
// 議事録の書き起こしを途中保存（手動・自動共通）
const saveMinDraft=async(isAuto=false)=>{
if(!supabase||!minIR.current?.trim())return;
try{
setMinAutoSaving(true);
const currentDraftId=minDraftIdRef.current;
const title=minTitle||new Date().toLocaleDateString("ja-JP")+" "+new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+"の議事録（録音中）";
if(currentDraftId){
console.log(`[saveMinDraft] updating existing draft: ${currentDraftId} (auto=${isAuto})`);
await supabase.from("minutes").update({
input_text:minIR.current||"",
title,
updated_at:new Date().toISOString()
}).eq("id",currentDraftId);
}else{
console.log(`[saveMinDraft] creating new draft (auto=${isAuto})`);
const{data}=await supabase.from("minutes").insert({
title,
input_text:minIR.current||"",
output_text:"（録音中・未要約）"
}).select().single();
if(data){
updateMinDraftId(data.id);
console.log(`[saveMinDraft] ⚠️ NEW record inserted: ${data.id}, title="${title}"`);
}
}
lastSavedMinInpRef.current=minIR.current||"";
if(!isAuto)sSt("💾 書き起こしを保存しました");
await loadMinHist();
}catch(e){
console.error("saveMinDraft error:",e);
if(!isAuto)sSt("保存エラー: "+e.message);
}finally{
setMinAutoSaving(false);
}
};
const minSum=async()=>{minStop();if(!minIR.current?.trim()){return}setMinLd(true);setProg(10);/* 高速化: 要約直前の自動補正(直列)は廃止。補正は手動✨ボタンで実行 */
const p=minPrompt.trim()||"以下の会議・ミーティングの書き起こしから議事録を作成してください。";
const prompt=`${p}\n\n【書き起こし内容】\n${minIR.current}\n\n以下の構成で簡潔にまとめてください：\n1. 日時・参加者（わかる場合）\n2. 議題・アジェンダ\n3. 決定事項\n4. 各議題の要点\n5. アクションアイテム（担当者・期限）\n6. 次回予定`;
setProg(50);
try{const r=await fetch("/api/minutes-summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:minIR.current||"",prompt:minPrompt.trim()||"以下の会議・ミーティングの書き起こしから議事録を作成してください。",title:minTitle||"",model:minutesModel})});if(!r.ok){const errText=await r.text();setMinOut("エラー: HTTP "+r.status+" - "+(errText||"").substring(0,200));setMinChunkSummaries([]);setMinFinalIntegrationFailed(false);setMinFinalIntegrationError("");return}const d=await r.json();if(d.error){setMinOut("エラー: "+d.error);setMinTruncated(false);setMinChunkSummaries([]);setMinFinalIntegrationFailed(false);setMinFinalIntegrationError("")}else{setMinOut(d.summary);setMinTruncated(!!d.truncated);setMinChunkSummaries(Array.isArray(d.chunkSummaries)?d.chunkSummaries:[]);setMinFinalIntegrationFailed(!!d.finalIntegrationFailed);setMinFinalIntegrationError(d.finalIntegrationError||"");const chunkMsg=d.chunks&&d.chunks>1?`（${d.chunks}分割処理${d.midIntegrated?"・中間統合あり":""}）`:"";sSt((d.finalIntegrationFailed?"⚠️ 最終統合失敗（部分結果表示）":"議事録作成完了 ✓")+chunkMsg+(d.finalIntegrationFailed?"":" → 次へで新規打合せ"));setGeminiModel(d.model||"");setMinutesGenModel(d.model||minutesModel);if(supabase&&d.summary){try{let minData=null;
const minAudioPath=minAudioPathsRef.current.length>0?minAudioPathsRef.current.join(","):null;
if(minDraftId){
const updateData={title:minTitle||new Date().toLocaleDateString("ja-JP")+" "+new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+"の議事録",input_text:minIR.current||"",output_text:d.summary};
if(minAudioPath)updateData.audio_path=minAudioPath;
const{data:updated}=await supabase.from("minutes").update(updateData).eq("id",minDraftId).select().single();
minData=updated;
updateMinDraftId(null);
}else{
const{data:inserted}=await supabase.from("minutes").insert({
title:minTitle||new Date().toLocaleDateString("ja-JP")+" "+new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+"の議事録",
input_text:minIR.current||"",
output_text:d.summary,
audio_path:minAudioPath
}).select().single();
minData=inserted;
}
lastSavedMinInpRef.current=minIR.current||"";
lastSavedMinOutRef.current=d.summary;
if(minData){const taskPrompt=`以下の皮膚科・美容皮膚科クリニックの議事録からタスクとTODOを抽出してください。

【判断基準】
- 患者対応・医療安全に関するタスク（重要度:高・urgency:3〜4・importance:4）
- スタッフ教育・採用・労務管理（重要度:中〜高・urgency:2・importance:3〜4）
- 売上・集患・マーケティング施策（重要度:中〜高・urgency:2〜3・importance:3）
- 設備・機器の導入・メンテナンス（重要度:中・urgency:2・importance:2〜3）
- 院内オペレーション改善（重要度:中・urgency:2・importance:2〜3）
- 法令遵守・届出・保険請求（重要度:高・urgency:3〜4・importance:4）
- 患者満足度向上・クレーム対応（重要度:高・urgency:3〜4・importance:4）
- 美容メニュー開発・価格設定（重要度:中・urgency:2・importance:2〜3）

必ず以下のJSON配列のみを返してください。説明文やマークダウンは不要です。
[{"title":"タスク名","assignee":"","due_date":null,"urgency":2,"importance":2,"category":"operations","role_level":"staff"}]

categoryは: operations(運営), medical(医療), hr(人事), finance(経理)
role_levelは: director(院長が対応), manager(マネジャーが対応), leader(リーダーが対応), staff(スタッフが対応)
urgency: 1=低 2=やや低 3=やや高 4=高
importance: 1=低 2=やや低 3=やや高 4=高

議事録（先頭3000字）:
`;try{console.log("[page] waiting 3s before auto task extraction to avoid rate limit");await new Promise(r=>setTimeout(r,3000));const tr2=await fetch("/api/extract-tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:d.summary})});if(tr2.status===429){console.warn("[page] auto extract-tasks rate-limited, skipping (user can retry via manual button)");sSt("⏳ 要約後のタスク自動抽出がレート制限に達しました。少し待ってから「📋 タスク生成」ボタンで手動実行してください。")}else{const td=await tr2.json();console.log("extract-tasks result:",td.tasks?.length,"tasks",td.error||"");if(td.tasks&&Array.isArray(td.tasks)&&td.tasks.length>0){for(const t of td.tasks){await supabase.from("tasks").insert({title:t.title||"未定",assignee:t.assignee||"",due_date:t.due_date||null,urgency:Math.min(4,Math.max(1,parseInt(t.urgency)||2)),importance:Math.min(4,Math.max(1,parseInt(t.importance)||2)),category:["operations","medical","hr","finance"].includes(t.category)?t.category:"operations",role_level:["director","manager","leader","staff"].includes(t.role_level)?t.role_level:"staff",minute_id:minData.id,done:false})}let chunkMsg="";if(td.chunked)chunkMsg="（"+td.chunkCount+"チャンク分割）";sSt("✓ タスク"+td.tasks.length+"件を自動抽出しました"+chunkMsg)}else{console.warn("extract-tasks: no tasks or empty",td)}}}catch(e2){console.error("extract-tasks fetch error:",e2)}}}catch(e){console.error("minutes insert error:",e)}}}}catch(e){setMinOut("エラー: "+e.message)}finally{setMinLd(false);setProg(0);loadMinHist()}};
// 議事録画面の状態をリセット（保存はしない・ドラフトがあれば破棄）
const performMinReset=()=>{
  try{if(minSessionIdRef.current){deleteTranscriptSession(minSessionIdRef.current);minSessionIdRef.current=null}}catch{}
  if(minAutoSaveRef.current){clearInterval(minAutoSaveRef.current);minAutoSaveRef.current=null;}
  if(minDraftIdRef.current&&supabase){
    supabase.from("minutes").delete().eq("id",minDraftIdRef.current).then(()=>{}).catch(()=>{});
  }
  updateMinDraftId(null);
  minAllAudioChunks.current=[];
  minAudioPathsRef.current=[];
  minStop();
  setMinOut("");
  setMinutesGenModel("");
  setMinTruncated(false);
  setMinChunkSummaries([]);
  setMinFinalIntegrationFailed(false);
  setMinFinalIntegrationError("");
  if(minIR)minIR.current="";
  setMinInp("");
  setMinEl(0);
  setMinTitle("");
  lastSavedMinInpRef.current="";
  lastSavedMinOutRef.current="";
};
// 未保存の有無を判定
const hasUnsavedMin=()=>{
  const cur=minIR.current||"";
  const inpUnsaved=cur.trim().length>0&&cur!==(lastSavedMinInpRef.current||"");
  const outUnsaved=(minOut||"").trim().length>0&&!minOut.startsWith("エラー")&&minOut!==(lastSavedMinOutRef.current||"");
  return{inpUnsaved,outUnsaved,any:inpUnsaved||outUnsaved};
};
const minNext=()=>{
  const u=hasUnsavedMin();
  if(u.any){setUnsavedMinModal(true);return;}
  performMinReset();
  sSt("次の打合せへ ✓");
};
// 「保存して次へ」: 書き起こし＋要約をまとめて保存してリセット
const minNextSaveAndProceed=async()=>{
  if(minSavingNext)return;
  setMinSavingNext(true);
  try{
    const u=hasUnsavedMin();
    if(u.outUnsaved){
      await saveMinOutputOnly();
    }else if(u.inpUnsaved){
      await saveMinInputOnly();
    }
    setUnsavedMinModal(false);
    performMinReset();
    sSt("✅ 保存して次へ進みました");
  }catch(e){
    sSt("保存エラー: "+e.message);
  }finally{
    setMinSavingNext(false);
  }
};
// 「保存せず次へ」: 保存せずリセット
const minNextDiscardAndProceed=()=>{
  setUnsavedMinModal(false);
  performMinReset();
  sSt("次の打合せへ ✓（保存せず）");
};
// 一時停止中の「保存して次へ」: 既存 minStopAndSaveOnly（録音停止＋書き起こし保存）→ performMinReset（リセット＋自動保存セッション削除）の組み合わせ
const minPauseSaveAndNext=async()=>{
  if(minSavingNext)return;
  setMinSavingNext(true);
  try{
    await minStopAndSaveOnly();
    // saveMinInputOnly は成功時のみ lastSavedMinInpRef を更新する。失敗時はリセットせず書き起こしを残す（データ消失防止）
    if((minIR.current||"").trim()&&lastSavedMinInpRef.current!==minIR.current){
      return;
    }
    performMinReset();
    sSt("✅ 保存しました。次の録音を開始できます");
  }catch(e){
    sSt("保存エラー: "+e.message);
  }finally{
    setMinSavingNext(false);
  }
};
// 一時停止中の「保存せずに次へ」: confirm の上で破棄してリセット（誤録音・不要録音の破棄用）
const minPauseDiscardAndNext=()=>{
  if(!window.confirm("書き起こしを保存せずに破棄します。よろしいですか？"))return;
  performMinReset();
  sSt("🗑 破棄しました。次の録音を開始できます");
};
useEffect(()=>{minSR.current=minRS},[minRS]);
// セミナー保存済み状態の解除: 書き起こし・要約・Genspark・気づきが変わったら未保存に（復元時は除外）
useEffect(()=>{if(smnRestoringRef.current){smnRestoringRef.current=false;return}setSmnSaved(false)},[smnTranscript,smnSummary,smnGensparkText,smnInsights]);
const suggestSnippets=async()=>{if(!supabase)return;setSuggestLd(true);setSuggestedSnippets([]);try{const{data}=await supabase.from("records").select("output_text").order("created_at",{ascending:false}).limit(500);if(!data||data.length<3){setSuggestedSnippets([{title:"履歴不足",text:"要約履歴が少なすぎます。もう少し使ってから再度お試しください。"}]);return}
let summaries=data.map(r=>r.output_text).filter(Boolean).slice(0,50).join("\n---\n");
try{const{data:pd}=await supabase.from("past_records").select("content").order("created_at",{ascending:false}).limit(30);if(pd&&pd.length>0)summaries+="\n\n【過去のカルテ記録】\n"+pd.map(r=>r.content).join("\n---\n")}catch{}
const prompt=`以下は皮膚科クリニックの過去の診療要約記録です。この記録を分析して、よく繰り返し使われているフレーズ、定型文、指示内容を抽出し、追記テンプレートとして提案してください。

【過去の要約記録】
${summaries}

以下のJSON形式で10個程度提案してください。既存のテンプレートと被らない、実際の記録から抽出したものを優先してください。
カテゴリは：フォロー、記録、処置、患者指導、処方、その他 から選んでください。

[{"title":"短いボタン名","text":"追記テキスト内容","cat":"カテゴリ"}]

JSON配列のみを出力してください。説明文は不要です。`;
const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:prompt,mode:"gemini",prompt:"JSON配列のみを出力してください。"})});const d=await r.json();
if(d.error){setSuggestedSnippets([{title:"エラー",text:d.error,cat:""}]);return}
try{const cleaned=d.summary.replace(/```json|```/g,"").trim();const arr=JSON.parse(cleaned);setSuggestedSnippets(arr)}catch{setSuggestedSnippets([{title:"解析エラー",text:d.summary,cat:""}])}
}catch(e){setSuggestedSnippets([{title:"エラー",text:e.message,cat:""}])}finally{setSuggestLd(false)}};

const analyzeCounseling=async()=>{let tx=csTx.trim()||iR.current;if(!tx){setCsOut("分析するテキストがありません。録音→書き起こし後、または直接テキストを入力してください。");return}setCsLd(true);setProg(10);setCsOut("");setCsScores({});setCsSaveMsg("");setCsUsage(null);setCsResults([]);/* 高速化: 要約直前の自動補正(直列)は廃止。補正は手動✨ボタンで実行 */
let pastRef="";if(supabase){try{
const{data:csData}=await supabase.from("counseling_records").select("transcription,summary,patient_name").order("created_at",{ascending:false}).limit(20);
if(csData&&csData.length>0){pastRef="\n\n【当院の過去のカウンセリング記録（"+csData.length+"件）】\n"+csData.map((r,i)=>`--- カウンセリング${i+1}${r.patient_name?" ("+r.patient_name+")":""}---\n書き起こし: ${r.transcription}\n${r.summary?"要約: "+r.summary:""}`).join("\n")}
const{data:pd}=await supabase.from("past_records").select("content").order("created_at",{ascending:false}).limit(10);
if(pd&&pd.length>0)pastRef+="\n\n【当院の過去カルテ（参考）】\n"+pd.map(r=>r.content).join("\n---\n")
}catch{}}
const modes={full:`以下の皮膚科クリニックのカウンセリング書き起こしを多角的に分析してください。${pastRef}

【書き起こし】
${tx}

以下の7項目すべてについて詳細に分析・提案してください：

■ 1. コミュニケーション分析
- 傾聴度（患者の発言をどれだけ拾えているか）
- 共感表現の有無と適切さ
- 質問の質（オープン/クローズド質問のバランス）
- 話す割合（医師 vs 患者）の評価

■ 2. 患者ニーズの把握度
- 患者が明示的に述べたニーズ
- 潜在的ニーズ（言葉の裏にある本当の悩み）
- 見逃しているかもしれないニーズ
- 心理的ニーズ（不安、期待、自己イメージ等）

■ 3. 提案の適切性
- 患者のニーズに合った提案ができているか
- 提案のタイミングは適切か
- 代替案の提示はあるか
- 押し売り感がないか

■ 4. 心理学的分析（マーケティング観点）
- 患者の購買心理段階（認知→興味→欲求→行動）
- 信頼構築のレベル
- 不安要素の解消度
- 意思決定を後押しする要素の有無

■ 5. トークスクリプト改善案
- 具体的な改善フレーズを5つ以上提案
- NGワードとその改善例
- クロージングトークの提案

■ 6. 年間治療計画の提案
- 今回の相談内容をもとに12ヶ月の治療・施術スケジュールを提案
- 各月の施術内容・目的・期待効果
- 季節要因の考慮（紫外線、乾燥等）
- 予算感の段階的提案

■ 7. 総合スコアと改善優先度
- 傾聴力: /10
- ニーズ把握: /10
- 提案力: /10
- クロージング: /10
- 総合: /10
- 最優先で改善すべき点TOP3`,

listening:`以下の書き起こしから傾聴・共感スキルを分析してください。${pastRef}\n\n${tx}\n\n分析項目：\n1. 患者の発言に対するリアクション\n2. 共感表現の具体例と改善案\n3. 見逃している患者の感情・ニーズ\n4. より良い傾聴のための具体的フレーズ提案10個`,

needs:`以下の書き起こしから患者ニーズを分析してください。${pastRef}\n\n${tx}\n\n分析項目：\n1. 明示的ニーズ一覧\n2. 潜在的ニーズ（推測）\n3. ニーズに合った提案ができているか評価\n4. 追加で提案すべき施術・治療\n5. 年間計画への展開案`,

marketing:`以下の書き起こしをマーケティング心理学の観点から分析してください。${pastRef}\n\n${tx}\n\n分析項目：\n1. AIDMA分析（患者の心理段階）\n2. 信頼構築度の評価\n3. 不安解消の適切さ\n4. アップセル・クロスセルの機会\n5. リピート率向上のための提案\n6. 具体的なトークスクリプト改善案`,

plan:`以下の書き起こし内容から患者の年間治療計画を作成してください。${pastRef}\n\n${tx}\n\n出力：\n1. 患者プロファイル（推定される肌悩み・目標）\n2. 12ヶ月スケジュール（月ごとの施術・治療内容）\n3. 各施術の目的・期待効果\n4. ホームケア指導\n5. 概算費用感（施術ごとの目安）\n6. 継続のモチベーション維持策`};

const scoreAppendix=`\n\n---\n【最重要・必ず守る】最後に、以下の形式で評価スコアを出力すること。本文は各モデルの個性に任せて構わないが、この評価スコアセクションは厳格に従い、出力の【最後】に必ず配置すること。本文がどれだけ長くても、必ずこのセクションを書ききること。\n\n■ 評価スコア（必ず以下の8項目すべて、1〜10の整数で評価）\n\n傾聴力: <整数1-10>/10\n共感力: <整数1-10>/10\n質問の質: <整数1-10>/10\nニーズ把握: <整数1-10>/10\n説明力: <整数1-10>/10\n信頼関係構築: <整数1-10>/10\n提案力: <整数1-10>/10\nクロージング: <整数1-10>/10\n\n【禁止事項】\n- 項目名の変更（例: 「傾聴度」「クロージング力」など別名を使わない。必ず上記の8項目名）\n- 「中程度」「やや不足」など文字での評価（必ず数値）\n- 空欄・N/A・未評価・「-」・「不明」\n- ()書きでの説明\n- 太字マーク (**) や見出し記号 (###)\n\n【記入例】\n傾聴力: 7/10\n共感力: 8/10\n…\n\n■ 改善ポイント（このカウンセリングで特に改善すべき具体的な点を3〜5個、箇条書きで）\n\n■ 改善案（上記の改善ポイントに対する具体的なアクション・トーク例・代替フレーズを3〜5個、箇条書きで）`;
Object.keys(modes).forEach(k=>{modes[k]=modes[k]+scoreAppendix});

setProg(50);
if(csAbortRef.current){try{csAbortRef.current.abort()}catch{}}
const ctrl=new AbortController();csAbortRef.current=ctrl;
try{const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:modes[csMode],mode:csModel==="claude"?"claude":"gemini",prompt:"詳細に分析してください。",model_preference:csModel,context:"counseling-"+csMode}),signal:ctrl.signal});const d=await r.json();const outText=d.error?"エラー: "+d.error:d.summary;setCsOut(outText);if(d.model){setGeminiModel(d.model);setCsAiModel(d.model)}else{setCsAiModel(csModelLabel(csModel))}if(d.usage)setCsUsage(d.usage);if(!d.error){const parsed=parseCsScores(outText);console.log("[csAnalyze] スコアパース結果:",parsed,"/ usage:",d.usage,"/ 出力末尾500文字:",(outText||"").slice(-500));setCsScores(parsed)}}catch(e){
  if(e.name==="AbortError"){setCsOut("");sSt("⏹ 分析を停止しました")}
  else{console.error("[csAnalyze] error:",e);setCsOut("エラー: "+e.message)}
}finally{setCsLd(false);setProg(0);if(csAbortRef.current===ctrl)csAbortRef.current=null}};

const stopCsAnalyze=()=>{
  if(csAbortRef.current){
    try{
      if(Array.isArray(csAbortRef.current))csAbortRef.current.forEach(c=>{try{c.abort()}catch{}});
      else csAbortRef.current.abort();
    }catch{}
    csAbortRef.current=null;
    sSt("⏹ 分析を停止しました")
  }
  setCsLd(false);setProg(0);
};

const buildCsPrompt=(tx,pastRef,mode)=>{
  const modes={
    full:`以下の皮膚科クリニックのカウンセリング書き起こしを多角的に分析してください。${pastRef}\n\n【書き起こし】\n${tx}\n\n以下の7項目すべてについて詳細に分析・提案してください：\n\n■ 1. コミュニケーション分析\n- 傾聴度（患者の発言をどれだけ拾えているか）\n- 共感表現の有無と適切さ\n- 質問の質（オープン/クローズド質問のバランス）\n- 話す割合（医師 vs 患者）の評価\n\n■ 2. 患者ニーズの把握度\n- 患者が明示的に述べたニーズ\n- 潜在的ニーズ（言葉の裏にある本当の悩み）\n- 見逃しているかもしれないニーズ\n- 心理的ニーズ（不安、期待、自己イメージ等）\n\n■ 3. 提案の適切性\n- 患者のニーズに合った提案ができているか\n- 提案のタイミングは適切か\n- 代替案の提示はあるか\n- 押し売り感がないか\n\n■ 4. 心理学的分析（マーケティング観点）\n- 患者の購買心理段階（認知→興味→欲求→行動）\n- 信頼構築のレベル\n- 不安要素の解消度\n- 意思決定を後押しする要素の有無\n\n■ 5. トークスクリプト改善案\n- 具体的な改善フレーズを5つ以上提案\n- NGワードとその改善例\n- クロージングトークの提案\n\n■ 6. 年間治療計画の提案\n- 今回の相談内容をもとに12ヶ月の治療・施術スケジュールを提案\n- 各月の施術内容・目的・期待効果\n- 季節要因の考慮（紫外線、乾燥等）\n- 予算感の段階的提案\n\n■ 7. 総合スコアと改善優先度\n- 傾聴力: /10\n- ニーズ把握: /10\n- 提案力: /10\n- クロージング: /10\n- 総合: /10\n- 最優先で改善すべき点TOP3`,
    listening:`以下の書き起こしから傾聴・共感スキルを分析してください。${pastRef}\n\n${tx}\n\n分析項目：\n1. 患者の発言に対するリアクション\n2. 共感表現の具体例と改善案\n3. 見逃している患者の感情・ニーズ\n4. より良い傾聴のための具体的フレーズ提案10個`,
    needs:`以下の書き起こしから患者ニーズを分析してください。${pastRef}\n\n${tx}\n\n分析項目：\n1. 明示的ニーズ一覧\n2. 潜在的ニーズ（推測）\n3. ニーズに合った提案ができているか評価\n4. 追加で提案すべき施術・治療\n5. 年間計画への展開案`,
    marketing:`以下の書き起こしをマーケティング心理学の観点から分析してください。${pastRef}\n\n${tx}\n\n分析項目：\n1. AIDMA分析（患者の心理段階）\n2. 信頼構築度の評価\n3. 不安解消の適切さ\n4. アップセル・クロスセルの機会\n5. リピート率向上のための提案\n6. 具体的なトークスクリプト改善案`,
    plan:`以下の書き起こし内容から患者の年間治療計画を作成してください。${pastRef}\n\n${tx}\n\n出力：\n1. 患者プロファイル（推定される肌悩み・目標）\n2. 12ヶ月スケジュール（月ごとの施術・治療内容）\n3. 各施術の目的・期待効果\n4. ホームケア指導\n5. 概算費用感（施術ごとの目安）\n6. 継続のモチベーション維持策`
  };
  const scoreAppendix=`\n\n---\n【最重要・必ず守る】最後に、以下の形式で評価スコアを出力すること。本文は各モデルの個性に任せて構わないが、この評価スコアセクションは厳格に従い、出力の【最後】に必ず配置すること。本文がどれだけ長くても、必ずこのセクションを書ききること。\n\n■ 評価スコア（必ず以下の8項目すべて、1〜10の整数で評価）\n\n傾聴力: <整数1-10>/10\n共感力: <整数1-10>/10\n質問の質: <整数1-10>/10\nニーズ把握: <整数1-10>/10\n説明力: <整数1-10>/10\n信頼関係構築: <整数1-10>/10\n提案力: <整数1-10>/10\nクロージング: <整数1-10>/10\n\n【禁止事項】\n- 項目名の変更（例: 「傾聴度」「クロージング力」など別名を使わない。必ず上記の8項目名）\n- 「中程度」「やや不足」など文字での評価（必ず数値）\n- 空欄・N/A・未評価・「-」・「不明」\n- ()書きでの説明\n- 太字マーク (**) や見出し記号 (###)\n\n【記入例】\n傾聴力: 7/10\n共感力: 8/10\n…\n\n■ 改善ポイント（このカウンセリングで特に改善すべき具体的な点を3〜5個、箇条書きで）\n\n■ 改善案（上記の改善ポイントに対する具体的なアクション・トーク例・代替フレーズを3〜5個、箇条書きで）`;
  return (modes[mode]||modes.full)+scoreAppendix;
};

const runSingleAnalyze=async(model,promptText,controller)=>{
  const res=await fetch("/api/summarize",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({text:promptText,mode:model==="claude"?"claude":"gemini",prompt:"詳細に分析してください。",model_preference:model,context:"counseling-"+csMode}),
    signal:controller.signal
  });
  if(!res.ok)throw new Error("HTTP "+res.status);
  const d=await res.json();
  if(d.error)throw new Error(d.error);
  return{output:d.summary||"",scores:parseCsScores(d.summary||""),usage:d.usage||null,modelLabel:d.model||csModelLabel(model)};
};

const runCsAnalyzeAll=async()=>{
  const tx=csTx.trim()||iR.current;
  if(!tx){setCsOut("分析するテキストがありません。録音→書き起こし後、または直接テキストを入力してください。");return}
  if(csAbortRef.current){try{(Array.isArray(csAbortRef.current)?csAbortRef.current:[csAbortRef.current]).forEach(c=>{try{c.abort()}catch{}})}catch{}}
  setCsCompareTab("all");
  setCsLd(true);setProg(20);setCsOut("");setCsScores({});setCsSaveMsg("");setCsUsage(null);
  let pastRef="";if(supabase){try{
    const{data:csData}=await supabase.from("counseling_records").select("transcription,summary,patient_name").order("created_at",{ascending:false}).limit(20);
    if(csData&&csData.length>0)pastRef="\n\n【当院の過去のカウンセリング記録（"+csData.length+"件）】\n"+csData.map((r,i)=>`--- カウンセリング${i+1}${r.patient_name?" ("+r.patient_name+")":""}---\n書き起こし: ${r.transcription}\n${r.summary?"要約: "+r.summary:""}`).join("\n");
    const{data:pd}=await supabase.from("past_records").select("content").order("created_at",{ascending:false}).limit(10);
    if(pd&&pd.length>0)pastRef+="\n\n【当院の過去カルテ（参考）】\n"+pd.map(r=>r.content).join("\n---\n");
  }catch{}}
  const promptText=buildCsPrompt(tx,pastRef,csMode);
  const controllers=csModels.map(()=>new AbortController());
  csAbortRef.current=controllers;
  const initial=csModels.map(m=>({model:m,status:"running",output:"",scores:null,usage:null,error:null,startedAt:Date.now(),endedAt:null}));
  setCsResults(initial);
  await Promise.allSettled(csModels.map((m,i)=>runSingleAnalyze(m,promptText,controllers[i])
    .then(r=>{setCsResults(prev=>prev.map((x,idx)=>idx===i?{...x,...r,status:"done",endedAt:Date.now()}:x))})
    .catch(e=>{const aborted=e.name==="AbortError";setCsResults(prev=>prev.map((x,idx)=>idx===i?{...x,status:aborted?"aborted":"error",error:e.message,endedAt:Date.now()}:x))})
  ));
  setCsLd(false);setProg(0);csAbortRef.current=null;
};

const saveCsResultsAll=async()=>{
  if(!supabase){setCsSaveMsg("保存先が未設定です");return}
  const done=csResults.filter(r=>r.status==="done"&&r.output);
  if(done.length===0){setCsSaveMsg("保存可能な結果がありません");return}
  setCsSaving(true);setCsSaveMsg("");
  const inputText=csTx.trim()||iR.current||"";
  const baseTitle=(inputText.slice(0,30)||"カウンセリング")+(inputText.length>30?"...":"");
  let ok=0,fail=0;
  for(const r of done){
    try{
      const csRow={
        title:`[${csModelLabel(r.model)}] ${baseTitle}`,
        analysis_type:CS_MODE_LABELS[csMode]||csMode,
        input_text:inputText,
        output_text:r.output,
        ai_model:r.modelLabel||csModelLabel(r.model),
        scores:r.scores&&Object.keys(r.scores).length>0?r.scores:null
      };
      // 引き継ぎ元の患者ID・書き起こし日時を永続化（書き起こし選択時のみ）
      if(csSourcePatientId)csRow.source_patient_id=csSourcePatientId;
      if(csSourceDate)csRow.source_date=csSourceDate;
      const{error}=await supabase.from("counseling_analyses").insert(csRow);
      if(error)fail++;else ok++;
    }catch{fail++}
  }
  setCsSaving(false);
  setCsSaveMsg(`${ok}件保存しました${fail>0?`（${fail}件失敗）`:" ✓"}`);
  setTimeout(()=>setCsSaveMsg(""),3500);
};

// 要約テストラボ ハンドラ
const LAB_FORBIDDEN_RULES="\n\n【絶対禁止】以下は一切出力しないこと：音声認識の精度が〜、断片的な情報から〜、再録音をお願いします、把握が困難、推定します、※で始まる注釈、**で囲まれた注意書き、カルテ要約以外の説明文やコメント";
const runSingleLabSummary=async(model,textBody,systemPrompt,controller)=>{
  const res=await fetch("/api/summarize",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({text:textBody,mode:model==="claude"?"claude":"gemini",prompt:systemPrompt,model_preference:model,context:"summary-lab"}),
    signal:controller.signal
  });
  if(!res.ok)throw new Error("HTTP "+res.status);
  const d=await res.json();
  if(d.error)throw new Error(d.error);
  return{output:d.summary||d.result||"",usage:d.usage||null,modelLabel:d.model||csModelLabel(model)};
};
const runLabAnalyzeAll=async()=>{
  const tx=(labText||"").trim();
  if(!tx){sSt("⚠️ テキストを入力してください");return}
  if(tx.length<50){sSt("⚠️ テキストが短すぎます（50文字以上推奨）");return}
  if(labAbortRef.current){try{labAbortRef.current.forEach(c=>{try{c.abort()}catch{}})}catch{}}
  setLabCompareTab("all");setLabBusy(true);setLabSaveMsg("");
  // 診察テンプレは既存 T 配列のプロンプトを system prompt として使用、text は生の書き起こし
  // それ以外は従来通りクライアント側でプロンプト組立 → text として送信
  let textBody, systemPrompt;
  if(labTemplate==="exam"){
    const examTpl=LAB_EXAM_TEMPLATES.find(x=>x.id===labExamTplId)||LAB_EXAM_TEMPLATES.find(x=>x.id==="lab-exam-std")||LAB_EXAM_TEMPLATES[0];
    textBody=tx;
    systemPrompt=(examTpl?.prompt||"")+LAB_FORBIDDEN_RULES;
  }else{
    textBody=(LAB_TEMPLATES[labTemplate]||LAB_TEMPLATES.free).prompt.replace("{TEXT}",tx);
    systemPrompt="以下のテキストを要約してください。";
  }
  const controllers=labModels.map(()=>new AbortController());
  labAbortRef.current=controllers;
  const initial=labModels.map(m=>({model:m,status:"running",output:"",error:null,usage:null,startedAt:Date.now(),endedAt:null}));
  setLabResults(initial);
  await Promise.allSettled(labModels.map((m,i)=>runSingleLabSummary(m,textBody,systemPrompt,controllers[i])
    .then(r=>{setLabResults(prev=>prev.map((x,idx)=>idx===i?{...x,...r,status:"done",endedAt:Date.now()}:x))})
    .catch(e=>{const aborted=e.name==="AbortError";setLabResults(prev=>prev.map((x,idx)=>idx===i?{...x,status:aborted?"aborted":"error",error:e.message,endedAt:Date.now()}:x))})
  ));
  setLabBusy(false);labAbortRef.current=null;
};
const stopLabAnalyze=()=>{
  if(labAbortRef.current){try{labAbortRef.current.forEach(c=>{try{c.abort()}catch{}})}catch{}labAbortRef.current=null;sSt("⏹ 要約を停止しました")}
  setLabBusy(false);
};
const saveLabResultsAll=async()=>{
  if(!supabase){setLabSaveMsg("保存先が未設定です");return}
  const done=labResults.filter(r=>r.status==="done"&&r.output);
  if(done.length===0){setLabSaveMsg("保存可能な結果がありません");return}
  setLabSaving(true);setLabSaveMsg("");
  const nowStr=new Date().toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  const tplLabel=(LAB_TEMPLATES[labTemplate]||LAB_TEMPLATES.free).label;
  let ok=0,fail=0;
  for(const r of done){
    try{
      const{error}=await supabase.from("counseling_analyses").insert({
        title:`[要約ラボ/${csModelLabel(r.model)}/${tplLabel}] ${nowStr}`,
        analysis_type:"summary_lab",
        input_text:labText,
        output_text:r.output,
        ai_model:r.modelLabel||csModelLabel(r.model),
        scores:{template:labTemplate,exam_tpl_id:labTemplate==="exam"?labExamTplId:null,usage:r.usage||null,duration_ms:(r.endedAt||0)-(r.startedAt||0)}
      });
      if(error)fail++;else ok++;
    }catch{fail++}
  }
  setLabSaving(false);
  setLabSaveMsg(`${ok}件保存しました${fail>0?`（${fail}件失敗）`:" ✓"}`);
  setTimeout(()=>setLabSaveMsg(""),3500);
};
const loadLabHistory=async()=>{
  if(!supabase)return;
  setLabHistLoading(true);
  try{
    const{data}=await supabase.from("counseling_analyses").select("id,title,input_text,output_text,ai_model,scores,created_at").eq("analysis_type","summary_lab").order("created_at",{ascending:false}).limit(100);
    setLabHistList(data||[]);
  }catch(e){console.error("[loadLabHistory]",e);setLabHistList([])}
  finally{setLabHistLoading(false)}
};
const restoreLab=(item)=>{
  setLabText(item.input_text||"");
  setLabResults([{model:item.ai_model||"gemini-3-5-flash",status:"done",output:item.output_text||"",usage:item.scores?.usage||null,startedAt:0,endedAt:item.scores?.duration_ms||0,isRestored:true}]);
  if(item.scores?.template&&LAB_TEMPLATES[item.scores.template])setLabTemplate(item.scores.template);
  if(item.scores?.exam_tpl_id&&LAB_EXAM_TEMPLATES.find(x=>x.id===item.scores.exam_tpl_id))setLabExamTplId(item.scores.exam_tpl_id);
  setLabCompareTab("all");
  setLabHistOpen(false);
  sSt(`✓ ${toJSTDate(item.created_at)} の要約を復元しました`);
};
const deleteLabHistOne=async(id)=>{
  if(!supabase)return;
  if(!window.confirm("この履歴を削除しますか？"))return;
  try{
    await supabase.from("counseling_analyses").delete().eq("id",id);
    setLabHistList(prev=>prev.filter(x=>x.id!==id));
  }catch(e){console.error("[deleteLabHistOne]",e)}
};
const deleteLabHistSelected=async()=>{
  if(!supabase||labSelectedIds.length===0)return;
  if(!window.confirm(`選択した${labSelectedIds.length}件を削除しますか？`))return;
  try{
    await supabase.from("counseling_analyses").delete().in("id",labSelectedIds);
    setLabHistList(prev=>prev.filter(x=>!labSelectedIds.includes(x.id)));
    setLabSelectedIds([]);setLabSelectMode(false);
  }catch(e){console.error("[deleteLabHistSelected]",e)}
};
const CS_MODE_LABELS={full:"総合分析",listening:"傾聴・共感",needs:"ニーズ把握",marketing:"マーケティング",plan:"年間計画"};
const saveCounselingAnalysis=async()=>{
  if(!supabase){setCsSaveMsg("保存先が未設定です");return}
  if(!csOut||csLd){setCsSaveMsg("分析結果がありません");return}
  setCsSaving(true);setCsSaveMsg("");
  try{
    const inputText=csTx.trim()||iR.current||"";
    const title=(inputText.slice(0,30)||"カウンセリング")+(inputText.length>30?"...":"");
    const csRow={
      title,
      analysis_type:CS_MODE_LABELS[csMode]||csMode,
      input_text:inputText,
      output_text:csOut,
      ai_model:csAiModel||csModelLabel(csModel),
      scores:csScores&&Object.keys(csScores).length>0?csScores:null
    };
    // 引き継ぎ元の患者ID・書き起こし日時を永続化（書き起こし選択時のみ）
    if(csSourcePatientId)csRow.source_patient_id=csSourcePatientId;
    if(csSourceDate)csRow.source_date=csSourceDate;
    const{error}=await supabase.from("counseling_analyses").insert(csRow);
    if(error){setCsSaveMsg("保存失敗: "+error.message)}
    else{setCsSaveMsg("保存しました ✓");setTimeout(()=>setCsSaveMsg(""),3000)}
  }catch(e){setCsSaveMsg("保存失敗: "+e.message)}
  finally{setCsSaving(false)}
};

const loadCsHistory=async()=>{
  if(!supabase)return;
  setCsHistoryLd(true);
  try{
    const{data,error}=await supabase.from("counseling_analyses").select("*").order("created_at",{ascending:false}).limit(100);
    if(!error)setCsHistory(data||[])
  }catch{}
  finally{setCsHistoryLd(false)}
};

const restoreCsAnalysis=(rec)=>{
  if(!rec)return;
  setCsTx(rec.input_text||"");
  setCsOut(rec.output_text||"");
  setCsScores(rec.scores||{});
  setCsAiModel(rec.ai_model||"");
  // 引き継ぎ元の患者ID・日時も復元（旧データ＝カラム無しでも空文字で安全）
  setCsSourcePatientId(rec.source_patient_id||"");
  setCsSourceDate(rec.source_date||"");
  const modeKey=Object.keys(CS_MODE_LABELS).find(k=>CS_MODE_LABELS[k]===rec.analysis_type);
  if(modeKey)setCsMode(modeKey);
  setCsShowHistory(false);
  setCsSaveMsg("履歴を復元しました");
  setTimeout(()=>setCsSaveMsg(""),2500);
};

const deleteCsAnalysis=async(id)=>{
  if(!supabase)return;
  if(!confirm("この履歴を削除しますか？"))return;
  try{
    const{error}=await supabase.from("counseling_analyses").delete().eq("id",id);
    if(error){alert("削除失敗: "+error.message);return}
    setCsHistory(prev=>prev.filter(r=>r.id!==id))
  }catch(e){alert("削除失敗: "+e.message)}
};

const formatCsPickDate=(dateStr)=>{
  if(!dateStr)return"";
  const d=new Date(dateStr);
  const wday=["日","月","火","水","木","金","土"][d.getDay()];
  const hh=String(d.getHours()).padStart(2,"0");
  const mm=String(d.getMinutes()).padStart(2,"0");
  return `${toJSTDate(dateStr)}（${wday}）${hh}:${mm}`;
};

const getCsDisplayTitle=(item)=>{
  if(!item)return"無題";
  if(item.patient_name)return item.patient_name+" 様"+(item.patient_id?" (ID:"+item.patient_id+")":"");
  if(item.patient_id)return"患者ID: "+item.patient_id;
  const txt=item.input_text||item.output_text||"";
  const m=txt.match(/■\s*施術名[：:\s]+([^\n■]+)/);
  if(m)return m[1].trim().substring(0,40);
  const firstLine=(txt||"").split("\n").map(s=>s.trim()).filter(Boolean)[0]||"";
  if(firstLine)return firstLine.substring(0,40);
  return"無題";
};

const openCsPickModal=async()=>{
  setCsPickOpen(true);setCsPickLoading(true);setCsPickSearch("");
  if(!supabase){setCsPickLoading(false);setCsPickList([]);sSt("⚠️ 接続先未設定です");return}
  try{
    // 履歴モーダル(L1757)と同じく records.room === "r7" のみで判定。input_text フィルタは行わない。
    // records テーブルに title カラムは存在しないため select には含めない（saveRecord L1064 insert参照）
    const{data,error}=await supabase.from("records").select("id,input_text,output_text,created_at,room,patient_name,patient_id").eq("room","r7").order("created_at",{ascending:false}).limit(50);
    if(error)throw error;
    let list=data||[];
    console.log("[csPick] records 取得:",list.length,"件 / カラム:",list[0]?Object.keys(list[0]):"empty");
    // counseling_records (rid==='r7'時に saveRecord が追加保存する別テーブル) からも UNION 補完
    try{
      const{data:csData}=await supabase.from("counseling_records").select("id,patient_name,patient_id,transcription,summary,created_at,room").eq("room","r7").order("created_at",{ascending:false}).limit(50);
      if(csData&&csData.length>0){
        console.log("[csPick] counseling_records 取得:",csData.length,"件");
        const existingTimes=new Set(list.map(r=>r.created_at));
        const merged=csData.filter(c=>!existingTimes.has(c.created_at)).map(c=>({
          id:"cs-"+c.id,input_text:c.transcription||"",output_text:c.summary||"",
          created_at:c.created_at,room:"r7",patient_name:c.patient_name,patient_id:c.patient_id,_source:"counseling_records"
        }));
        if(merged.length>0){list=[...list,...merged].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,50)}
      }
    }catch(ce){console.warn("[csPick] counseling_records fetch skip:",ce?.message)}
    setCsPickList(list)
  }catch(e){console.error("[csPick] fetch error",e);sSt("⚠️ 履歴の取得に失敗しました: "+e.message);setCsPickList([])}
  finally{setCsPickLoading(false)}
};

const selectCsRecord=(item)=>{
  const txt=item?.input_text||item?.output_text||"";
  if(!txt.trim()){sSt("⚠️ この記録には書き起こし・要約のいずれもありません");return}
  setCsTx(txt);
  // 患者ID・元書き起こし日時も引き継ぐ（分析後・保存後も「どの書き起こしか」を辿れるように）
  setCsSourcePatientId(item?.patient_id||"");
  setCsSourceDate(item?.created_at||"");
  setCsPickOpen(false);
  const tag=item.input_text?"":"（要約から読込）";
  sSt(`✓ 書き起こしを読み込みました${tag}（${formatCsPickDate(item.created_at)}）`);
};

// 引き継ぎ元の患者ID・書き起こし日時ラベル（書き起こし選択時のみ表示・分析テキスト欄/分析結果で共用）
const renderSourceInfo=()=>{
  if(!csSourcePatientId&&!csSourceDate)return null;
  return(<div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",fontSize:13,color:"#555",background:"#f0f7ff",border:"1px solid #cce0ff",borderRadius:8,padding:"8px 12px",marginBottom:8}}>
    {csSourcePatientId&&<span>📋 患者ID: <strong>{csSourcePatientId}</strong></span>}
    {csSourceDate&&<span>📅 {(()=>{try{return new Date(csSourceDate).toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}catch{return csSourceDate}})()}</span>}
  </div>);
};
const loadPastCount=async()=>{if(!supabase)return;try{const{count}=await supabase.from("past_records").select("*",{count:"exact",head:true});setPastCount(count||0)}catch{}};
const savePastRecords=async()=>{if(!supabase||!pastInput.trim())return;setPastLd(true);setPastMsg("");try{
const chunks=pastInput.split(/\n{2,}|\r\n{2,}/).map(c=>c.trim()).filter(c=>c.length>10);
if(chunks.length===0){setPastMsg("有効なカルテ内容がありません");return}
const rows=chunks.map(c=>({content:c,source:pastSource.trim()||"手動入力",disease:pastDisease.trim()||"",tags:""}));
const batchSize=50;let total=0;
for(let i=0;i<rows.length;i+=batchSize){const batch=rows.slice(i,i+batchSize);const{error}=await supabase.from("past_records").insert(batch);if(error){setPastMsg("保存エラー: "+error.message);return}total+=batch.length}
setPastMsg(`✓ ${total}件のカルテを保存しました`);setPastInput("");setPastDisease("");loadPastCount();
}catch(e){setPastMsg("エラー: "+e.message)}finally{setPastLd(false)}};
const importPastFile=async(file)=>{if(!file)return;setPastLd(true);setPastMsg("ファイル読み込み中...");try{const text=await file.text();setPastInput(text);setPastMsg(`ファイル読み込み完了（${Math.round(text.length/1024)}KB）- 内容を確認して「保存」を押してください`)}catch(e){setPastMsg("ファイル読み込みエラー: "+e.message)}finally{setPastLd(false)}};
useEffect(()=>{loadPastCount()},[]);

const detectTemplate=(text)=>{
if(!text||text.length<30)return null;
const t=text.toLowerCase();
const cosmeticKw=["ボトックス","ヒアルロン","レーザー","美容","施術","パラメータ","フォトフェイシャル","ピーリング","ダーマペン","ポテンツァ","メソナ","ノーリス","agnes","プラズマ","脱毛","シミ取り","肝斑","トーニング","ニキビ治療","ケミカル","リフト","たるみ","しわ","くすみ","美白","保湿注射","水光注射"];
if(cosmeticKw.some(k=>t.includes(k)))return"cosmetic";
const procedureKw=["切除","縫合","麻酔","局所麻酔","生検","切開","排膿","液体窒素","冷凍凝固","焼灼","電気焼灼","くり抜き","トレパン","抜糸","デブリ","ドレッシング","処置","手術","オペ"];
if(procedureKw.some(k=>t.includes(k)))return"procedure";
const diseaseOnlyKw=["病名","診断","疾患"];
if(diseaseOnlyKw.some(k=>t.includes(k))&&text.length<100)return"disease";
if(text.length>500&&(t.includes("---")||/s[）)]\s/.test(t)))return"soap";
return null;
};
const loadHist=async()=>{if(!supabase)return;try{const{data}=await supabase.from("records").select("*").order("created_at",{ascending:false}).limit(500);if(data)sHist(data)}catch(e){console.error("Load error:",e)}};
const loadTodayStats=async()=>{
if(!supabase)return;
const now=new Date();
const jstStart=new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0,0);
const jstEnd=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59);
const utcStart=new Date(jstStart.getTime()-9*60*60*1000).toISOString();
const utcEnd=new Date(jstEnd.getTime()-9*60*60*1000).toISOString();
try{
const{data}=await supabase.from("records").select("output_text,created_at,room").gte("created_at",utcStart).lte("created_at",utcEnd).order("created_at",{ascending:false});
if(!data)return;
const diseases={};
data.forEach(r=>{const matches=(r.output_text||"").match(/^#\s+([^\n（(]+)/gm);if(matches)matches.forEach(m=>{const d=m.replace(/^#\s+/,"").trim().substring(0,10);diseases[d]=(diseases[d]||0)+1})});
const topDiseases=Object.entries(diseases).sort((a,b)=>b[1]-a[1]).slice(0,5);
const rooms={};data.forEach(r=>{rooms[r.room||"不明"]=(rooms[r.room||"不明"]||0)+1});
setTodayStats({count:data.length,diseases:topDiseases,rooms,lastTime:data[0]?.created_at});
}catch(e){console.error("stats error:",e)}
};
const checkVisitType=async(pid)=>{
if(!pid||!supabase){setVisitType("");setPrevRecord(null);return}
try{
const{data}=await supabase.from("records").select("*").eq("patient_id",pid).order("created_at",{ascending:false}).limit(2);
if(!data||data.length===0){setVisitType("first");setPrevRecord(null)}
else if(data.length===1){
const today=new Date().toLocaleDateString("ja-JP");
const recDate=toJSTDate(data[0].created_at);
if(today===recDate){setVisitType("first");setPrevRecord(null)}
else{setVisitType("revisit");setPrevRecord(data[0])}
}else{setVisitType("revisit");setPrevRecord(data[1])}
}catch{setVisitType("");setPrevRecord(null)}
};
const generateQuestionnaire=async()=>{
if(!qDisease.trim())return;
setQLd(true);setQResult("");
try{
const r=await fetch("/api/generate-questionnaire",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({disease:qDisease,isFirstVisit:qFirstVisit})});
const d=await r.json();
if(d.error){setQResult("エラー: "+d.error);return}
setQResult(d.questionnaire||"");
}catch(e){setQResult("エラー: "+e.message)}
finally{setQLd(false)}
};
const openPatientHistory=async(pid)=>{if(!pid||!supabase)return;try{const{data}=await supabase.from("records").select("*").eq("patient_id",pid).order("created_at",{ascending:false}).limit(100);if(data&&data.length>0)setPatientModal({pid,records:data})}catch(e){console.error("Patient history error:",e)}};
const runMonthlyReport=async()=>{if(!supabase)return;setMonthlyLd(true);setMonthlyModal(true);setMonthlyResult("");const now=new Date();const year=now.getFullYear();const month=now.getMonth();const start=new Date(year,month,1);const end=new Date(year,month+1,0,23,59,59);const utcStart=new Date(start.getTime()-9*60*60*1000).toISOString();const utcEnd=new Date(end.getTime()-9*60*60*1000).toISOString();const monthLabel=`${year}年${month+1}月`;setMonthlyTarget(monthLabel);try{const{data}=await supabase.from("records").select("output_text,created_at").gte("created_at",utcStart).lte("created_at",utcEnd).order("created_at",{ascending:false}).limit(500);if(!data||data.length<3){setMonthlyResult("データが不足しています（最低3件必要）");return}const res=await fetch("/api/monthly-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,month:monthLabel})});const d=await res.json();if(d.error){setMonthlyResult("エラー: "+d.error);return}setMonthlyResult(d.report||"")}catch(e){setMonthlyResult("エラー: "+e.message)}finally{setMonthlyLd(false)}};
const searchHist=async(query)=>{if(!supabase||!query.trim())return;try{const q=query.trim();const dateMatch=q.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{2}))?$/);if(dateMatch){const month=parseInt(dateMatch[1]);const day=parseInt(dateMatch[2]);const hour=dateMatch[3]?parseInt(dateMatch[3]):null;const year=new Date().getFullYear();const jstStart=hour!==null?new Date(year,month-1,day,hour,0,0):new Date(year,month-1,day,0,0,0);const jstEnd=hour!==null?new Date(year,month-1,day,hour,59,59):new Date(year,month-1,day,23,59,59);const utcStart=new Date(jstStart.getTime()-9*60*60*1000).toISOString();const utcEnd=new Date(jstEnd.getTime()-9*60*60*1000).toISOString();const{data}=await supabase.from("records").select("*").gte("created_at",utcStart).lte("created_at",utcEnd).order("created_at",{ascending:false}).limit(500);if(data)sHist(data)}else{const{data}=await supabase.from("records").select("*").or(`output_text.ilike.%${q}%,input_text.ilike.%${q}%,patient_id.ilike.%${q}%`).order("created_at",{ascending:false}).limit(500);if(data)sHist(data)}}catch(e){console.error("Search error:",e)}};
const delRecord=async(id)=>{if(!supabase)return;try{await supabase.from("records").delete().eq("id",id);sHist(h=>h.filter(r=>r.id!==id))}catch(e){console.error("Delete error:",e)}};
const baseFilteredHist=search?hist.filter(r=>{const s=search.toLowerCase();const dateMatch=s.match(/^(\d{1,2})\/(\d{1,2})/);if(dateMatch){const dateStr=r.created_at?new Date(r.created_at).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"})+" "+new Date(r.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"";return dateStr.startsWith(s)||dateStr.includes(s)}const dateStr2=r.created_at?new Date(r.created_at).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"})+" "+new Date(r.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"";return dateStr2.includes(s)||(r.output_text||"").toLowerCase().includes(s)||(r.input_text||"").toLowerCase().includes(s)||(r.patient_id||"").toLowerCase().includes(s)}):hist;
const filteredHist=roomFilter==="all"?baseFilteredHist:baseFilteredHist.filter(r=>r.room===roomFilter);

// 書き起こしノイズフィルター（TV・動画・環境音由来のテキストを除去）
// 無音ハルシネーション対策: 同一系統の短文の「連続」をN回以上で1行に畳む（軽量・エンジン非依存）。
// Avalonは沈黙時に「うん。」「お疲れ様です。」「ちょっと聞こえた。」等を数十〜数百回連続捏造する。
// 無音スキップ(isSilentChunk)をすり抜けた沈黙チャンクでも、この連続重複を畳んで画面汚染を防ぐ。Geminiは呼ばない純粋な文字列処理。
// ⚠️完全一致だけでなく「前方一致・ほぼ同一」の崩れ（…聞こえた。→…聞こえ。→…聞こえ→…聞 等、チャンク末で切れた残骸）も
//   同一系統として一括で畳む。特定フレーズ指定ではなく「短文(SHORT_MAX字以下)がMIN_REPEAT回以上連続」の汎用ルール。
//   正当な繰り返し（実際に2回言った等）を消さないよう連続MIN_REPEAT回以上のみ対象。前方一致はMIN_PREFIX字以上＋
//   短い方が長い方の完全な接頭辞である場合に限定（「今日は寒い」「今日はいい天気」のような分岐は畳まない）。
const collapseRepeats=(text)=>{
  if(!text)return text;
  const SHORT_MAX=16, MIN_REPEAT=3, MIN_PREFIX=3;
  // 末尾の句読点・記号・空白を除いて比較（「…聞こえた。」と「…聞こえた」を同一視）
  const strip=s=>s.trim().replace(/[。、，．,.!?！？…・\s]+$/u,"");
  // 既に畳んだ「○○（×N）」行も基底テキスト＋回数に分解し、チャンクをまたいで数を合算できるようにする。
  const parse=l=>{const t=l.trim();const m=t.match(/^(.+?)（×(\d+)）$/u);return m?{base:m[1],count:(parseInt(m[2],10)||1)}:{base:t,count:1};};
  const sameFamily=(a,b)=>{
    if(a===b)return true;
    if(a.length>SHORT_MAX||b.length>SHORT_MAX)return false;
    const sa=strip(a),sb=strip(b);
    if(!sa||!sb)return false;
    const[shrt,lng]=sa.length<=sb.length?[sa,sb]:[sb,sa];
    // 短い方が丸ごと長い方の接頭辞（＝崩れ・残骸）のときのみ同系統とみなす
    return shrt.length>=MIN_PREFIX&&lng.startsWith(shrt);
  };
  const lines=text.split("\n");
  const out=[];
  let i=0;
  while(i<lines.length){
    const pi=parse(lines[i]);
    if(pi.base.length>SHORT_MAX){out.push(lines[i]);i++;continue;}
    let j=i+1,canonical=pi.base,total=pi.count; // 同系統の最長を代表（崩れる前の完全形）にし、回数は合算
    while(j<lines.length){
      const pj=parse(lines[j]);
      if(pj.base.length>SHORT_MAX||!sameFamily(canonical,pj.base))break;
      if(pj.base.length>canonical.length)canonical=pj.base;
      total+=pj.count;
      j++;
    }
    if(total>=MIN_REPEAT&&canonical.length>0){
      out.push(`${canonical}（×${total}）`);
    }else{
      for(let k=i;k<j;k++)out.push(lines[k]);
    }
    i=j;
  }
  return out.join("\n");
};
// 蓄積（結合済み）テキストにcollapseRepeatsを再適用し、10秒チャンクをまたいで溜まる相槌連続も1つに畳む。
// 純粋な文字列処理で軽量だが、超長尺の毎チャンク全走査を避けるため末尾80行のみ畳む（相槌連続はせいぜい数十行・頭側は確定済み）。
const foldAccum=(text)=>{if(!text)return text;const lines=text.split("\n");if(lines.length<=80)return collapseRepeats(text);const keep=lines.length-80;return lines.slice(0,keep).join("\n")+"\n"+collapseRepeats(lines.slice(keep).join("\n"));};

const filterTranscriptNoise=(text)=>{
  if(!text||!text.trim())return "";

  const lines=text.split("\n");
  const filtered=lines.filter(line=>{
    const t=line.trim();
    if(!t)return false;

    // カスタム登録パターンチェック（完全一致・部分一致）
    for(const np of noisePatterns){
      if(!np)continue;
      try{if(t===np||t.includes(np))return false}catch{}
    }

    // 動画・映像系のみ除去（診察内容は除去しない）
    const videoPatterns=[
      /次の映像でお会いしましょう/,
      /ご視聴ありがとう/,
      /チャンネル登録/,
      /高評価.*チャンネル/,
      /subscribe/i,
      /see you next time/i,
      /次回もよろしく.*チャンネル/,
    ];

    for(const p of videoPatterns){
      if(p.test(t))return false;
    }

    return true;
  });

  return collapseRepeats(filtered.join("\n").trim());
};

// 履歴カードのコンテンツバッジ判定
const detectContentBadges=(inputText,outputText)=>{
  const text=(inputText||"")+(outputText||"");
  const badges=[];
  // 疾患名バッジ（出力テキストの # 見出しから抽出）
  const diseaseMatches=(outputText||"").match(/^#\s+([^\n]+)/gm);
  if(diseaseMatches){
    diseaseMatches.slice(0,3).forEach(m=>{
      const name=m.replace(/^#\s+/,"").trim();
      const display=name.replace(/（[^）]+）/,"").trim().substring(0,8);
      if(display){
        badges.push({key:"disease_"+display,label:"🏥"+display,color:"#065f46",bg:"#d1fae5",prompt:`この診察記録の「${name}」について、疾患の特徴・治療・経過を詳しくまとめてください。`});
      }
    });
  }
  // 美容施術バッジ
  const cosmeticKw=["ボトックス","ヒアルロン","レーザー","ピーリング","ダーマペン","ポテンツァ","脱毛","フォト","トーニング"];
  if(cosmeticKw.some(k=>text.includes(k)))badges.push({key:"cosmetic",label:"✨美容",color:"#9d174d",bg:"#fce7f3",prompt:"この診察記録の美容施術の内容・パラメータ・注意事項を詳しくまとめてください。"});
  const externalKeywords=["1日2回","1日1回","1日3回","朝晩","入浴後","就寝前","塗布","外用","軟膏","クリーム","ゲル","ローション","塗り方","薄く","擦り込","塗って","患部に","フィンガーチップ","FTU","プロアクティブ","リアクティブ","保湿","スキンケア","ステップ","重ね塗り","混合","希釈"];
  if(externalKeywords.some(k=>text.includes(k)))badges.push({key:"external",label:"💊外用",color:"#0369a1",bg:"#e0f2fe",prompt:"この診察記録の外用薬の使い方・塗り方の説明を詳しくまとめてください。"});
  const sideEffectKeywords=["副作用","リスク","注意","刺激感","赤み","かぶれ","アレルギー","過敏","皮膚萎縮","ステロイド副作用","毛包炎","酒さ様","依存","反跳","離脱","肝斑","光過敏","紫外線","日焼け","SPF","日焼け止め"];
  if(sideEffectKeywords.some(k=>text.includes(k)))badges.push({key:"sideeffect",label:"⚠️副作用",color:"#b45309",bg:"#fef9c3",prompt:"この診察記録の副作用・リスク・注意事項の説明を詳しくまとめてください。"});
  const treatmentKeywords=["治療方針","プラン","ステップ","段階","まず","次に","その後","経過","再診","2週間後","1ヶ月後","継続","増量","減量","変更","切り替え","追加","中止","様子をみ","悪化時","改善しない場合","目標","完治","寛解","コントロール","維持療法","積極的治療"];
  if(treatmentKeywords.some(k=>text.includes(k)))badges.push({key:"treatment",label:"📋治療",color:"#6d28d9",bg:"#f5f3ff",prompt:"この診察記録の治療方針・治療計画を詳しくまとめてください。"});
  return badges;
};

const runBadgeAnalysis=async(record,badge)=>{
  setBadgePopup({title:badge.label,content:"",color:badge.color,bg:badge.bg});
  setBadgeLd(true);
  try{
    const text=(record.input_text||"")+(record.output_text||"");
    const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:text.substring(0,3000),mode:"gemini",prompt:badge.prompt})});
    const d=await r.json();
    setBadgePopup({title:badge.label,content:d.summary||"内容を取得できませんでした",color:badge.color,bg:badge.bg});
  }catch(e){
    setBadgePopup({title:badge.label,content:"エラー: "+e.message,color:badge.color,bg:badge.bg});
  }finally{
    setBadgeLd(false);
  }
};

// Dict
const toKatakana=(s)=>s.replace(/[\u3041-\u3096]/g,c=>String.fromCharCode(c.charCodeAt(0)+96));
const highlightSummary=(text)=>{
if(!text)return text;
let h=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
h=h.replace(/^(#\s+)([^\n]+)/gm,(m,p1,p2)=>`${p1}<span style="color:#065f46;font-weight:700;background:#d1fae5;padding:1px 6px;border-radius:4px">${p2}</span>`);
h=h.replace(/([ァ-ヶー]{3,}(?:軟膏|クリーム|ローション|液|ゲル|錠|散|カプセル|シャンプー|スプレー|テープ)?)/g,'<span style="color:#0369a1;background:#dbeafe;padding:1px 4px;border-radius:3px">$1</span>');
h=h.replace(/(⚠️[^\n]+|注意[：:][^\n]+|禁忌[：:][^\n]+)/g,'<span style="color:#b45309;background:#fef9c3;padding:1px 4px;border-radius:3px">$1</span>');
h=h.replace(/^([SOPC]\uff09|^患者情報\uff09)/gm,'<span style="color:#6d28d9;font-weight:700">$&</span>');
h=h.replace(/^(■[^　\n]+)/gm,'<span style="color:#0369a1;font-weight:700">$1</span>');
return h;
};
// セミナー詳細要約の表示用: Markdown記号(#/##/###, **, ---, 箇条書き)を軽量に整形表示する（読み取り専用div向け）。
// ※ highlightSummary は薬剤名ハイライト等が混ざるため流用せず、セミナー専用に分離。lookbehind不使用でiOS Safari互換。
const renderSmnMarkdown=(text)=>{
  if(!text)return "";
  const esc=(s)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const inline=(s)=>esc(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  const lines=text.split(/\r?\n/);
  let html="",inList=false;
  const closeList=()=>{if(inList){html+="</ul>";inList=false}};
  for(const raw of lines){
    const line=raw.replace(/\s+$/,"");
    let m;
    if(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)){closeList();html+='<hr style="border:none;border-top:1px solid #d1d5db;margin:10px 0"/>';continue}
    if(m=line.match(/^###\s+(.+)/)){closeList();html+=`<div style="font-size:13px;font-weight:700;color:#047857;margin:8px 0 4px">${inline(m[1])}</div>`;continue}
    if(m=line.match(/^##\s+(.+)/)){closeList();html+=`<div style="font-size:15px;font-weight:700;color:#065f46;margin:12px 0 6px;border-bottom:2px solid #a7f3d0;padding-bottom:3px">${inline(m[1])}</div>`;continue}
    if(m=line.match(/^#\s+(.+)/)){closeList();html+=`<div style="font-size:17px;font-weight:800;color:#064e3b;margin:14px 0 8px">${inline(m[1])}</div>`;continue}
    if(m=line.match(/^\s*(?:[-*・]|•)\s+(.+)/)){if(!inList){html+='<ul style="margin:4px 0;padding-left:20px">';inList=true}html+=`<li style="margin:2px 0">${inline(m[1])}</li>`;continue}
    if(m=line.match(/^\s*(\d+)[.)]\s+(.+)/)){closeList();html+=`<div style="margin:3px 0;padding-left:8px"><span style="font-weight:700;color:#059669">${m[1]}.</span> ${inline(m[2])}</div>`;continue}
    if(line.trim()===""){closeList();html+='<div style="height:6px"></div>';continue}
    closeList();
    html+=`<div style="margin:3px 0">${inline(line)}</div>`;
  }
  closeList();
  return html;
};
const applyDict=(text)=>{if(!dictEnabled||!text)return text;let r=text;for(const[from,to] of dict){if(!from||!to||from===to)continue;if(from.length>=3){try{const kataFrom=toKatakana(from);const hiraFrom=kataFrom.replace(/[\u30A1-\u30F6]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));const escaped=from.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const kataEsc=kataFrom.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const hiraEsc=hiraFrom.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const patterns=[...new Set([escaped,kataEsc,hiraEsc])];const re=new RegExp(patterns.join("|"),"gi");r=r.replace(re,to)}catch{r=r.split(from).join(to)}}else{r=r.split(from).join(to)}}return r};
const saveDictLocal=(d)=>{try{localStorage.setItem("mk_dict",JSON.stringify(d))}catch{}};
const saveNoisePatternsLocal=(patterns)=>{
  try{localStorage.setItem("mk_noisePatterns",JSON.stringify(patterns))}catch{}
};
const dictAddSupabase=async(from,to)=>{if(!supabase)return;try{await supabase.from("dictionary").insert({from_text:from,to_text:to})}catch(e){console.error("dict insert error:",e)}};
const dictDelSupabase=async(from)=>{if(!supabase)return;try{await supabase.from("dictionary").delete().eq("from_text",from)}catch(e){console.error("dict delete error:",e)}};
const dictAddEntry=(from,to)=>{const nd=[[from,to],...dict];setDict(nd);saveDictLocal(nd);dictAddSupabase(from,to)};
const dictDelEntry=(idx)=>{const entry=dict[idx];const nd=dict.filter((_,j)=>j!==idx);setDict(nd);saveDictLocal(nd);if(entry)dictDelSupabase(entry[0])};

// AI校正
const[typoModal,setTypoModal]=useState(null);
const[typoLd,setTypoLd]=useState(false);
const[typoLdOut,setTypoLdOut]=useState(false);
const[typoTarget,setTypoTarget]=useState("inp");
const[typoSelections,setTypoSelections]=useState({});
const[typoCustomInputs,setTypoCustomInputs]=useState({});
const[patientModal,setPatientModal]=useState(null);
const[monthlyModal,setMonthlyModal]=useState(false);
const[monthlyLd,setMonthlyLd]=useState(false);
const[monthlyResult,setMonthlyResult]=useState("");
const[monthlyTarget,setMonthlyTarget]=useState("");
const[voiceCmd,setVoiceCmd]=useState(false);
const[vcStatus,setVcStatus]=useState("");
const[feedback,setFeedback]=useState(null);
const[feedbackNote,setFeedbackNote]=useState("");
const[feedbackSaving,setFeedbackSaving]=useState(false);
const[lastRecordId,setLastRecordId]=useState(null);
const runTypoCheck=async()=>{const t=iR.current;if(!t||!t.trim()){sSt("書き起こしテキストがありません");return}setTypoTarget("inp");setTypoLd(true);sSt("🔍 AI校正中...");try{const r=await fetch("/api/fix-typos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t,dictionary:dict.map(([from,to])=>({from,to}))})});if(!r.ok){const errText=await r.text();console.error("AI校正 fetch error:",r.status,errText);sSt("校正エラー: サーバーエラー("+r.status+")");return}const d=await r.json();if(d.error){console.error("AI校正 API error:",d.error);sSt("校正エラー: "+d.error);return}if(!d.corrections||d.corrections.length===0){sSt("✓ 医療用語の誤りは見つかりませんでした");return}const registeredFroms=new Set(dict.map(([f])=>f));const newCorrections=d.corrections.filter(c=>!registeredFroms.has(c.from));if(newCorrections.length===0){sSt("✓ 新しい誤字候補はありません（全て登録済み）");return}const sel={};newCorrections.forEach((c,i)=>{if(c.candidates&&c.candidates.length>0&&c.candidates.length===1)sel[i]=0});setTypoSelections(sel);setTypoCustomInputs({});setTypoModal(newCorrections);sSt("校正候補が見つかりました")}catch(e){console.error("AI校正 error:",e);sSt("校正エラー: "+e.message)}finally{setTypoLd(false)}};
const runTypoCheckOut=async()=>{const t=out;if(!t||!t.trim()){sSt("要約テキストがありません");return}setTypoTarget("out");setTypoLdOut(true);sSt("🔍 要約AI校正中...");try{const r=await fetch("/api/fix-typos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t,dictionary:dict.map(([from,to])=>({from,to}))})});if(!r.ok){const errText=await r.text();console.error("AI校正 fetch error:",r.status,errText);sSt("校正エラー: サーバーエラー("+r.status+")");return}const d=await r.json();if(d.error){console.error("AI校正 API error:",d.error);sSt("校正エラー: "+d.error);return}if(!d.corrections||d.corrections.length===0){sSt("✓ 要約の医療用語の誤りは見つかりませんでした");return}const registeredFroms=new Set(dict.map(([f])=>f));const newCorrections=d.corrections.filter(c=>!registeredFroms.has(c.from));if(newCorrections.length===0){sSt("✓ 新しい誤字候補はありません（全て登録済み）");return}const sel={};newCorrections.forEach((c,i)=>{if(c.candidates&&c.candidates.length>0&&c.candidates.length===1)sel[i]=0});setTypoSelections(sel);setTypoCustomInputs({});setTypoModal(newCorrections);sSt("校正候補が見つかりました")}catch(e){console.error("AI校正 error:",e);sSt("校正エラー: "+e.message)}finally{setTypoLdOut(false)}};
const applyTypoCorrection=(idx,candidateIdx)=>{try{if(!typoModal||!typoModal[idx])return;const c=typoModal[idx];const candidate=c.candidates?.[candidateIdx];if(!candidate){console.error("applyTypoCorrection: invalid candidate",{idx,candidateIdx,c});return}if(typoTarget==="out"){sOut(prev=>prev.split(c.from).join(candidate.to))}else if(typoTarget==="minOut"){setMinOut(prev=>prev.split(c.from).join(candidate.to))}else if(typoTarget==="minInp"){setMinInp(prev=>prev.split(c.from).join(candidate.to))}else{sInp(prev=>prev.split(c.from).join(candidate.to))}dictAddEntry(c.from,candidate.to)}catch(e){console.error("applyTypoCorrection error:",e)}};
const applyAllTypos=()=>{try{if(!typoModal)return;let t=typoTarget==="out"?out:typoTarget==="minOut"?minOut:typoTarget==="minInp"?minInp:iR.current;const applied=[];typoModal.forEach((c,i)=>{if(typoCustomInputs[i]?.trim()){const customTo=typoCustomInputs[i].trim();t=t.split(c.from).join(customTo);applied.push([c.from,customTo])}else if(typoSelections[i]!==undefined){const candidate=c.candidates?.[typoSelections[i]];if(candidate){t=t.split(c.from).join(candidate.to);applied.push([c.from,candidate.to])}}});if(typoTarget==="out"){sOut(t)}else if(typoTarget==="minOut"){setMinOut(t)}else if(typoTarget==="minInp"){setMinInp(t)}else{sInp(t)}if(applied.length>0){const newDict=[...applied,...dict];setDict(newDict);saveDictLocal(newDict);applied.forEach(([f,to])=>dictAddSupabase(f,to))}setTypoModal(null);setTypoCustomInputs({});sSt(`✓ ${applied.length}件の修正を登録しました`)}catch(e){console.error("applyAllTypos error:",e);sSt("登録エラー: "+e.message)}};
const runHistTypoCheck=async()=>{const selected=filteredHist.filter(r=>selectedHistIds.has(r.id));if(!selected.length)return;setHistTypoLd(true);setTypoTarget("hist");sSt(`🔬 スキャン中... (${selected.length}件)`);try{const combined=selected.map(r=>[r.input_text||"",r.output_text||""].filter(Boolean).join("\n")).join("\n---\n");const r=await fetch("/api/fix-typos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:combined,dictionary:dict.map(([from,to])=>({from,to}))})});if(!r.ok){sSt("校正エラー: サーバーエラー("+r.status+")");return}const d=await r.json();if(d.error){sSt("校正エラー: "+d.error);return}if(!d.corrections||d.corrections.length===0){sSt("✓ 医療用語の誤りは見つかりませんでした");return}const registeredFroms=new Set(dict.map(([f])=>f));const newCorrections=d.corrections.filter(c=>!registeredFroms.has(c.from));if(newCorrections.length===0){sSt("✓ 新しい誤字候補はありません（全て登録済み）");return}const sel={};newCorrections.forEach((c,i)=>{if(c.candidates&&c.candidates.length===1)sel[i]=0});setTypoSelections(sel);setTypoCustomInputs({});setTypoModal(newCorrections);sSt("校正候補が見つかりました")}catch(e){sSt("校正エラー: "+e.message)}finally{setHistTypoLd(false)}};
const runHistNoiseScan=async()=>{
  const selected=filteredHist.filter(r=>selectedHistIds.has(r.id));
  if(!selected.length)return;
  setHistNoiseLd(true);
  sSt(`🚫 ノイズスキャン中... (${selected.length}件)`);
  try{
    const combined=selected.map(r=>r.input_text||"").filter(Boolean).join("\n---\n");
    if(!combined.trim()){sSt("書き起こしテキストがありません");return}
    const res=await fetch("/api/scan-noise",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text:combined,registered:noisePatterns})
    });
    if(!res.ok){sSt("ノイズスキャンエラー: サーバーエラー("+res.status+")");return}
    const d=await res.json();
    if(d.error){sSt("ノイズスキャンエラー: "+d.error);return}
    if(!d.candidates||d.candidates.length===0){
      sSt("✓ 新しいノイズパターンは見つかりませんでした");return
    }
    const registeredSet=new Set(noisePatterns);
    const newCandidates=d.candidates.filter(c=>!registeredSet.has(c.text));
    if(newCandidates.length===0){
      sSt("✓ 新しいノイズ候補はありません（全て登録済み）");return
    }
    setNoiseCandidates(newCandidates);
    setNoiseModal(true);
    sSt("ノイズ候補が見つかりました");
  }catch(e){
    sSt("ノイズスキャンエラー: "+e.message)
  }finally{
    setHistNoiseLd(false)
  }
};
const runNoiseScan=async()=>{
  const recentText=[inp,minInp].filter(Boolean).join("\n---\n");
  if(!recentText.trim()){sSt("書き起こしテキストがありません");return}
  setNoiseScanLd(true);sSt("🔍 ノイズ候補を分析中...");
  try{
    const res=await fetch("/api/scan-noise",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text:recentText,registered:noisePatterns})
    });
    const d=await res.json();
    if(d.error){sSt("エラー: "+d.error);return}
    if(!d.candidates||d.candidates.length===0){sSt("✓ 新しいノイズ候補は見つかりませんでした");return}
    setNoiseCandidates(d.candidates);
    setNoiseModal(true);
    sSt("ノイズ候補が見つかりました");
  }catch(e){sSt("エラー: "+e.message)}
  finally{setNoiseScanLd(false)}
};
const addNoisePattern=async(pattern)=>{
  if(!pattern||!pattern.trim())return;
  const p=pattern.trim();
  if(noisePatterns.includes(p)){sSt("既に登録されています");return}
  const updated=[...noisePatterns,p];
  setNoisePatterns(updated);
  saveNoisePatternsLocal(updated);
  if(supabase){try{await supabase.from("noise_patterns").upsert({pattern:p},{onConflict:"pattern"})}catch(e){console.error("noise_patterns insert error:",e)}}
  sSt("✓ ノイズパターンを登録しました: "+p);
};
const removeNoisePattern=async(idx)=>{
  const p=noisePatterns[idx];
  const updated=noisePatterns.filter((_,i)=>i!==idx);
  setNoisePatterns(updated);
  saveNoisePatternsLocal(updated);
  if(supabase&&p){try{await supabase.from("noise_patterns").delete().eq("pattern",p)}catch(e){console.error("noise_patterns delete error:",e)}}
};
const BULK_MODES=[{id:"treatment",label:"🏥 疾患別治療説明・プランまとめ"},{id:"patient",label:"👤 患者説明文の自動生成"},{id:"protocol",label:"📋 治療プロトコル抽出"},{id:"faq",label:"❓ よくある質問FAQ生成"},{id:"training",label:"📚 スタッフ向け研修資料生成"}];
const runBulkAnalyze=async(mode)=>{const selected=filteredHist.filter(r=>selectedHistIds.has(r.id));if(!selected.length)return;setBulkMenu(false);setBulkLd(true);const modeLabel=BULK_MODES.find(m=>m.id===mode)?.label||mode;sSt(`⏳ 分析中... (${selected.length}件)`);try{const records=selected.map(r=>({input_text:r.input_text||"",output_text:r.output_text||""}));const r=await fetch("/api/bulk-analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records,mode})});if(!r.ok){sSt("分析エラー: サーバーエラー("+r.status+")");return}const d=await r.json();if(d.error){sSt("分析エラー: "+d.error);return}setBulkResult({title:modeLabel,content:d.result||""});sSt("分析完了")}catch(e){sSt("分析エラー: "+e.message)}finally{setBulkLd(false)}};

const runTreatmentMaterial=async()=>{
  const selected=filteredHist.filter(r=>selectedHistIds.has(r.id));
  if(!selected.length)return;
  setTreatLd(true);
  setTreatModal(true);
  setTreatResult(null);
  sSt(`⏳ 治療資料を生成中... (${selected.length}件)`);
  try{
    const records=selected.map(r=>({input_text:r.input_text||"",output_text:r.output_text||""}));
    const res=await fetch("/api/treatment-material",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records})});
    const d=await res.json();
    if(d.error){sSt("エラー: "+d.error);return}
    setTreatResult(d);
    sSt("✓ 治療資料の生成が完了しました");
  }catch(e){
    sSt("エラー: "+e.message);
  }finally{
    setTreatLd(false);
  }
};

// Audio
// 省電力: レベルバー解析は表示上60fps不要のため8フレームに1回(≒7.5fps)のみ処理する(録音ストリーム・MediaRecorderには非干渉)。
const sAM=async()=>{try{const constraints=selectedMic?{audio:{deviceId:{exact:selectedMic}}}:{audio:true};const s=await navigator.mediaDevices.getUserMedia(constraints);msR.current=s;const c=new(window.AudioContext||window.webkitAudioContext)(),sr=c.createMediaStreamSource(s),a=c.createAnalyser();a.fftSize=256;a.smoothingTimeConstant=0.7;sr.connect(a);acR.current=c;anR.current=a;if(c.state==="suspended"){try{c.resume()}catch{}}const d=new Uint8Array(a.frequencyBinCount);let fc=0;const tk=()=>{if(!anR.current)return;laR.current=requestAnimationFrame(tk);fc=(fc+1)%8;if(fc!==0)return;anR.current.getByteFrequencyData(d);let sm=0;for(let i=0;i<d.length;i++)sm+=d[i];if(c.state==="running")lvLastUpdateRef.current=Date.now();sLv(Math.min(100,Math.round((sm/d.length/128)*100)))};laR.current=requestAnimationFrame(tk);return s}catch(e){console.error("Mic error:",e);sSt("マイク取得失敗：ブラウザの許可設定を確認してください");return null}};
const xAM=()=>{if(laR.current)cancelAnimationFrame(laR.current);laR.current=null;if(acR.current){try{acR.current.close()}catch{}}acR.current=null;if(msR.current){msR.current.getTracks().forEach(t=>t.stop())}msR.current=null;anR.current=null;sLv(0)};
// 省電力: バックグラウンド化時はレベルバー用AudioContextのみsuspend(MediaRecorder/録音ストリームは対象外)。
// 録音中はsuspendしない(過去にsuspend中のlv固定が無音ゲートを誤爆させた教訓)。仮にsuspendされても
// lvゲートは鮮度5秒切れで素通り(fail-open)する仕様のため、書き起こしが止まる構造には戻らない。
useEffect(()=>{const onVis=()=>{const ctx=acR.current;if(!ctx)return;const recording=rsRef.current==="recording"||minSR.current==="recording"||smnSR.current==="recording";try{if(document.hidden){if(!recording)ctx.suspend()}else{ctx.resume()}}catch{}};document.addEventListener("visibilitychange",onVis);return()=>document.removeEventListener("visibilitychange",onVis)},[]);
// === マイク入力テスト（録音と独立・専用リソース）===
const stopMicTest=()=>{const r=micTestRef.current;micTestRef.current=null;if(r){if(r.raf)cancelAnimationFrame(r.raf);if(r.timer)clearTimeout(r.timer);if(r.stream){try{r.stream.getTracks().forEach(t=>t.stop())}catch{}}if(r.ctx){try{r.ctx.close()}catch{}}}setMicTestLv(0);setMicTesting(false);};
const startMicTest=async()=>{
  if(rsRef.current!=="inactive"){setMicTestMsg("⚠️ 録音中はテストできません（録音を停止してからお試しください）");return;}
  if(micTestRef.current)return;
  setMicTestMsg("テスト中… マイクに話しかけてください");setMicTestLv(0);setMicTesting(true);
  let peak=0;
  try{
    const constraints=selectedMic?{audio:{deviceId:{exact:selectedMic}}}:{audio:true};
    const stream=await navigator.mediaDevices.getUserMedia(constraints);
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    if(ctx.state==="suspended"){try{await ctx.resume()}catch{}}
    const src=ctx.createMediaStreamSource(stream),an=ctx.createAnalyser();an.fftSize=256;an.smoothingTimeConstant=0.7;src.connect(an);
    const data=new Uint8Array(an.frequencyBinCount);
    const label=(stream.getAudioTracks&&stream.getAudioTracks()[0]&&stream.getAudioTracks()[0].label)||"";
    micTestRef.current={ctx,stream,raf:0,timer:0};
    const tick=()=>{if(!micTestRef.current)return;an.getByteFrequencyData(data);let sm=0;for(let i=0;i<data.length;i++)sm+=data[i];const lvl=Math.min(100,Math.round((sm/data.length/128)*100));setMicTestLv(lvl);if(lvl>peak)peak=lvl;micTestRef.current.raf=requestAnimationFrame(tick);};
    micTestRef.current.raf=requestAnimationFrame(tick);
    micTestRef.current.timer=setTimeout(()=>{stopMicTest();if(peak>=6){setMicTestMsg(`✅ 音声を検出しました${label?`（${label}）`:""}`);}else{setMicTestMsg("⚠️ 音が届いていません。マイクの接続・ミュート・許可を確認してください");}},4000);
  }catch(e){stopMicTest();setMicTestMsg("⚠️ マイクを起動できませんでした（許可・接続・端末をご確認ください）");}
};
// 録音が始まったらテストは即解放（同一マイク競合回避・録音コアには触れない）
useEffect(()=>{if(rs!=="inactive"&&micTestRef.current)stopMicTest()},[rs]);
const tc=async(b)=>{bumpDiag("rec");noteDiagMR(mR.current,b.size);if(b.size<500)return;
// 音声保存は mR_save 側で連続録音中（tcは書き起こし専用）
// 音声レベルが低すぎる場合は書き起こしAPI送信のみスキップ
if(!disableSilenceSkipRef.current&&Date.now()-lvLastUpdateRef.current<5000&&lvRef.current<1){return;}bumpDiag("lv");if(await isSilentChunk(b)){return}bumpDiag("sil");sPC(p=>p+1);sSt("🔄 書き起こし中...");try{const f=new FormData();f.append("audio",b,"audio.webm");const endpoint=(asrEngine==="avalon"&&!isIOSDevice)?"/api/transcribe-avalon":asrEngine==="qwen"?"/api/transcribe-qwen":asrEngine==="gemini"?"/api/transcribe-gemini":"/api/transcribe";bumpDiag("sent");const r=await fetch(endpoint,{method:"POST",body:f});if(r.ok)bumpDiag("ok");else{bumpDiag("err");setDiagErr("HTTP "+r.status)}const d=await r.json();if(r.ok)setDiagLastLen(((d&&d.text)||"").length);if(asrEngine==="avalon"){if(d&&d.fallback){setAvalonFellBack(true);setAvalonFellBackReason(d.avalonError||"")}else if(d&&!d.fallback){setAvalonFellBack(false);setAvalonFellBackReason("")}}if(endpoint==="/api/transcribe"){fetch("/api/log-usage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({route:"/api/transcribe",model:"whisper-1",context:"transcribe-medical",duration_seconds:10,request_meta:{blob_size:b.size,text_length:(d.text||"").length,room:rid}})}).catch(()=>{});}if(d.text&&d.text.trim()){const noise=filterTranscriptNoise(d.text.trim());if(!noise)return;const fixed=applyDict(noise);sInp(p=>{
const newInp=foldAccum(p+(p?"\n":"")+fixed);
// 自動テンプレ切替は廃止（処置/美容キーワード(冷凍凝固・レーザー等)で誤切替し、診察カルテのA-S-O-P疾患別が処置記録形式に倒れるデグレの原因のため）。
// テンプレはユーザーの手動選択／既定(soap-std=A-S-O-P疾患別)を常に尊重する。処置・美容テンプレは手動選択で利用可。
return newInp;
});sSt(`録音中 ✓ [${asrEngine==="qwen"?"Qwen3":asrEngine==="gemini"?"Gemini":(asrEngine==="avalon"&&!isIOSDevice)?"Avalon":(asrEngine==="both"&&!isIOSDevice)?"両方比較→Whisper":(isIOSDevice&&(asrEngine==="avalon"||asrEngine==="both"))?"Whisper(iOS代替)":"Whisper"}]`)}else{sSt("録音中")}}catch(e){bumpDiag("err");setDiagErr(String((e&&e.message)||e));sSt("録音中（エラー）")}finally{sPC(p=>Math.max(0,p-1))}};
const cMR=(s)=>{const m=new MediaRecorder(s,{mimeType:MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm"});m.ondataavailable=(e)=>{if(e.data.size>0)tc(e.data)};return m};
// 保存用MR：タイムスライスなしで連続録音、stop時に1本の完結webmとしてsaveAudio
const startSaveMR=(s)=>{const ms=new MediaRecorder(s,{mimeType:MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm"});const chunks=[];const startTime=Date.now();const partN=audioPartCounter.current;ms.ondataavailable=(e)=>{if(e.data.size>0)chunks.push(e.data)};ms.onstop=()=>{if(audioSaveRef.current&&chunks.length>0){const elapsed=(Date.now()-startTime)/1000;const blob=new Blob(chunks,{type:"audio/webm"});saveAudio(blob,partN,elapsed)}};ms.start();return ms};
const vcRef=useRef(null);
const voiceCmdRef=useRef(false);
useEffect(()=>{voiceCmdRef.current=voiceCmd},[voiceCmd]);
const startVoiceCommand=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){sSt("音声コマンドはChrome専用です");return}const sr=new SR();sr.lang="ja-JP";sr.continuous=true;sr.interimResults=false;sr.onresult=(e)=>{const txt=e.results[e.results.length-1][0].transcript.trim();setVcStatus("🎤 「"+txt+"」");if(/次へ|次の患者|クリア/.test(txt)){clr();setVcStatus("✓ 次の患者へ")}else if(/要約|まとめ|カルテ/.test(txt)){sum();setVcStatus("✓ 要約開始")}else if(/録音|開始|スタート/.test(txt)){if(rs==="inactive")go();setVcStatus("✓ 録音開始")}else if(/停止|ストップ|終了/.test(txt)){if(rs!=="inactive")stop();setVcStatus("✓ 録音停止")}else if(/一時停止|ポーズ/.test(txt)){if(rs==="recording")pause();setVcStatus("✓ 一時停止")}else if(/再開|レジューム/.test(txt)){if(rs==="paused")resume();setVcStatus("✓ 再開")}else if(/コピー/.test(txt)){if(out)navigator.clipboard.writeText(out);setVcStatus("✓ コピー完了")}setTimeout(()=>setVcStatus(""),2000)};sr.onerror=(e)=>{if(e.error!=="no-speech"){setVcStatus("エラー: "+e.error)}};sr.onend=()=>{if(voiceCmdRef.current){try{sr.start()}catch{}}};vcRef.current=sr;try{sr.start();setVcStatus("待機中...")}catch(e){sSt("音声コマンド開始エラー: "+e.message)}};
const stopVoiceCommand=()=>{if(vcRef.current){try{vcRef.current.stop()}catch{}}vcRef.current=null;setVcStatus("")};
useEffect(()=>{if(voiceCmd){startVoiceCommand()}else{stopVoiceCommand()}return()=>{stopVoiceCommand()}},[voiceCmd]);
const go=async()=>{autoTplRef.current=false;setAutoTplMsg("");saveRecordRef.current=false;audioPathsRef.current=[];lastRecordIdRef.current=null;setAudioSaveNote(null);const s=await sAM();if(!s)return;sRS("recording");sSt("録音中");audioPartCounter.current=1;audioPartStartTime.current=Date.now();mR_save.current=startSaveMR(s);const m=cMR(s);m.start();mR.current=m;cR.current=setInterval(()=>{if(mR.current&&mR.current.state==="recording"){mR.current.stop();setTimeout(()=>{if(mR.current!==null){const m2=cMR(s);m2.start();mR.current=m2}},100)}},10000);if(audioChunkTimer.current){clearInterval(audioChunkTimer.current);audioChunkTimer.current=null}audioChunkTimer.current=setInterval(()=>{if(!audioSaveRef.current||!mR_save.current)return;const elapsed=Date.now()-audioPartStartTime.current;if(elapsed>=1200000){if(mR_save.current.state!=="inactive")mR_save.current.stop();audioPartCounter.current++;audioPartStartTime.current=Date.now();if(msR.current)mR_save.current=startSaveMR(msR.current)}},30000)};
const stop=()=>{if(cR.current)clearInterval(cR.current);if(audioChunkTimer.current){clearInterval(audioChunkTimer.current);audioChunkTimer.current=null}if(mR.current&&mR.current.state==="recording")mR.current.stop();mR.current=null;if(mR_save.current&&mR_save.current.state!=="inactive")mR_save.current.stop();mR_save.current=null;xAM();sRS("inactive");sSt("待機中")};
const pause=()=>{if(cR.current)clearInterval(cR.current);if(mR.current&&mR.current.state==="recording")mR.current.stop();if(mR_save.current&&mR_save.current.state==="recording")mR_save.current.pause();sRS("paused");sSt("一時停止")};
const resume=()=>{if(!msR.current)return;sRS("recording");sSt("録音中");if(mR_save.current&&mR_save.current.state==="paused")mR_save.current.resume();else if(!mR_save.current)mR_save.current=startSaveMR(msR.current);const m=cMR(msR.current);m.start();mR.current=m;cR.current=setInterval(()=>{if(mR.current&&mR.current.state==="recording"){mR.current.stop();setTimeout(()=>{if(mR.current!==null){const m2=cMR(msR.current);m2.start();mR.current=m2}},100)}},10000)};
const extractRx=async(summaryText)=>{
if(!summaryText||!summaryText.trim())return;
setRxLd(true);
try{
const r=await fetch("/api/extract-rx",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:summaryText})});
const d=await r.json();
if(d.items&&d.items.length>0){setRxItems(d.items);setRxOpen(true)}
else{setRxItems([])}
}catch{setRxItems([])}
finally{setRxLd(false)}
};
const generateUsageGuide=async()=>{
if(!rxItems.length)return;
setUsageGuideLd(true);setUsageGuideModal(true);setUsageGuide("");
const meds=rxItems.filter(i=>i.type==="外用"||i.type==="内服");
const medList=meds.map(i=>`・${i.name}（${i.usage||""}）`).join("\n");
try{
const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
text:medList,mode:"gemini",
prompt:`以下の処方薬について、患者向けのわかりやすい使い方説明書を作成してください。

【出力形式】
# 薬の使い方ガイド

## 各薬の使い方
（薬ごとに以下を記載）
### 薬剤名
- いつ使う：
- どこに使う：
- どのくらい使う：（FTUの目安も含める）
- 塗り方のコツ：

## 注意事項
- 使ってはいけない場合：
- こんな時は受診を：

患者が自宅で読んでわかる平易な言葉で。`
})});
const d=await r.json();
setUsageGuide(d.summary||"");
}catch(e){setUsageGuide("エラー: "+e.message)}
finally{setUsageGuideLd(false)}
};
const sum=async(tx)=>{if(!tx&&rsRef.current==="recording"){const textBeforeStop=iR.current;stopSum();await new Promise(resolve=>setTimeout(resolve,800));if(!iR.current&&textBeforeStop) iR.current=textBeforeStop;}let t=tx||iR.current;if(!t.trim()){sSt("テキストを入力してください");return}if(t.trim().length<20){sSt("⚠️ 書き起こしが短すぎます。音声入力を確認してください。");return}if(t.replace(/[\s\n]/g,"").length<15){sSt("⚠️ 会話内容が少なすぎます。マイクの位置や音量を確認してください。");return}sumDoneRef.current=false;sLd(true);setProg(10);/* 高速化: 要約直前の自動補正(直列)は廃止。補正は手動✨ボタンで実行 */sSt(summaryModel==="claude"?"Claude Sonnet 4.6 で要約中...":summaryModel==="gemini-pro"?"Gemini 2.5 Pro で要約中...":"Gemini 3.5 Flash で要約中...");try{
const FORBIDDEN_RULES="\n\n【絶対禁止】以下は一切出力しないこと：音声認識の精度が〜、断片的な情報から〜、再録音をお願いします、把握が困難、推定します、※で始まる注釈、**で囲まれた注意書き、カルテ要約以外の説明文やコメント";
const enhancedPrompt=ct.prompt+FORBIDDEN_RULES;
setProg(40);
const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:iR.current,mode:summaryModel==="claude"?"claude":"gemini",prompt:enhancedPrompt,model_preference:summaryModel,stream:summaryModel!=="claude"})});
if(summaryModel==="claude"){
const d=await r.json();if(d.error){sOut("エラー: "+d.error)}else{sOut(d.summary);if(d.model)setGeminiModel(d.model);setProg(90);sumDoneRef.current=true;await saveRecord(iR.current,d.summary);extractRx(d.summary);try{await navigator.clipboard.writeText(d.summary);sSt(`要約完了 ✓ [${d.model||"claude"}]`)}catch{sSt(`要約完了 [${d.model||"claude"}]`)}}
}else{
const reader=r.body.getReader();const decoder=new TextDecoder();let buffer="";let finalSummary="";let usedModel="";
while(true){const{done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split("\n");buffer=lines.pop()||"";
for(const line of lines){if(!line.startsWith("data: "))continue;try{const json=JSON.parse(line.slice(6));
if(json.error){sOut("エラー: "+json.error);return}
if(json.chunk){finalSummary+=json.chunk;sOut(finalSummary);if(json.model)usedModel=json.model;setProg(Math.min(85,40+Math.floor(finalSummary.length/10)))}
if(json.done){setGeminiModel(usedModel);setProg(90);sumDoneRef.current=true;await saveRecord(iR.current,finalSummary);extractRx(finalSummary);try{await navigator.clipboard.writeText(finalSummary);sSt(`要約完了 ✓ [${usedModel}]`)}catch{sSt(`要約完了 [${usedModel}]`)}}}catch{}}}}
}catch{sSt("エラーが発生しました")}finally{sLd(false);setProg(0)}};
const stopSum=()=>{clearInterval(cR.current);if(audioChunkTimer.current){clearInterval(audioChunkTimer.current);audioChunkTimer.current=null}if(mR.current&&mR.current.state==="recording"){const cr2=mR.current;cr2.ondataavailable=async(e)=>{if(e.data.size>0){const f=new FormData();f.append("audio",e.data,"audio.webm");try{const endpoint=(asrEngine==="avalon"&&!isIOSDevice)?"/api/transcribe-avalon":asrEngine==="qwen"?"/api/transcribe-qwen":asrEngine==="gemini"?"/api/transcribe-gemini":"/api/transcribe";bumpDiag("sent");const r=await fetch(endpoint,{method:"POST",body:f});if(r.ok)bumpDiag("ok");else{bumpDiag("err");setDiagErr("HTTP "+r.status)}const d=await r.json();if(r.ok)setDiagLastLen(((d&&d.text)||"").length);if(asrEngine==="avalon"){if(d&&d.fallback){setAvalonFellBack(true);setAvalonFellBackReason(d.avalonError||"")}else if(d&&!d.fallback){setAvalonFellBack(false);setAvalonFellBackReason("")}}if(endpoint==="/api/transcribe"){fetch("/api/log-usage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({route:"/api/transcribe",model:"whisper-1",context:"transcribe-final",duration_seconds:Math.min(10,Math.max(1,Math.round(e.data.size/16000))),request_meta:{blob_size:e.data.size,text_length:(d.text||"").length,room:rid,final:true}})}).catch(()=>{});}if(d.text&&d.text.trim()){const noise=filterTranscriptNoise(d.text.trim());const ft=foldAccum(iR.current+(iR.current?"\n":"")+(noise?applyDict(noise):""));sInp(ft);setTimeout(()=>sum(ft),300)}else{sum()}}catch{sum()}}else{sum()}};cr2.stop()}else{sum()}mR.current=null;if(mR_save.current&&mR_save.current.state!=="inactive")mR_save.current.stop();mR_save.current=null;xAM();sRS("inactive")};
const saveUndo=()=>{undoRef.current={inp:iR.current||"",out:out,pName:pName,pId:pId}};
const undo=()=>{if(!undoRef.current)return;const u=undoRef.current;sInp(u.inp);sOut(u.out);sPName(u.pName);sPId(u.pId);undoRef.current=null;sSt("↩ 元に戻しました")};
// PiPボタン更新の外側ラッパー：本体は openPip 内で定義され pipBtnUpdateRef に登録される
const pipBtnUpdate=()=>{try{pipBtnUpdateRef.current&&pipBtnUpdateRef.current()}catch(e){console.warn("pipBtnUpdate error:",e)}};
const clr=()=>{const hasUnsavedAudio=audioSaveRef.current&&mR_save.current&&mR_save.current.state!=="inactive";if(hasUnsavedAudio){const ok=window.confirm("未保存の録音があります。\n音声を保存してから次の患者に進みますか？\n\nOK: 保存して次へ / キャンセル: 中止");if(!ok)return;mR_save.current.stop();mR_save.current=null}if(audioChunkTimer.current){clearInterval(audioChunkTimer.current);audioChunkTimer.current=null}try{if(examSessionIdRef.current){deleteTranscriptSession(examSessionIdRef.current);examSessionIdRef.current=null}}catch{}saveUndo();sInp("");sOut("");sSt("待機中");sEl(0);sPName("");sPId("");autoTplRef.current=false;setAutoTplMsg("");saveRecordRef.current=false;setFeedback(null);setFeedbackNote("");setLastRecordId(null);lastRecordIdRef.current=null;audioPathsRef.current=[];try{if(rid==="r7"){sTid("counseling-std")}else{const dt=localStorage.getItem("mk_defaultTpl");if(dt&&dt!=="counseling-std")sTid(dt);else if(tidRef.current==="counseling-std")sTid("soap-std")}}catch{};const pd=pipRef.current;if(pd){try{const al=pd.getElementById("pip-alert");if(al)al.remove()}catch{};try{const pi=pd.getElementById("pip-pid");if(pi)pi.value=""}catch{};setTimeout(pipBtnUpdate,300)}};
const cp=async(t)=>{try{await navigator.clipboard.writeText(t);sSt("コピー済み ✓")}catch{}};
// === D-1〜D-3 複数選択削除 共通ヘルパー & 削除関数 ===
const toggleIdInSet=(setter,id)=>{setter(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n})};
// クリックされたボタンの座標から、ポップオーバーの表示位置(left/top)を算出（画面端ガード付き）
const calcPopAnchor=(e)=>{
  try{
    const r=e.currentTarget.getBoundingClientRect();
    const W=300,H=190; // ポップオーバーの想定サイズ
    let left=Math.max(8,Math.min(r.left,window.innerWidth-W-8));   // 右端で見切れたら左へ寄せる
    let top=r.bottom+8;                                            // 通常はボタン直下8px
    if(top+H>window.innerHeight)top=Math.max(8,r.top-H-8);         // 下端で見切れたらボタン上へ
    return{left,top};
  }catch{return{left:16,top:16}}
};
// ポップオーバー表示中にスクロールするとボタンと位置がずれるため閉じる（capture:trueで内側スクロール容器も検知）
useEffect(()=>{
  if(!minDeleteConfirm)return;
  const close=()=>setMinDeleteConfirm(null);
  window.addEventListener("scroll",close,true);
  return()=>window.removeEventListener("scroll",close,true);
},[minDeleteConfirm]);
// 議事録一括削除（既存 selMinutes を流用）→ カスタム確認モーダルを開く
const deleteMinSelected=async(e)=>{
  const ids=Array.from(selMinutes);
  if(ids.length===0){sSt("⚠️ 削除する議事録を選択してください");return}
  // 選択された議事録に音声があるか確認
  const hasAudio=minHist.some(m=>ids.includes(m.id)&&m.audio_path);
  setMinDeleteConfirm({ids,count:ids.length,hasAudio,anchor:calcPopAnchor(e)});
};
// 議事録削除の実行（モーダル「削除する」押下時）
const executeMinDelete=async(ids)=>{
  if(!supabase||!ids||ids.length===0)return;
  setMinDeleting(true);
  try{
    // 1. Storage の音声を削除（audio_path はカンマ区切りで複数パス）
    const{data:targets,error:selErr}=await supabase
      .from("minutes")
      .select("id,audio_path")
      .in("id",ids);
    if(selErr)throw selErr;
    const audioPaths=(targets||[])
      .map(t=>t.audio_path)
      .filter(Boolean)
      .flatMap(p=>String(p).split(",").map(s=>s.trim()).filter(Boolean));
    if(audioPaths.length>0){
      const{error:stErr}=await supabase.storage.from("audio").remove(audioPaths);
      if(stErr)console.warn("[executeMinDelete] storage remove warning:",stErr);
    }
    // 2. DB レコード削除
    const{error}=await supabase.from("minutes").delete().in("id",ids);
    if(error)throw error;
    setSelMinutes([]);
    setMinDeleteConfirm(null);
    await loadMinHist();
    const audioMsg=audioPaths.length>0?`（音声${audioPaths.length}件含む）`:"";
    sSt(`✓ ${ids.length}件削除しました${audioMsg}`);
  }catch(e){
    console.error("[executeMinDelete] error:",e);
    sSt("⚠️ 削除に失敗: "+e.message);
  }finally{
    setMinDeleting(false);
  }
};
// カウンセリング分析一括削除
const deleteCsSelected=async()=>{
  const ids=Array.from(csSelectedIds);
  if(ids.length===0){sSt("⚠️ 削除する記録を選択してください");return}
  if(!window.confirm(`選択した ${ids.length} 件のカウンセリング分析を削除しますか？\n（この操作は取り消せません）`))return;
  try{
    const{error}=await supabase.from("counseling_analyses").delete().in("id",ids);
    if(error)throw error;
    setCsHistory(prev=>prev.filter(r=>!csSelectedIds.has(r.id)));
    setCsSelectedIds(new Set());
    setCsSelectMode(false);
    sSt(`✓ ${ids.length} 件を削除しました`);
  }catch(e){console.error("[deleteCsSelected] error:",e);sSt("⚠️ 削除に失敗: "+e.message)}
};
// ジャーニーマップ一括削除
const deleteJourneySelected=async()=>{
  const ids=Array.from(journeySelectedIds);
  if(ids.length===0){sSt("⚠️ 削除する記録を選択してください");return}
  if(!window.confirm(`選択した ${ids.length} 件のジャーニーマップを削除しますか？\n（この操作は取り消せません）`))return;
  try{
    const{error}=await supabase.from("counseling_analyses").delete().in("id",ids);
    if(error)throw error;
    setJourneyHistList(prev=>prev.filter(r=>!journeySelectedIds.has(r.id)));
    setJourneySelectedIds(new Set());
    setJourneySelectMode(false);
    sSt(`✓ ${ids.length} 件を削除しました`);
  }catch(e){console.error("[deleteJourneySelected] error:",e);sSt("⚠️ 削除に失敗: "+e.message)}
};
// セミナー学習一括削除
const deleteSmnSelected=async()=>{
  const ids=Array.from(smnSelectedIds);
  if(ids.length===0){sSt("⚠️ 削除する記録を選択してください");return}
  if(!window.confirm(`選択した ${ids.length} 件のセミナー学習を削除しますか？\n（この操作は取り消せません）`))return;
  try{
    const{error}=await supabase.from("counseling_analyses").delete().in("id",ids);
    if(error)throw error;
    setSmnHistList(prev=>prev.filter(r=>!smnSelectedIds.has(r.id)));
    setSmnSelectedIds(new Set());
    setSmnSelectMode(false);
    sSt(`✓ ${ids.length} 件を削除しました`);
  }catch(e){console.error("[deleteSmnSelected] error:",e);sSt("⚠️ 削除に失敗: "+e.message)}
};
// 診察記録一括削除（既存 selectedHistIds を流用）
const deleteRecSelected=async()=>{
  const ids=Array.from(selectedHistIds);
  if(ids.length===0){sSt("⚠️ 削除する診察記録を選択してください");return}
  if(!window.confirm(`選択した ${ids.length} 件の診察記録を削除しますか？\n\n※ 書き起こし・要約・関連情報が削除されます。\n※ 録音音声ファイル本体は録音音声管理から別途削除してください。\n（この操作は取り消せません）`))return;
  try{
    const{error}=await supabase.from("records").delete().in("id",ids);
    if(error)throw error;
    setSelectedHistIds(new Set());
    await loadHist();
    sSt(`✓ ${ids.length} 件を削除しました`);
  }catch(e){console.error("[deleteRecSelected] error:",e);sSt("⚠️ 削除に失敗: "+e.message)}
};
// 長文（書き起こし全文等）をワンクリックコピー。HTTPS環境はnavigator.clipboard、ローカルHTTPはtextareaフォールバック
const copyTextToClipboard=async(text,label="テキスト")=>{
  if(!text||text.length===0){sSt(`⚠️ コピーする${label}がありません`);return}
  try{
    await navigator.clipboard.writeText(text);
    sSt(`✓ ${label}をコピーしました（${text.length.toLocaleString()}文字）`);
  }catch(e){
    console.error("[copyText] error:",e);
    try{
      const ta=document.createElement("textarea");
      ta.value=text;ta.style.position="fixed";ta.style.top="-9999px";
      document.body.appendChild(ta);ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      sSt(`✓ ${label}をコピーしました（${text.length.toLocaleString()}文字）`);
    }catch(e2){console.error("[copyText] fallback error:",e2);sSt("⚠️ コピーに失敗しました")}
  }
};

// PiP
const openPip=useCallback(async()=>{try{if(!("documentPictureInPicture" in window)){sSt("Chrome 116以降で利用可能です");return}
const pw=await window.documentPictureInPicture.requestWindow({width:270,height:175});
const rm=R.find(r=>r.id===rid);const rmName=rm?`${rm.i}${rm.l}`:"";
pw.document.body.style.margin="0";pw.document.body.style.overflow="hidden";
const pipTheme=localStorage.getItem('mk_theme')||'pearl';
const pipBgMap={'pearl':'linear-gradient(135deg,#e8f8e0,#d8f4a8)','ultra-cream':'#fffefc','soft-linen':'#fefdf8','morning-cream':'#fffefc'};
const pipTextMap={'pearl':'#2a5018','ultra-cream':'#6a6050','soft-linen':'#584840','morning-cream':'#3a6828'};
const pipBorderMap={'pearl':'rgba(160,220,100,0.4)','ultra-cream':'#ece4d4','soft-linen':'#e8dece','morning-cream':'#d8ecd0'};
const currentRC=ROOM_COLORS[rid];
const pipBg=currentRC?currentRC.bg:(pipBgMap[pipTheme]||pipBgMap['pearl']);
const pipText=currentRC?currentRC.text:(pipTextMap[pipTheme]||pipTextMap['pearl']);
const pipBorder=currentRC?currentRC.border:(pipBorderMap[pipTheme]||pipBorderMap['pearl']);
pw.document.body.innerHTML=`<div style="font-family:sans-serif;background:${pipBg};color:${pipText};padding:5px 8px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:2px;border:1px solid ${pipBorder}">
<div style="display:flex;align-items:center;gap:4px"><span style="font-size:9px;opacity:.5">${rmName}</span>
<input id="pip-pid" placeholder="患者ID" value="" style="flex:1;padding:1px 5px;border-radius:4px;border:1px solid ${pipBorder};font-size:9px;background:rgba(255,255,255,0.6);color:${pipText};outline:none"/>
<span id="pip-status" style="font-size:9px;font-weight:600;color:${pipText}88">停止</span></div>
<div style="display:flex;align-items:center;gap:6px"><div id="pip-timer" style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums">00:00</div>
<div style="flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden"><div id="pip-level" style="width:0%;height:100%;background:#22c55e;border-radius:2px;transition:width 0.15s"></div></div></div>
<div id="pip-transcript" style="height:18px;overflow:hidden;border-radius:4px;background:rgba(0,0,0,.06);padding:1px 6px;font-size:9px;color:${pipText};white-space:nowrap;text-overflow:ellipsis"></div>
<div id="pip-tpl" style="display:flex;gap:3px;justify-content:center;margin-bottom:2px">
<button id="pip-tpl-soap" style="padding:2px 8px;border-radius:6px;border:1px solid ${pipBorder};background:rgba(255,255,255,0.5);color:${pipText};font-size:9px;font-weight:600;cursor:pointer">詳細</button>
<button id="pip-tpl-std" style="padding:2px 8px;border-radius:6px;border:2px solid ${pipText};background:rgba(255,255,255,0.7);color:${pipText};font-size:9px;font-weight:700;cursor:pointer">標準</button>
<button id="pip-tpl-min" style="padding:2px 8px;border-radius:6px;border:1px solid ${pipBorder};background:rgba(255,255,255,0.5);color:${pipText};font-size:9px;font-weight:600;cursor:pointer">簡潔</button>
</div>
<div style="display:flex;gap:4px;justify-content:center">
<button id="pip-rec" style="padding:2px 14px;border-radius:8px;border:2px solid ${pipText};background:rgba(255,255,255,0.6);color:${pipText};font-size:13px;font-weight:700;cursor:pointer">開始</button>
<button id="pip-resume" style="padding:3px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(34,197,94,.3);color:#fff;font-size:10px;font-weight:700;cursor:pointer;display:none">▶再開</button>
<button id="pip-pause" style="padding:2px 10px;border-radius:8px;border:none;background:#fbbf24;color:#78350f;font-size:13px;font-weight:700;cursor:pointer;display:none">一時停止</button>
<button id="pip-sum" style="padding:2px 10px;border-radius:8px;border:none;background:${pipText};color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:none">要約</button>
<button id="pip-stop" style="padding:2px 10px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:none">停止</button>
<button id="pip-next" style="padding:2px 12px;border-radius:8px;border:2px solid ${pipText};background:rgba(255,255,255,0.6);color:${pipText};font-size:12px;font-weight:700;cursor:pointer">次へ▶</button></div>
<div id="pip-shortcuts" style="display:flex;gap:3px;flex-wrap:wrap;overflow:hidden;max-height:24px;margin-top:2px;padding-top:2px;border-top:1px solid ${pipBorder}"></div>
<div id="pip-snippets" style="display:flex;gap:4px;flex-wrap:wrap;overflow:hidden;max-height:28px;margin-top:4px;padding-top:4px;border-top:1px solid ${pipBorder}"></div></div>`;
pw.document.head.innerHTML=`<style>::placeholder{color:${pipText}88}</style>`;
const pipPiEl=pw.document.getElementById("pip-pid");if(pipPiEl){pipPiEl.value=pId;pipPiEl.addEventListener("input",e=>{sPId(e.target.value)})}
const pipBtnUpdate=()=>{const d=pipRef.current;if(!d)return;const r=rsRef.current;const rb=d.getElementById("pip-rec"),pb=d.getElementById("pip-pause"),sb=d.getElementById("pip-stop"),smb=d.getElementById("pip-sum");if(!rb)return;rb.style.display=r==="inactive"?"inline-block":"none";pb.style.display=r!=="inactive"?"inline-block":"none";if(r==="recording"){pb.textContent="一時停止";pb.style.background="#fbbf24";pb.style.color="#78350f";pb.style.border="none"}else if(r==="paused"){pb.textContent="再開";pb.style.background="#d8f4a8";pb.style.color="#2a5018";pb.style.border="2px solid #2a5018"}sb.style.display=r!=="inactive"?"inline-block":"none";smb.style.display=r!=="inactive"?"inline-block":"none";const resumeBtn=d.getElementById("pip-resume");if(resumeBtn){if(r==="recording"){resumeBtn.style.display="none"}else if(iR.current&&iR.current.trim()){resumeBtn.style.display="inline-block"}else{resumeBtn.style.display="none"}}};
pipBtnUpdateRef.current=pipBtnUpdate;
const pipTplUpdate=()=>{const d2=pipRef.current;if(!d2)return;const soapB=d2.getElementById("pip-tpl-soap");const stdB=d2.getElementById("pip-tpl-std");const minB=d2.getElementById("pip-tpl-min");if(!soapB||!stdB||!minB)return;const cur=tidRef.current;[{btn:soapB,id:"soap"},{btn:stdB,id:"soap-std"},{btn:minB,id:"soap-min"}].forEach(({btn,id})=>{if(cur===id){btn.style.border=`2px solid ${pipText}`;btn.style.background="rgba(255,255,255,0.8)";btn.style.fontWeight="700";btn.style.color=pipText}else{btn.style.border=`1px solid ${pipBorder}`;btn.style.background="rgba(255,255,255,0.5)";btn.style.fontWeight="600";btn.style.color=pipText}})};
pw.document.getElementById("pip-tpl-soap").onclick=()=>{sTid("soap");setTimeout(pipTplUpdate,100)};
pw.document.getElementById("pip-tpl-std").onclick=()=>{sTid("soap-std");setTimeout(pipTplUpdate,100)};
pw.document.getElementById("pip-tpl-min").onclick=()=>{sTid("soap-min");setTimeout(pipTplUpdate,100)};
pipTplUpdate();
pw.document.getElementById("pip-rec").onclick=()=>{if(iR.current&&iR.current.trim()){const d=pipRef.current;if(d){try{const old=d.getElementById("pip-alert");if(old)old.remove()}catch{}const div=d.createElement("div");div.id="pip-alert";div.style.cssText="position:fixed;top:6px;left:50%;transform:translateX(-50%);width:90%;background:#f59e0b;color:#fff;padding:8px 12px;border-radius:10px;font-size:12px;font-weight:700;z-index:9999;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)";div.textContent="⚠️ 前のカルテが残っています → 次へで消去";d.body.appendChild(div)}return}go();setTimeout(pipBtnUpdate,500)};
pw.document.getElementById("pip-pause").onclick=()=>{if(rsRef.current==="recording"){pause()}else{resume()}setTimeout(pipBtnUpdate,300)};
pw.document.getElementById("pip-resume").onclick=()=>{go();setTimeout(pipBtnUpdate,500)};
pw.document.getElementById("pip-stop").onclick=()=>{stop();setTimeout(pipBtnUpdate,300)};
pw.document.getElementById("pip-sum").onclick=()=>{const d=pipRef.current;if(!d)return;sumDoneRef.current=false;try{const old=d.getElementById("pip-alert");if(old)old.remove();const oldBar=d.getElementById("pip-progress");if(oldBar)oldBar.remove()}catch{};const bar=d.createElement("div");bar.id="pip-progress";bar.style.cssText="position:fixed;top:0;left:0;width:100%;height:5px;z-index:9999;background:#e7e5e4";const inner=d.createElement("div");inner.style.cssText="height:100%;width:5%;background:linear-gradient(90deg,#84cc16,#22c55e);border-radius:2px;transition:width 0.3s ease";bar.appendChild(inner);d.body.appendChild(bar);const loading=d.createElement("div");loading.id="pip-loading";loading.style.cssText="position:fixed;top:4px;right:4px;width:auto;max-width:60%;background:#f59e0b;color:#fff;padding:6px 10px;border-radius:10px;font-size:10px;font-weight:700;z-index:9999;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)";loading.textContent="⏳ 要約中...";d.body.appendChild(loading);stopSum();setTimeout(pipBtnUpdate,500);let pct=5;const progI=setInterval(()=>{if(sumDoneRef.current){pct=100;inner.style.width="100%";clearInterval(progI)}else if(pct<90){pct+=2;inner.style.width=pct+"%"}},300);const checkDone=setInterval(()=>{if(sumDoneRef.current){clearInterval(checkDone);clearInterval(progI);inner.style.width="100%";try{const ld=d.getElementById("pip-loading");if(ld)ld.remove()}catch{};setTimeout(()=>{try{bar.remove()}catch{};const outputText=oR.current||"";try{const old2=d.getElementById("pip-alert");if(old2)old2.remove()}catch{};try{const ta=document.createElement('textarea');ta.value=outputText;ta.style.cssText='position:fixed;left:-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta)}catch{try{navigator.clipboard.writeText(outputText)}catch{}}const alertDiv=d.createElement("div");alertDiv.id="pip-alert";alertDiv.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.85);color:#fff;z-index:9999;display:flex;flex-direction:column;padding:8px;box-sizing:border-box;overflow:hidden";const header=d.createElement("div");header.style.cssText="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-shrink:0";const title=d.createElement("div");title.style.cssText="font-size:11px;font-weight:700;color:#22c55e";title.textContent="✅ 要約完了";const closeBtn=d.createElement("button");closeBtn.style.cssText="padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:#fff;font-size:10px;font-weight:700;cursor:pointer";closeBtn.textContent="✕ 閉じる";closeBtn.onclick=()=>{alertDiv.remove()};header.appendChild(title);header.appendChild(closeBtn);alertDiv.appendChild(header);const content=d.createElement("div");content.style.cssText="flex:1;overflow-y:auto;font-size:10px;line-height:1.5;color:#e5e7eb;white-space:pre-wrap;word-break:break-word;background:rgba(255,255,255,.08);border-radius:6px;padding:6px;margin-bottom:4px";content.textContent=outputText||"（要約なし）";alertDiv.appendChild(content);const btnRow=d.createElement("div");btnRow.style.cssText="display:flex;gap:4px;flex-shrink:0";const copyBtn2=d.createElement("button");copyBtn2.style.cssText="flex:1;padding:4px;border-radius:6px;border:none;background:#22c55e;color:#fff;font-size:10px;font-weight:700;cursor:pointer";copyBtn2.textContent="📋 コピー";copyBtn2.onclick=()=>{try{const ta=document.createElement('textarea');ta.value=outputText;ta.style.cssText='position:fixed;left:-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);copyBtn2.textContent='✅ コピー済み';copyBtn2.style.background='#16a34a'}catch{try{navigator.clipboard.writeText(outputText)}catch{}}};btnRow.appendChild(copyBtn2);const nextBtn2=d.createElement("button");nextBtn2.style.cssText="flex:1;padding:4px;border-radius:6px;border:2px solid #fff;background:rgba(255,255,255,.15);color:#fff;font-size:10px;font-weight:700;cursor:pointer";nextBtn2.textContent="次へ ▶";nextBtn2.onclick=()=>{alertDiv.remove();const nb=d.getElementById('pip-next');if(nb)nb.click()};btnRow.appendChild(nextBtn2);alertDiv.appendChild(btnRow);d.body.appendChild(alertDiv)},1000)}},500)};
pw.document.getElementById("pip-next").onclick=()=>{clr();const d=pipRef.current;if(d){const pi=d.getElementById("pip-pid");if(pi)pi.value="";try{const al=d.getElementById("pip-alert");if(al)al.remove()}catch{};try{const pb=d.getElementById("pip-progress");if(pb)pb.remove()}catch{}}setTimeout(pipBtnUpdate,300)};
const renderPipSnippets=()=>{const d=pipRef.current;if(!d)return;const c=d.getElementById("pip-snippets");if(!c)return;const sn=snippetsRef.current;const ids=pipSnippetsRef.current;let html="";ids.forEach(idx=>{if(idx<sn.length){html+=`<button data-sn-idx="${idx}" style="padding:1px 6px;border-radius:5px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;font-size:9px;font-weight:600;cursor:pointer">${sn[idx].title}</button>`}});c.innerHTML=html;c.querySelectorAll("button").forEach(b=>{b.onclick=()=>{const idx=parseInt(b.getAttribute("data-sn-idx"));const t=snippetsRef.current[idx];if(t){sOut(o=>o+(o?"\n":"")+t.text);navigator.clipboard.writeText(t.text).catch(()=>{})}}})};
renderPipSnippets();
const renderPipShortcuts=()=>{const d=pipRef.current;if(!d)return;const c=d.getElementById("pip-shortcuts");if(!c)return;
const topSCs=shortcuts.filter(s=>s.showOnTop&&s.enabled);
let html="";topSCs.forEach(sc=>{html+=`<button data-sc-id="${sc.id}" style="padding:1px 5px;border-radius:4px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#a0c96a;font-size:8px;font-weight:600;cursor:pointer" title="${sc.label}">${sc.label.replace(/^[^\s]+\s/,"")} <span style="background:rgba(255,255,255,.2);padding:0 3px;border-radius:3px;font-size:7px">${sc.key}</span></button>`});
c.innerHTML=html;
c.querySelectorAll("button").forEach(b=>{b.onclick=()=>{const id=b.getAttribute("data-sc-id");
const actions={rec:()=>{if(rsRef.current==="recording"){stop()}else{go()}},sum:()=>{stopSum()},clear:()=>{saveUndo();sInp("");sOut("");sSt("クリアしました")},next:()=>{clr();const d2=pipRef.current;if(d2){const pi=d2.getElementById("pip-pid");if(pi)pi.value=""}},copy:()=>{if(iR.current)navigator.clipboard.writeText(iR.current)},pip:()=>{closePip()},doc:()=>setPage("doc"),counsel:()=>setPage("counsel"),undo:()=>undo(),room1:()=>sRid("r1"),room2:()=>sRid("r2"),room3:()=>sRid("r3"),room4:()=>sRid("r4"),room5:()=>sRid("r5"),room6:()=>sRid("r6"),room7:()=>sRid("r7")};
const fn=actions[id];if(fn)fn();
}})};
renderPipShortcuts();
pw.document.addEventListener("keydown",(e)=>{const scs=shortcutsRef.current;const sc=scs.find(s=>{if(!s.enabled)return false;const parts=s.key.split("+");const mainKey=parts[parts.length-1];const needCtrl=parts.includes("Ctrl")||parts.includes("Cmd");const needShift=parts.includes("Shift");const needAlt=parts.includes("Alt");let keyMatch=false;if(mainKey.startsWith("F")&&/^F\d+$/.test(mainKey)){keyMatch=e.key===mainKey}else if(mainKey==="ArrowUp"||mainKey==="ArrowDown"||mainKey==="ArrowLeft"||mainKey==="ArrowRight"||mainKey==="Enter"||mainKey==="Space"||mainKey===" "||mainKey==="Escape"||mainKey==="Tab"||mainKey==="Backspace"||mainKey==="Delete"){keyMatch=e.key===mainKey||(mainKey==="Space"&&e.key===" ")}else{keyMatch=e.key===mainKey||e.key.toUpperCase()===mainKey.toUpperCase()}return keyMatch&&(e.ctrlKey||e.metaKey)===needCtrl&&e.shiftKey===needShift&&e.altKey===needAlt});if(!sc)return;e.preventDefault();const actions={rec:()=>{if(rsRef.current==="recording"){stop()}else{go()}},sum:()=>{stopSum()},clear:()=>{saveUndo();sInp("");sOut("");sSt("クリアしました")},next:()=>{clr();const d2=pipRef.current;if(d2){const pi=d2.getElementById("pip-pid");if(pi)pi.value="";try{const al=d2.getElementById("pip-alert");if(al)al.remove()}catch{};try{const pb=d2.getElementById("pip-progress");if(pb)pb.remove()}catch{};try{const ld=d2.getElementById("pip-loading");if(ld)ld.remove()}catch{}}},copy:()=>{const text=oR.current||iR.current||"";if(text){const ta=document.createElement("textarea");ta.value=text;ta.style.cssText="position:fixed;left:-9999px";document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta)}},pip:()=>{closePip()},undo:()=>undo(),room1:()=>sRid("r1"),room2:()=>sRid("r2"),room3:()=>sRid("r3"),room4:()=>sRid("r4"),room5:()=>sRid("r5"),room6:()=>sRid("r6"),room7:()=>sRid("r7")};const fn=actions[sc.id];if(fn){fn();setTimeout(pipBtnUpdate,300)}});
pipRef.current=pw.document;setPipWin(pw);setPipActive(true);
const btnLoop=setInterval(()=>{if(!pipRef.current){clearInterval(btnLoop);return}pipBtnUpdate()},600);
pw.addEventListener("pagehide",()=>{clearInterval(btnLoop);pipRef.current=null;pipBtnUpdateRef.current=()=>{};setPipWin(null);setPipActive(false)});
}catch(e){console.error("PiP error:",e);sSt("小窓を開けませんでした")}
},[rid,pId,pipSnippets,snippets,shortcuts]);
const closePip=useCallback(()=>{try{if(window.documentPictureInPicture&&window.documentPictureInPicture.window){window.documentPictureInPicture.window.close()}}catch(e){console.error("closePip:",e)}pipRef.current=null;pipBtnUpdateRef.current=()=>{};setPipWin(null);setPipActive(false)},[]);
startRef.current=go;stopRef.current=stop;sumRef.current=sum;clrRef.current=clr;undoFnRef.current=undo;pipFnRef.current=pipActive?closePip:openPip;

// Helpers
const fmD=(d)=>{const dt=new Date(d);return `${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2,"0")}`};
const tn=(id)=>{const t=T.find(x=>x.id===id);return t?t.name:id};
const rn=(id)=>{const r=R.find(x=>x.id===id);return r?`${r.i}${r.l}`:id};

const titleRow=()=>(<div style={{display:"flex",alignItems:"center",gap:8}}>{logoUrl&&<img src={logoUrl} alt="logo" style={{width:logoSize,height:logoSize,borderRadius:8,objectFit:"contain"}}/>}<span style={{fontWeight:700,fontSize:15,color:C.w}}>南草津皮フ科AIカルテ要約</span></div>);

const noiseModalEl=noiseModal&&noiseCandidates.length>0&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setNoiseModal(false)}><div style={{background:"#fff",borderRadius:16,padding:20,maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:15,fontWeight:700,color:"#dc2626"}}>🚫 ノイズ候補（{noiseCandidates.length}件）</div><button onClick={()=>setNoiseModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button></div><p style={{fontSize:12,color:C.g500,marginBottom:12}}>AIが検出したノイズ候補です。登録するとこのフレーズを含む行が書き起こしから自動除去されます。</p>{noiseCandidates.map((c,i)=>(<div key={i} style={{marginBottom:10,padding:12,borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50}}><div style={{fontSize:13,fontWeight:600,color:"#dc2626",marginBottom:4}}>🚫 {c.text}</div><div style={{fontSize:11,color:C.g500,marginBottom:8}}>💡 {c.reason}</div><button onClick={()=>{addNoisePattern(c.text);setNoiseCandidates(prev=>prev.filter((_,j)=>j!==i));if(noiseCandidates.length<=1)setNoiseModal(false)}} style={{padding:"4px 14px",borderRadius:8,border:"none",background:"#dc2626",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>✓ 登録する</button></div>))}<div style={{marginTop:12,display:"flex",gap:8}}><button onClick={()=>{noiseCandidates.forEach(c=>addNoisePattern(c.text));setNoiseModal(false);setNoiseCandidates([])}} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:C.p,color:C.w,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>✓ すべて登録（{noiseCandidates.length}件）</button><button onClick={()=>{setNoiseModal(false);setNoiseCandidates([])}} style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50,fontSize:13,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>スキップ</button></div></div></div>;
const typoModalEl=typoModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setTypoModal(null)}><div style={{background:"#ffffff",borderRadius:16,padding:20,maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:15,fontWeight:700,color:C.pDD}}>🔬 AI誤字スキャン結果（{typoModal.length}件）</div><button onClick={()=>setTypoModal(null)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button></div>{typoModal.map((c,i)=>(<div key={i} style={{marginBottom:14,padding:14,borderRadius:12,border:`1.5px solid ${typoSelections[i]!==undefined?C.p+"66":C.g200}`,background:typoSelections[i]!==undefined?"#f7fee7":C.g50}}><div style={{fontSize:13,fontWeight:600,color:"#dc2626",marginBottom:8}}>（誤）{c.from}</div><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:typoSelections[i]!==undefined?8:0}}>{c.candidates.map((cand,j)=>(<button key={j} onClick={()=>{setTypoSelections(prev=>({...prev,[i]:prev[i]===j?undefined:j}));setTypoCustomInputs(prev=>{const n={...prev};delete n[i];return n})}} style={{padding:"6px 14px",borderRadius:10,border:typoSelections[i]===j?`2px solid ${C.rG}`:`1.5px solid ${C.g300}`,background:typoSelections[i]===j?"#dcfce7":C.w,fontSize:13,fontWeight:typoSelections[i]===j?700:500,color:typoSelections[i]===j?"#166534":C.g700,fontFamily:"inherit",cursor:"pointer",transition:"all 0.15s"}}>{cand.to}</button>))}</div><div style={{display:"flex",alignItems:"center",gap:6,marginTop:6}}><span style={{fontSize:11,color:C.g500,whiteSpace:"nowrap"}}>その他：</span><input type="text" value={typoCustomInputs[i]||""} onChange={e=>{const v=e.target.value;setTypoCustomInputs(prev=>({...prev,[i]:v}));if(v)setTypoSelections(prev=>{const n={...prev};delete n[i];return n})}} placeholder="自由に入力..." style={{flex:1,padding:"4px 8px",borderRadius:8,border:`1.5px solid ${typoCustomInputs[i]?.trim()?C.p+"66":C.g300}`,background:typoCustomInputs[i]?.trim()?"#f7fee7":C.w,fontSize:12,fontFamily:"inherit",outline:"none"}}/></div>{typoSelections[i]!==undefined&&c.candidates[typoSelections[i]]&&<div style={{fontSize:11,color:C.g500,marginTop:6,marginBottom:2,paddingLeft:4}}>💡 {c.candidates[typoSelections[i]].reason}</div>}{(typoSelections[i]!==undefined||typoCustomInputs[i]?.trim())&&<button onClick={()=>{const cc=typoModal[i];const toVal=typoCustomInputs[i]?.trim()||(typoSelections[i]!==undefined&&cc.candidates[typoSelections[i]]?cc.candidates[typoSelections[i]].to:null);if(toVal){dictAddEntry(cc.from,toVal)}setTypoModal(prev=>{if(!prev)return null;const n=[...prev];n.splice(i,1);if(!n.length)return null;return n});setTypoSelections(prev=>{const ns={};Object.keys(prev).forEach(k=>{const ki=Number(k);if(ki<i)ns[ki]=prev[ki];else if(ki>i)ns[ki-1]=prev[ki]});return ns});setTypoCustomInputs(prev=>{const ns={};Object.keys(prev).forEach(k=>{const ki=Number(k);if(ki<i)ns[ki]=prev[ki];else if(ki>i)ns[ki-1]=prev[ki]});return ns});sSt("✓ 辞書に追加しました")}} style={{padding:"4px 14px",borderRadius:8,border:"none",background:C.rG,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",marginTop:6}}>✓ これで登録</button>}</div>))}{typoModal.length>1&&<div style={{marginTop:10,display:"flex",gap:8}}><button onClick={applyAllTypos} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:C.p,color:C.w,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>✓ 選択済みをすべて登録（{typoModal.filter((_,i)=>typoSelections[i]!==undefined||typoCustomInputs[i]?.trim()).length}/{typoModal.length}件）</button><button onClick={()=>setTypoModal(null)} style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50,fontSize:13,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>閉じる</button></div>}</div></div>;
// === SHORTCUTS PAGE ===
if(page==="shortcuts")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:mob?16:18,fontWeight:700,color:"#2a5018",margin:0}}>⌨️ ショートカット一覧</h2><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<p style={{fontSize:mob?12:13,color:C.g500,marginBottom:16}}>キーボードショートカットで素早く操作できます。⭐マークのショートカットはトップ画面に表示されます。</p>
<div style={{display:"flex",flexDirection:"column",gap:6}}>
{shortcuts.map((sc,i)=>(<div key={sc.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:10,background:sc.enabled?C.g50:"#fafafa",border:`1px solid ${sc.enabled?C.g200:"#eee"}`,opacity:sc.enabled?1:0.5,marginBottom:4}}>
<button onClick={()=>{const u=[...shortcuts];u[i]={...u[i],showOnTop:!u[i].showOnTop};setShortcuts(u)}} style={{padding:"2px 5px",borderRadius:5,border:sc.showOnTop?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:sc.showOnTop?C.pLL:C.w,fontSize:10,color:sc.showOnTop?C.pD:C.g400,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>{sc.showOnTop?"⭐":"☆"}</button>
<span style={{fontSize:12,fontWeight:600,color:C.pDD,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sc.label}</span>
<input value={sc.key} onChange={e=>{const u=[...shortcuts];u[i]={...u[i],key:e.target.value};setShortcuts(u)}} onKeyDown={e=>{if(["Tab","Shift","Control","Alt","Meta"].includes(e.key))return;e.preventDefault();e.stopPropagation();let k="";if(e.ctrlKey||e.metaKey)k+="Ctrl+";if(e.shiftKey)k+="Shift+";if(e.altKey)k+="Alt+";if(e.key==="ArrowUp")k+="ArrowUp";else if(e.key==="ArrowDown")k+="ArrowDown";else if(e.key==="ArrowLeft")k+="ArrowLeft";else if(e.key==="ArrowRight")k+="ArrowRight";else if(e.key===" ")k+="Space";else if(e.key.startsWith("F")&&/^F\d+$/.test(e.key))k+=e.key;else k+=e.key.toUpperCase();const u=[...shortcuts];u[i]={...u[i],key:k};setShortcuts(u)}} style={{width:100,padding:"3px 6px",borderRadius:6,border:`1.5px solid ${C.p}`,background:C.w,fontSize:11,fontWeight:700,color:C.pD,fontFamily:"inherit",textAlign:"center",cursor:"pointer",flexShrink:0}} title="クリックしてキーを押すと変更" placeholder="キーを押す"/>
<button onClick={()=>{const u=[...shortcuts];u[i]={...u[i],enabled:!u[i].enabled};setShortcuts(u)}} style={{padding:"3px 8px",borderRadius:6,border:"none",background:sc.enabled?C.rG:C.g200,color:sc.enabled?C.w:C.g500,fontSize:10,fontWeight:700,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>{sc.enabled?"ON":"OFF"}</button>
</div>))}
</div>
<div style={{marginTop:16,padding:12,borderRadius:10,background:C.pLL,border:`1px solid ${C.p}33`}}>
<div style={{fontSize:12,fontWeight:700,color:C.pD,marginBottom:6}}>💡 ヒント</div>
<div style={{fontSize:12,color:C.g500,lineHeight:1.8}}>
・⭐をクリックするとトップ画面にショートカットバーが表示されます<br/>
・ON/OFFでショートカットの有効/無効を切り替えられます<br/>
・設定画面でキーの割り当てを変更できます<br/>
・小窓（PiP）にも⭐のショートカットが表示されます<br/>
・<kbd style={{padding:"1px 5px",borderRadius:4,border:"1px solid #d1d5db",background:"#fff",fontSize:11}}>Escape</kbd> キーでモーダル・ページを閉じます（固定・変更不可）
</div>
</div>
</div></div>);

// === ROOM SELECT ===
// === HELP PAGE ===
if(page==="help")return(<div style={{maxWidth:800,margin:"0 auto",padding:mob?"12px 8px":"24px 16px",fontFamily:"inherit"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
<h2 style={{fontSize:20,fontWeight:800,color:C.pDD,margin:0}}>📖 使い方ガイド</h2>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
</div>

{/* イントロ */}
<div style={{padding:16,borderRadius:14,background:`linear-gradient(135deg,${C.pLL},#f0fdf4)`,border:`2px solid ${C.pL}`,marginBottom:16}}>
<p style={{fontSize:14,color:C.pDD,margin:0,lineHeight:1.7}}>
<strong>南草津皮フ科 AIアシスタント</strong>は、診察録音・カルテ要約をはじめ、議事録・タスク管理・ロールプレイ研修・カウンセリング分析など、クリニック運営を幅広くサポートするAIアプリです。<br/>
<span style={{fontSize:12,color:C.g500}}>Gemini 3.5 Flash / Pro + OpenAI Whisper で動作しています。</span>
</p>
</div>

{/* 基本の流れ */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>🎯 基本の使い方（3ステップ）</h3>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr",gap:10}}>
<div style={{padding:14,borderRadius:12,border:`2px solid ${C.p}`,background:"#fff",textAlign:"center"}}>
<div style={{fontSize:32,marginBottom:6}}>🎙️</div>
<div style={{fontSize:13,fontWeight:700,color:C.pDD,marginBottom:4}}>① 録音開始</div>
<div style={{fontSize:12,color:C.g600,lineHeight:1.5}}>録音ボタンを押すか<br/><kbd style={{padding:"1px 6px",borderRadius:4,border:"1px solid #d1d5db",background:"#f3f4f6",fontSize:11}}>F1</kbd> キーを押す<br/>会話がリアルタイムで書き起こされます</div>
</div>
<div style={{padding:14,borderRadius:12,border:`2px solid ${C.p}`,background:"#fff",textAlign:"center"}}>
<div style={{fontSize:32,marginBottom:6}}>⚡</div>
<div style={{fontSize:13,fontWeight:700,color:C.pDD,marginBottom:4}}>② 要約</div>
<div style={{fontSize:12,color:C.g600,lineHeight:1.5}}>要約ボタンか<br/><kbd style={{padding:"1px 6px",borderRadius:4,border:"1px solid #d1d5db",background:"#f3f4f6",fontSize:11}}>F2</kbd> キーを押す<br/>AIがカルテ形式に要約します</div>
</div>
<div style={{padding:14,borderRadius:12,border:`2px solid ${C.p}`,background:"#fff",textAlign:"center"}}>
<div style={{fontSize:32,marginBottom:6}}>📋</div>
<div style={{fontSize:13,fontWeight:700,color:C.pDD,marginBottom:4}}>③ コピー＆次へ</div>
<div style={{fontSize:12,color:C.g600,lineHeight:1.5}}>要約は自動コピーされます<br/>「次へ」で次の患者へ<br/>電カルにペーストするだけ</div>
</div>
</div>
</div>

{/* テンプレート */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>📋 テンプレート一覧</h3>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:8}}>
{[
{icon:"📋",name:"詳細",desc:"フル情報のカルテ要約。SOAP形式で詳細に記載。複数疾患も自動分離"},
{icon:"📋",name:"標準",desc:"要点のみの簡潔なカルテ要約。冗長な表現を避けたシンプルな記載"},
{icon:"📋",name:"簡潔",desc:"最小限の記載。忙しい時や軽症例に最適"},
{icon:"✨",name:"美容",desc:"美容施術の記録。施術名・部位・パラメータ・効果・ダウンタイムを記載"},
{icon:"🔧",name:"処置",desc:"処置記録。麻酔・処置内容・検体提出・術後指示を時系列で整理"},
{icon:"🔄",name:"経過",desc:"経過観察。前回比較・治療効果判定（改善/不変/悪化）を明確に"},
{icon:"📝",name:"フリー",desc:"自由形式。テンプレートに縛られず簡潔に要約"}
].map((t,i)=>(<div key={i} style={{padding:10,borderRadius:10,border:`1.5px solid ${C.g200}`,background:"#fff",display:"flex",gap:8,alignItems:"flex-start"}}>
<span style={{fontSize:20}}>{t.icon}</span>
<div><div style={{fontSize:13,fontWeight:700,color:C.pD}}>{t.name}</div>
<div style={{fontSize:11,color:C.g600,lineHeight:1.5}}>{t.desc}</div></div>
</div>))}
</div>
</div>

{/* 診察室タブ */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>🏥 診察室タブ（7室同時管理）</h3>
<div style={{padding:12,borderRadius:12,border:`1.5px solid ${C.g200}`,background:"#fff",fontSize:12,color:C.g700,lineHeight:1.8}}>
診察室1〜3・施術室1〜3・カウンセリング室の計7タブを同時に管理できます。<br/>
タブを切り替えるだけで各室の書き起こし・要約が独立して保持されます。<br/>
<span style={{color:C.pD,fontWeight:600}}>💡 Ctrl+1〜7 のショートカットで素早く切り替えられます。</span>
</div>
</div>

{/* AI誤字スキャン */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>🔍 AI誤字スキャン</h3>
<div style={{padding:12,borderRadius:12,border:`1.5px solid ${C.g200}`,background:"#fff",fontSize:12,color:C.g700,lineHeight:1.8}}>
書き起こし・要約テキストの医療用語誤字・変換ミスをAIが自動検出します。<br/>
辞書登録済みの単語は候補から除外されるため、毎回同じ誤字が出ることがありません。<br/>
<span style={{color:C.pD,fontWeight:600}}>💡 履歴画面から複数件まとめて一括スキャンも可能です。</span>
</div>
</div>

{/* キーボードショートカット */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>⌨️ キーボードショートカット</h3>
<div style={{padding:12,borderRadius:12,border:`1.5px solid ${C.g200}`,background:"#fff"}}>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
<tbody>
{[
["F1","録音開始 / 停止"],
["F2","要約実行"],
["F6","小窓（PiP）on/off"],
["Ctrl+1〜7","診察室の切り替え"],
["Escape","モーダル・ページを閉じる"],
["設定でカスタマイズ","キー割り当てを自由に変更可能"]
].map(([key,desc],i)=>(<tr key={i} style={{borderBottom:i<5?`1px solid ${C.g100}`:"none"}}>
<td style={{padding:"8px 10px",fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}><kbd style={{padding:"2px 8px",borderRadius:5,border:"1px solid #d1d5db",background:"#f9fafb",fontSize:11}}>{key}</kbd></td>
<td style={{padding:"8px 10px",color:C.g600}}>{desc}</td>
</tr>))}
</tbody>
</table>
</div>
</div>

{/* 小窓モード */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>⭐ 小窓（PiP）モード</h3>
<div style={{padding:14,borderRadius:12,border:`2px solid #fbbf24`,background:"#fffbeb"}}>
<p style={{fontSize:12,color:"#92400e",margin:"0 0 8px 0",lineHeight:1.6}}>
画面右上の <strong>⭐小窓</strong> ボタンまたは <kbd style={{padding:"1px 5px",borderRadius:4,border:"1px solid #d1d5db",background:"#fff",fontSize:11}}>F6</kbd> で起動。<br/>
電子カルテの上に小さなウィンドウが常に表示され、録音・要約・次の患者への切り替えがすべて小窓から操作できます。
</p>
<div style={{fontSize:11,color:"#78350f",lineHeight:1.6}}>
<strong>小窓でできること:</strong> 録音開始/停止、要約（自動コピー）、次の患者へ、スニペット追記、カスタムショートカット実行
</div>
</div>
</div>

{/* その他の機能 */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>🧩 その他の機能</h3>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:8}}>
{[
{icon:"📂",name:"履歴",desc:"過去の要約を一覧・検索。患者IDや日付でフィルタリング可能。一括保存・一括AI分析にも対応"},
{icon:"⭐",name:"お気に入り",desc:"カルテ要約をグループ別に保存。保険・美容・カウンセリング・治療説明など6グループで管理"},
{icon:"📝",name:"議事録まとめ",desc:"会議を録音→議事録を自動作成。複数議事録の統合・時系列分析・タスク自動抽出に対応"},
{icon:"✅",name:"タスク管理",desc:"議事録から自動抽出したタスクを四象限マトリクスで管理。AIによるTODO自動生成・Excelエクスポート付き"},
{icon:"🎭",name:"ロールプレイ",desc:"7カテゴリ・50以上のシナリオで接遇訓練。結果から患者向け資料・スタッフ指導スライドを即生成"},
{icon:"📱",name:"SNS投稿生成",desc:"クリニック向けのSNS投稿文をAI作成。Instagram・X・LINEに対応。季節テーマのワンタップ選択付き"},
{icon:"🧠",name:"カウンセリング分析",desc:"カウンセリング内容を5つのモードでAI分析。傾聴・ニーズ把握・マーケティング・年間計画作成に対応"},
{icon:"📚",name:"育成・知識",desc:"診療履歴をもとに院内マニュアル・対応パターン集・説明文ライブラリ・月次品質レポートを自動生成"},
{icon:"📊",name:"満足度分析",desc:"診療・カウンセリング記録から患者満足度をAIが分析。改善提案もあわせて出力"},
{icon:"📖",name:"症例ライブラリ",desc:"お気に入りを症例集として閲覧・検索。疾患名フリーテキスト検索・AIケーススタディ生成に対応"},
{icon:"📄",name:"説明資料作成",desc:"疾患名や施術名を入力するとAIが患者向け説明資料を自動生成。ロールプレイ結果からも生成可能"},
{icon:"⚙️",name:"設定",desc:"カラーテーマ・フォント・テンプレート・辞書・スニペット・ショートカットを自由にカスタマイズ"}
].map((t,i)=>(<div key={i} style={{padding:10,borderRadius:10,border:`1.5px solid ${C.g200}`,background:"#fff",display:"flex",gap:8,alignItems:"flex-start"}}>
<span style={{fontSize:18}}>{t.icon}</span>
<div><div style={{fontSize:13,fontWeight:700,color:C.pD}}>{t.name}</div>
<div style={{fontSize:11,color:C.g600,lineHeight:1.4}}>{t.desc}</div></div>
</div>))}
</div>
</div>

{/* おすすめワークフロー */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>🔄 おすすめワークフロー</h3>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr",gap:10}}>
{[
{icon:"🏥",title:"診察中",steps:["診察室タブを選択","録音開始 → 診察 → 停止","テンプレート選択 → 要約","AI誤字スキャンで確認","必要に応じてお気に入り保存"]},
{icon:"📝",title:"月次管理",steps:["育成・知識 → 月次品質レポート","満足度分析を実行","ミーティングを録音 → 議事録作成","タスク抽出 → 四象限マトリクスで管理","結果をスタッフと共有"]},
{icon:"🎓",title:"新人教育",steps:["ロールプレイ → シナリオを選択","結果からスタッフ指導資料を生成","Gensparkでスライド資料を作成","育成・知識 → 対応パターン集生成","症例ライブラリで事例学習"]}
].map((w,i)=>(<div key={i} style={{padding:12,borderRadius:12,border:`1.5px solid ${C.g200}`,background:"#fff"}}>
<div style={{fontSize:20,marginBottom:4}}>{w.icon}</div>
<div style={{fontSize:13,fontWeight:700,color:C.pDD,marginBottom:8}}>{w.title}</div>
{w.steps.map((s,j)=>(<div key={j} style={{fontSize:11,color:C.g600,lineHeight:1.7,display:"flex",gap:4}}>
<span style={{color:C.p,fontWeight:700,minWidth:14}}>{j+1}.</span><span>{s}</span>
</div>))}
</div>))}
</div>
</div>

{/* Tips */}
<div style={{padding:14,borderRadius:12,background:"#f0fdf4",border:`1.5px solid ${C.pL}`,marginBottom:20}}>
<h3 style={{fontSize:14,fontWeight:700,color:C.pDD,margin:"0 0 8px 0"}}>💡 活用のコツ</h3>
<div style={{fontSize:12,color:C.g700,lineHeight:1.9}}>
• マイクは患者と医師の間に置くと認識精度が上がります<br/>
• 診察室タブを使い分けると患者情報が混ざりません（Ctrl+1〜7で切り替え）<br/>
• 誤字スキャン後に辞書登録しておくと次回から自動修正されます<br/>
• お気に入りの「美容」グループを貯めると「メニュー説明文生成」が使えます<br/>
• ロールプレイ結果から「スタッフ指導資料作成」でGenspark用スライドを即生成できます<br/>
• カウンセリング分析は継続利用するほど過去データを参照して精度が上がります<br/>
• 設定で⭐マークをつけたショートカットはトップ画面と小窓に常時表示されます
</div>
</div>

<div style={{textAlign:"center",padding:"10px 0",fontSize:11,color:C.g400}}>
南草津皮フ科 AIアシスタント — Gemini 3.5 Flash / Pro + OpenAI Whisper
</div>
</div>);

// === ABOUT PAGE ===
if(page==="about")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>ℹ️ 機能紹介</h2><button onClick={()=>{setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<div style={{fontSize:14,color:C.g700,lineHeight:2}}>
<h3 style={{color:C.pD}}>🎙 リアルタイム音声書き起こし</h3><p>OpenAI Whisper APIによる高精度な日本語音声認識。5秒間隔で自動書き起こし。</p>
<h3 style={{color:C.pD}}>🤖 AI要約</h3><p>Gemini 3.5 Flashでカルテ形式に自動要約。複数疾患の自動分離にも対応。</p>
<h3 style={{color:C.pD}}>📋 6種類のテンプレート</h3><p>ASOP・疾患名・美容・処置・経過・フリー。複数疾患の自動分離にも対応。</p>
<h3 style={{color:C.pD}}>🗣 話者分離</h3><p>会話内容から医師と患者の発言を自動判別し、適切な項目に振り分けます。</p>
<h3 style={{color:C.pD}}>📖 誤字脱字修正辞書</h3><p>皮膚科の薬剤名・施術名・疾患名を事前登録。書き起こし時に自動修正。</p>
<h3 style={{color:C.pD}}>🌟 PiP小窓</h3><p>最前面固定の小窓で、電子カルテ操作中も録音・要約が可能。</p>
<h3 style={{color:C.pD}}>💾 クラウド履歴</h3><p>Supabaseによる自動保存。患者名・IDで検索可能。</p>
</div></div></div>);

// === HISTORY ===
if(page==="hist")return(<div style={{maxWidth:1200,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{tooltip.visible&&<div style={{position:"fixed",left:tooltip.x,top:tooltip.y,transform:"translate(-50%, -100%)",background:"rgba(42,58,32,0.92)",color:"#e8f5d8",padding:"4px 10px",borderRadius:8,fontSize:12,fontWeight:600,fontFamily:"'Zen Maru Gothic', sans-serif",pointerEvents:"none",zIndex:99999,whiteSpace:"nowrap",boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>{tooltip.text}</div>}
<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
<h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0,whiteSpace:"nowrap"}}>📂 履歴</h2>
<input value={search||""} onChange={e=>{const v=e.target.value;setSearch(v);if(!v.trim()){loadHist()}else if(v.trim().length>=2&&!v.trim().match(/^\d{1,2}\//)){clearTimeout(window._histSearchTimer);window._histSearchTimer=setTimeout(()=>searchHist(v),500)}}} placeholder="検索 例: アトピー / 3/9 / 3/9 11" style={{flex:1,minWidth:100,height:36,padding:"0 14px",borderRadius:8,border:`1.5px solid ${C.g200}`,fontSize:14,fontFamily:"inherit",boxSizing:"border-box"}}/>
<span style={{fontSize:12,color:C.g400,whiteSpace:"nowrap"}}>{filteredHist.length}件</span>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>setCalView("list")} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${calView==="list"?C.pD:C.g200}`,background:calView==="list"?C.pLL:"#fff",fontSize:11,fontWeight:600,color:calView==="list"?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>📋 リスト</button>
<button onClick={()=>setCalView("calendar")} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${calView==="calendar"?C.pD:C.g200}`,background:calView==="calendar"?C.pLL:"#fff",fontSize:11,fontWeight:600,color:calView==="calendar"?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>📅 カレンダー</button>
</div>
<button onClick={()=>{loadFavorites();setPage("favs")}} style={{height:36,padding:"0 14px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:14,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>⭐ お気に入り</button>
<button onClick={()=>setPage("main")} style={{...btn(C.p,C.pDD),height:36,padding:"0 14px",fontSize:14}}>✕ 閉じる</button>
</div>
<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
<button onClick={()=>setRoomFilter("all")} style={{padding:"2px 8px",borderRadius:6,border:`1px solid ${roomFilter==="all"?C.pD:C.g200}`,background:roomFilter==="all"?C.pLL:"#fff",fontSize:10,fontWeight:600,color:roomFilter==="all"?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>全て</button>
{R.map(rm=>{const rc=ROOM_COLORS[rm.id]||{bg:"#f3f4f6",text:"#6b7280",border:"#e5e7eb",accent:"#6b7280"};const isSel=roomFilter===rm.id;return(<button key={rm.id} onClick={()=>setRoomFilter(isSel?"all":rm.id)} style={{padding:"2px 8px",borderRadius:6,border:`1px solid ${isSel?rc.accent:rc.border}`,background:isSel?rc.bg:"#fff",fontSize:10,fontWeight:600,color:isSel?rc.text:"#6b7280",fontFamily:"inherit",cursor:"pointer"}}>{rm.i}{rm.l}</button>)})}
</div>
<button onClick={()=>{const ids=new Set(filteredHist.map(r=>r.id));setSelectedHistIds(ids)}} style={{padding:"3px 10px",borderRadius:7,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>すべて選択</button>
<button onClick={()=>setSelectedHistIds(new Set())} style={{padding:"3px 10px",borderRadius:7,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>選択解除</button>
<span style={{fontSize:11,color:C.pD,fontWeight:600}}>{selectedHistIds.size}件選択中</span>
<button onClick={runHistTypoCheck} disabled={!selectedHistIds.size||histTypoLd} title="選択した履歴のAI誤字スキャン" style={{padding:"3px 10px",borderRadius:7,border:`1px solid ${C.p}44`,background:!selectedHistIds.size||histTypoLd?"#e5e7eb":"#fffbeb",fontSize:11,fontWeight:600,color:!selectedHistIds.size||histTypoLd?C.g400:"#92400e",fontFamily:"inherit",cursor:!selectedHistIds.size||histTypoLd?"default":"pointer"}}>{histTypoLd?`🔬 スキャン中... (${selectedHistIds.size}件)`:"🔬 AI誤字スキャン"}</button>
<button onClick={runHistNoiseScan} disabled={!selectedHistIds.size||histNoiseLd} title="選択した履歴の書き起こしからノイズパターンを検出" style={{padding:"3px 10px",borderRadius:7,border:`1px solid #fca5a5`,background:!selectedHistIds.size||histNoiseLd?"#e5e7eb":"#fff1f2",fontSize:11,fontWeight:600,color:!selectedHistIds.size||histNoiseLd?C.g400:"#dc2626",fontFamily:"inherit",cursor:!selectedHistIds.size||histNoiseLd?"default":"pointer"}}>{histNoiseLd?`🚫 スキャン中... (${selectedHistIds.size}件)`:"🚫 ノイズスキャン"}</button>
<div style={{position:"relative"}}><button onClick={()=>setBulkMenu(v=>!v)} disabled={!selectedHistIds.size||bulkLd} title="選択した履歴を一括AI分析" style={{padding:"3px 10px",borderRadius:7,border:`1px solid ${C.p}44`,background:!selectedHistIds.size||bulkLd?"#e5e7eb":"#eff6ff",fontSize:11,fontWeight:600,color:!selectedHistIds.size||bulkLd?C.g400:"#2563eb",fontFamily:"inherit",cursor:!selectedHistIds.size||bulkLd?"default":"pointer"}}>{bulkLd?`⏳ 分析中... (${selectedHistIds.size}件)`:"📊 一括AI分析▼"}</button>
{bulkMenu&&selectedHistIds.size>0&&<div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:C.w,borderRadius:10,border:`1px solid ${C.g200}`,boxShadow:"0 4px 16px rgba(0,0,0,.15)",zIndex:100,minWidth:220,padding:4}}>
{BULK_MODES.map(m=><button key={m.id} onClick={()=>runBulkAnalyze(m.id)} style={{display:"block",width:"100%",padding:"8px 12px",borderRadius:7,border:"none",background:C.w,fontSize:12,fontWeight:600,color:C.g700,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.target.style.background="#eff6ff"} onMouseLeave={e=>e.target.style.background=C.w}>{m.label}</button>)}
</div>}
</div>
<button onClick={runTreatmentMaterial} disabled={!selectedHistIds.size||treatLd} title="選択した履歴から疾患別治療資料を生成" style={{padding:"3px 10px",borderRadius:7,border:`1px solid #a78bfa`,background:!selectedHistIds.size||treatLd?"#e5e7eb":"#f5f3ff",fontSize:11,fontWeight:600,color:!selectedHistIds.size||treatLd?C.g400:"#7c3aed",fontFamily:"inherit",cursor:!selectedHistIds.size||treatLd?"default":"pointer",whiteSpace:"nowrap"}}>{treatLd?"⏳ 生成中...":"📚 治療資料を生成"}</button>
<button onClick={runMonthlyReport} disabled={monthlyLd} style={{padding:"3px 10px",borderRadius:7,border:"1px solid #0369a1",background:"#e0f2fe",fontSize:11,fontWeight:600,color:"#0369a1",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>{monthlyLd?"⏳ 生成中...":"📊 月次レポート"}</button>
<button onClick={()=>setBulkFavModal(true)} disabled={!selectedHistIds.size} title="選択した履歴をお気に入りに一括登録" style={{padding:"3px 10px",borderRadius:7,border:`1px solid #f59e0b`,background:!selectedHistIds.size?"#e5e7eb":"#fffbeb",fontSize:11,fontWeight:600,color:!selectedHistIds.size?C.g400:"#92400e",fontFamily:"inherit",cursor:!selectedHistIds.size?"default":"pointer"}}>⭐ お気に入り一括登録</button>
<button onClick={deleteRecSelected} disabled={!selectedHistIds.size} title="選択した診察記録を一括削除（書き起こし・要約含む。音声本体は録音音声管理から別途削除）" style={{padding:"3px 10px",borderRadius:7,border:"none",background:!selectedHistIds.size?"#e5e7eb":"#dc2626",fontSize:11,fontWeight:700,color:!selectedHistIds.size?C.g400:C.w,fontFamily:"inherit",cursor:!selectedHistIds.size?"default":"pointer",whiteSpace:"nowrap"}}>🗑 選択を削除({selectedHistIds.size})</button>
</div>
{bulkFavModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setBulkFavModal(false)}>
<div style={{background:"#ffffff",borderRadius:14,padding:20,maxWidth:320,width:"100%"}} onClick={e=>e.stopPropagation()}>
<div style={{fontSize:14,fontWeight:700,color:"#92400e",marginBottom:12}}>⭐ {selectedHistIds.size}件を一括登録</div>
{FAV_GROUPS.map(g=><button key={g} onClick={()=>{bulkSaveFavorites(g);setBulkFavModal(false)}} style={{display:"block",width:"100%",padding:"10px 14px",marginBottom:6,borderRadius:10,border:`1.5px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>{g}</button>)}
<button onClick={()=>setBulkFavModal(false)} style={{width:"100%",padding:"8px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer",marginTop:4}}>キャンセル</button>
</div></div>}
{calView==="calendar"&&<div style={{marginBottom:12}}>
<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
<button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1)}else setCalMonth(m=>m-1)}} style={{padding:"2px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:"#fff",fontSize:13,cursor:"pointer"}}>◀</button>
<span style={{fontSize:14,fontWeight:700,color:C.pD,flex:1,textAlign:"center"}}>{calYear}年{calMonth+1}月</span>
<button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1)}else setCalMonth(m=>m+1)}} style={{padding:"2px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:"#fff",fontSize:13,cursor:"pointer"}}>▶</button>
</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
{["日","月","火","水","木","金","土"].map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:C.g400,padding:"2px 0"}}>{d}</div>)}
</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
{(()=>{
const firstDay=new Date(calYear,calMonth,1).getDay();
const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
const cells=[];
for(let i=0;i<firstDay;i++)cells.push(<div key={"e"+i}/>);
for(let d=1;d<=daysInMonth;d++){
const dateStr=new Date(calYear,calMonth,d).toLocaleDateString("ja-JP");
const dayRecords=hist.filter(r=>{
if(!r.created_at)return false;
return toJSTDate(r.created_at)===`${calYear}/${String(calMonth+1).padStart(2,"0")}/${String(d).padStart(2,"0")}`;
});
const count=dayRecords.length;
const isToday=new Date().toLocaleDateString("ja-JP")===dateStr;
cells.push(
<div key={d} onClick={()=>{if(count>0){setSearch(String(calMonth+1)+"/"+String(d))}}} style={{padding:"4px 2px",borderRadius:6,border:`1px solid ${isToday?C.pD:count>0?C.g200:"transparent"}`,background:isToday?C.pLL:count>0?"#f9fafb":"transparent",cursor:count>0?"pointer":"default",textAlign:"center",minHeight:36}}>
<div style={{fontSize:11,color:isToday?C.pD:C.g600,fontWeight:isToday?700:400}}>{d}</div>
{count>0&&<div style={{fontSize:10,fontWeight:700,color:C.pD}}>{count}件</div>}
</div>
);
}
return cells;
})()}
</div>
</div>}
{(()=>{const DAYS=["日","月","火","水","木","金","土"];const grouped={};filteredHist.forEach(r=>{const dk=r.created_at?toJSTDate(r.created_at):"不明";if(!grouped[dk])grouped[dk]=[];grouped[dk].push(r)});const dateKeys=Object.keys(grouped);if(!histDatesInitRef.current&&dateKeys.length>0){histDatesInitRef.current=true;setTimeout(()=>setOpenDates(new Set([dateKeys[0]])),0)}return dateKeys.map(dk=>{const recs=grouped[dk];const isOpen=openDates.has(dk);const d=recs[0]?.created_at?new Date(recs[0].created_at):null;const dayStr=d?DAYS[d.getDay()]:"";const toggleDate=()=>setOpenDates(prev=>{const n=new Set(prev);if(n.has(dk))n.delete(dk);else n.add(dk);return n});const DAILY_MODES=[{id:"summary",label:"📋 日次まとめ"},{id:"staff_manual",label:"👥 スタッフ指導マニュアル"},{id:"patient_material",label:"👤 患者向け説明資料ベース"},{id:"analysis",label:"📈 診療データ分析"}];const runDaily=async(mode)=>{setDailyMenu(null);setDailyLd(true);setDailyResult(null);try{const res=await fetch("/api/daily-summary",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:recs.map(r=>({input_text:r.input_text||"",output_text:r.output_text||"",patient_id:r.patient_id||""})),date:dk,mode})});const data=await res.json();if(data.error)throw new Error(data.error);setDailyResult({title:DAILY_MODES.find(m=>m.id===mode)?.label||"分析結果",date:dk,content:data.result||""})}catch(e){setDailyResult({title:"エラー",date:dk,content:"エラー: "+e.message})}finally{setDailyLd(false)}};return<div key={dk} style={{marginBottom:8}}>
<div onClick={toggleDate} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(160,220,100,0.2)",borderRadius:12,padding:"10px 16px",cursor:"pointer",userSelect:"none"}}>
<span style={{fontWeight:700,color:"#2a5018",fontSize:14}}>📅 {dk}（{dayStr}）- {recs.length}件</span>
<div style={{display:"flex",alignItems:"center",gap:6}}>
<div style={{position:"relative"}}><button onClick={e=>{e.stopPropagation();setDailyMenu(dailyMenu===dk?null:dk)}} style={{padding:"3px 10px",borderRadius:7,border:"1px solid #93c5fd",background:"#eff6ff",fontSize:11,fontWeight:600,color:"#2563eb",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>📊 日次分析▼</button>
{dailyMenu===dk&&<div style={{position:"absolute",top:"100%",right:0,marginTop:4,background:C.w,borderRadius:10,border:`1px solid ${C.g200}`,boxShadow:"0 4px 16px rgba(0,0,0,.15)",zIndex:100,minWidth:220,padding:4}} onClick={e=>e.stopPropagation()}>
{DAILY_MODES.map(m=><button key={m.id} onClick={()=>runDaily(m.id)} style={{display:"block",width:"100%",padding:"8px 12px",borderRadius:7,border:"none",background:C.w,fontSize:12,fontWeight:600,color:C.g700,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.target.style.background="#eff6ff"} onMouseLeave={e=>e.target.style.background=C.w}>{m.label}</button>)}
</div>}
</div>
<button onClick={async(e)=>{e.stopPropagation();setDailyTypoLd(dk);setTypoTarget("hist");const CHUNK_SIZE=3000;const MAX_CHUNKS=3;const fullText=recs.map(r=>r.input_text||"").filter(Boolean).join("\n---\n").slice(0,CHUNK_SIZE*MAX_CHUNKS);const chunks=[];for(let i=0;i<fullText.length;i+=CHUNK_SIZE)chunks.push(fullText.slice(i,i+CHUNK_SIZE));const limitedChunks=chunks.slice(0,MAX_CHUNKS);const allCorrections=[];const seenFroms=new Set();let errCount=0;try{for(let ci=0;ci<limitedChunks.length;ci++){setDailyTypoProgress(`${ci+1}/${limitedChunks.length}`);sSt(limitedChunks.length>1?`🔬 スキャン中... (${ci+1}/${limitedChunks.length})`:`🔬 ${dk} スキャン中...`);try{const res=await fetch("/api/fix-typos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:limitedChunks[ci],dictionary:dict.map(([from,to])=>({from,to}))})});if(!res.ok){const errText=await res.text();console.error("API error response chunk "+ci+":",errText);errCount++;continue}const d=await res.json();if(d.error){console.error("Chunk "+ci+" error:",d.error);errCount++;continue}if(d.corrections&&d.corrections.length>0){d.corrections.forEach(c=>{if(seenFroms.has(c.from)){const idx=allCorrections.findIndex(x=>x.from===c.from);if(idx!==-1)allCorrections[idx]=c}else{seenFroms.add(c.from);allCorrections.push(c)}})}}catch(chunkErr){console.error("Chunk "+ci+" fetch error:",chunkErr);errCount++}}if(allCorrections.length===0){if(errCount===limitedChunks.length){sSt("校正エラー: 全チャンクでエラーが発生しました")}else{sSt("✓ 医療用語の誤りは見つかりませんでした")}return}const registeredFroms=new Set(dict.map(([f])=>f));const filteredCorrections=allCorrections.filter(c=>!registeredFroms.has(c.from));if(filteredCorrections.length===0){sSt("✓ 新しい誤字候補はありません（全て登録済み）");return}const sel={};filteredCorrections.forEach((c,i)=>{if(c.candidates&&c.candidates.length===1)sel[i]=0});setTypoSelections(sel);setTypoCustomInputs({});setTypoModal(filteredCorrections);sSt(limitedChunks.length>1?`✓ ${allCorrections.length}件の校正候補が見つかりました（${limitedChunks.length}回に分けてスキャン）`:"校正候補が見つかりました")}catch(err){console.error("Daily typo scan error:",err);sSt("校正エラー: "+err.message)}finally{setDailyTypoLd(null);setDailyTypoProgress("")}}} title="この日の診療記録をAI誤字スキャン" onMouseEnter={e=>showTip(e,"この日の診療記録をAI誤字スキャン")} onMouseLeave={hideTip} disabled={dailyTypoLd===dk} style={{padding:"4px 10px",borderRadius:8,border:"1px solid rgba(160,220,100,0.3)",background:dailyTypoLd===dk?"#e5e7eb":"rgba(255,255,255,0.5)",fontSize:11,fontWeight:600,color:dailyTypoLd===dk?C.g400:"#2a5018",fontFamily:"inherit",cursor:dailyTypoLd===dk?"wait":"pointer",whiteSpace:"nowrap"}}>{dailyTypoLd===dk?`🔬 スキャン中... ${dailyTypoProgress||""}`:"🔬 誤字スキャン"}</button>
<button onClick={async(e)=>{e.stopPropagation();setDailyNoiseLd(dk);try{const fullText=recs.map(r=>r.input_text||"").filter(Boolean).join("\n---\n");if(!fullText.trim()){sSt("書き起こしテキストがありません");return}const CHUNK_SIZE=5000;const chunks=[];for(let i=0;i<fullText.length;i+=CHUNK_SIZE)chunks.push(fullText.slice(i,i+CHUNK_SIZE));const allCandidates=[];const seenTexts=new Set();const registeredSet=new Set(noisePatterns);let errCount=0;for(let ci=0;ci<chunks.length;ci++){setDailyNoiseProgress(`${ci+1}/${chunks.length}`);try{const res=await fetch("/api/scan-noise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:chunks[ci],registered:noisePatterns})});if(!res.ok){errCount++;continue}const d=await res.json();if(d.error){errCount++;continue}if(d.candidates&&d.candidates.length>0){d.candidates.forEach(c=>{if(!seenTexts.has(c.text)&&!registeredSet.has(c.text)){seenTexts.add(c.text);allCandidates.push(c)}})}}catch{errCount++}}if(allCandidates.length===0){sSt(errCount===chunks.length?"ノイズスキャンエラー: 全チャンクでエラーが発生しました":"✓ 新しいノイズ候補は見つかりませんでした");return}setNoiseCandidates(allCandidates);setNoiseModal(true);sSt(`✓ ノイズ候補${allCandidates.length}件（${chunks.length}チャンクをスキャン）`)}catch(err){sSt("ノイズスキャンエラー: "+err.message)}finally{setDailyNoiseLd(null);setDailyNoiseProgress("")}}} title="この日の診療記録をノイズスキャン" onMouseEnter={e=>showTip(e,"この日の書き起こしをノイズスキャン")} onMouseLeave={hideTip} disabled={dailyNoiseLd===dk} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #fca5a5",background:dailyNoiseLd===dk?"#e5e7eb":"#fff1f2",fontSize:11,fontWeight:600,color:dailyNoiseLd===dk?C.g400:"#dc2626",fontFamily:"inherit",cursor:dailyNoiseLd===dk?"wait":"pointer",whiteSpace:"nowrap"}}>{dailyNoiseLd===dk?`🚫 スキャン中... ${dailyNoiseProgress||""}`.trim():"🚫 ノイズスキャン"}</button>
<span style={{fontSize:16,color:"#2a5018"}}>{isOpen?"▲":"▼"}</span>
</div></div>
{isOpen&&<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(3,1fr)",gap:6,marginTop:6}}>
{recs.map((r,i)=>{const time=r.created_at?new Date(r.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"";const preview=(r.output_text||"").replace(/\n/g," ").substring(0,mob?40:30);const pid=r.patient_id||"";const lines20=(r.input_text||"").split("\n").length>=20;const checked=selectedHistIds.has(r.id);const toggleSel=()=>{setSelectedHistIds(prev=>{const n=new Set(prev);if(n.has(r.id))n.delete(r.id);else n.add(r.id);return n})};return(<div key={r.id||i} onClick={e=>{if(e.target.tagName==="INPUT"||e.target.tagName==="BUTTON")return;toggleSel()}} style={{padding:mob?"6px 8px":"5px 7px",borderRadius:8,border:checked?`1.5px solid ${C.p}`:`1px solid ${C.g200}`,background:checked?"#f7fee7":C.w,boxShadow:"0 1px 2px rgba(0,0,0,.05)",position:"relative",cursor:"pointer"}}>
{lines20&&<span style={{position:"absolute",top:2,right:2,background:"#7c3aed",color:"#fff",fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:4,lineHeight:1.3}}>📄20+</span>}
<div style={{display:"flex",gap:4,alignItems:"center",marginBottom:2}}>
<input type="checkbox" checked={checked} onChange={toggleSel} style={{width:14,height:14,accentColor:C.p,cursor:"pointer",flexShrink:0}}/>
<span style={{fontSize:mob?10:11,color:"#111",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{time}{pid&&<span onClick={e=>{e.stopPropagation();openPatientHistory(pid)}} style={{color:C.pD,textDecoration:"underline",cursor:"pointer",marginLeft:4}}>{pid}</span>}</span>
{(()=>{const roomColor=ROOM_COLORS[r.room]||{bg:"#f3f4f6",text:"#6b7280",border:"#e5e7eb"};const roomInfo=R.find(rm=>rm.id===r.room);return roomInfo?<span style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:4,background:roomColor.bg,color:roomColor.text,border:`1px solid ${roomColor.border}`,flexShrink:0,whiteSpace:"nowrap"}}>{roomInfo.i}{roomInfo.l}</span>:null})()}
</div>
<div style={{fontSize:mob?14:13,color:C.g700,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{preview||"（内容なし）"}</div>
{(()=>{const badges=detectContentBadges(r.input_text,r.output_text);return badges.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:3}}>{badges.map(b=><button key={b.key} onClick={e=>{e.stopPropagation();runBadgeAnalysis(r,b)}} style={{padding:"1px 6px",borderRadius:5,border:`1px solid ${b.color}44`,background:b.bg,fontSize:10,fontWeight:700,color:b.color,fontFamily:"inherit",cursor:"pointer"}}>{b.label}</button>)}</div>})()}
<div style={{display:"flex",gap:3}}>
<button onClick={()=>setHistPopup({title:"📝 書き起こし",content:r.input_text||"（書き起こしなし）",date:time,pid})} title="書き起こし内容を表示" onMouseEnter={e=>showTip(e,"書き起こし内容を表示")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:"#2a4a18",fontFamily:"inherit",cursor:"pointer"}}>📝書起</button>
<button onClick={()=>setHistPopup({title:"📋 要約",content:r.output_text||"（要約なし）",date:time,pid})} title="要約内容を表示" onMouseEnter={e=>showTip(e,"要約内容を表示")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${C.p}`,background:C.pLL,fontSize:11,fontWeight:600,color:"#2a4a18",fontFamily:"inherit",cursor:"pointer"}}>📋要約</button>
<button onClick={()=>{const fullDate=r.created_at?new Date(r.created_at).toLocaleDateString("ja-JP",{year:"numeric",month:"numeric",day:"numeric"})+" "+new Date(r.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"";setFavModal({title:fullDate+(pid?" | ID:"+pid:""),input_text:r.input_text||"",output_text:r.output_text||"",recordId:r.id})}} title="お気に入りに保存" onMouseEnter={e=>showTip(e,"お気に入りに保存")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:6,border:`1px solid #f59e0b`,background:"#fffbeb",fontSize:11,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐</button>
{r.input_text&&<button onClick={()=>runQualityCheck(r)} title="AI対応品質チェック" onMouseEnter={e=>showTip(e,"AI対応品質チェック")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #93c5fd",background:"#eff6ff",fontSize:11,fontWeight:600,color:"#2563eb",fontFamily:"inherit",cursor:"pointer"}}>🔍品質</button>}
</div>
</div>)})}
</div>}
</div>})})()}
{dailyLd&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{background:C.w,borderRadius:16,padding:30,textAlign:"center",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #3b82f6",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/><span style={{color:C.g500,fontSize:14,fontWeight:600}}>⏳ 生成中...</span></div></div>}
{dailyResult&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setDailyResult(null)}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<div><span style={{fontSize:14,fontWeight:700,color:C.pDD}}>{dailyResult.title}</span><span style={{fontSize:11,color:C.g400,marginLeft:8}}>{dailyResult.date}</span></div>
<div style={{display:"flex",gap:6}}>
<button onClick={()=>{navigator.clipboard.writeText(dailyResult.content);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>{saveFavorite("治療説明",`[${dailyResult.title}] ${dailyResult.date}`,dailyResult.content,"");setDailyResult(null)}} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:700,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ 保存</button>
<button onClick={()=>setDailyResult(null)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div></div>
<div style={{flex:1,overflow:"auto",padding:16}}>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{dailyResult.content}</pre>
</div></div></div>}
{histPopup&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setHistPopup(null)}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<div>
<span style={{fontSize:14,fontWeight:700,color:C.pDD}}>{histPopup.title}</span>
<span style={{fontSize:11,color:C.g400,marginLeft:8}}>{histPopup.date} {histPopup.pid}</span>
</div>
<div style={{display:"flex",gap:6}}>
<button onClick={()=>{navigator.clipboard.writeText(histPopup.content).catch(()=>{});sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>setHistPopup(null)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{histPopup.content}</pre>
</div>
</div>
</div>}
{badgePopup&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setBadgePopup(null)}>
<div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #e5e7eb",background:badgePopup.bg,borderRadius:"16px 16px 0 0"}}>
<span style={{fontSize:15,fontWeight:700,color:badgePopup.color}}>{badgePopup.title} 詳細解説</span>
<button onClick={()=>setBadgePopup(null)} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",fontSize:12,fontWeight:600,color:"#6b7280",fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
{badgeLd?<div style={{textAlign:"center",padding:32}}><div style={{width:28,height:28,border:"3px solid #e5e7eb",borderTop:`3px solid ${badgePopup.color}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:"#6b7280",fontSize:13}}>AI解析中...</span></div>:<pre style={{fontSize:13,color:"#374151",whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.8,fontFamily:"inherit"}}>{badgePopup.content}</pre>}
</div>
{!badgeLd&&badgePopup.content&&<div style={{padding:"10px 16px",borderTop:"1px solid #e5e7eb"}}>
<button onClick={()=>{navigator.clipboard.writeText(badgePopup.content);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:8,border:"none",background:badgePopup.color,color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
</div>}
</div>
</div>}
{/* 品質チェックモーダル */}
{qcModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{if(!qcLoading)setQcModal(null)}}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:"#2563eb"}}>🔍 対応品質チェック</span>
<button onClick={()=>{if(!qcLoading)setQcModal(null)}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
{qcLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:28,height:28,border:`3px solid ${C.g200}`,borderTop:"3px solid #3b82f6",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/><span style={{color:C.g500,fontSize:12}}>🔍 分析中...</span></div>}
{qcResult&&!qcLoading&&<div>
<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
<button onClick={()=>{navigator.clipboard.writeText(qcResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
</div>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{qcResult}</pre>
</div>}
</div>
</div></div>}
{bulkResult&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setBulkResult(null)}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:"#2563eb"}}>{bulkResult.title}</span>
<div style={{display:"flex",gap:6}}>
<button onClick={()=>{navigator.clipboard.writeText(bulkResult.content).catch(()=>{});sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>setFavModal({title:bulkResult.title,content:bulkResult.content,recordId:""})} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:700,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ 保存</button>
<button onClick={()=>setBulkResult(null)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div></div>
<div style={{flex:1,overflow:"auto",padding:16}}>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{bulkResult.content}</pre>
</div></div></div>}
{treatModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setTreatModal(false)}>
<div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:740,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #e5e7eb",background:"#f5f3ff",borderRadius:"16px 16px 0 0"}}>
<span style={{fontSize:15,fontWeight:700,color:"#6d28d9"}}>📚 疾患別治療資料</span>
<button onClick={()=>setTreatModal(false)} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",fontSize:12,fontWeight:600,color:"#6b7280",fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
{treatLd?<div style={{textAlign:"center",padding:40}}><div style={{width:32,height:32,border:"3px solid #e5e7eb",borderTop:"3px solid #7c3aed",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/><span style={{color:"#6b7280",fontSize:13}}>AIが診察記録を分析中...</span></div>:treatResult&&<div>
<pre style={{fontSize:13,color:"#374151",whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.9,fontFamily:"inherit"}}>{treatResult.material}</pre>
</div>}
</div>
{treatResult&&!treatLd&&<div style={{padding:"10px 16px",borderTop:"1px solid #e5e7eb",display:"flex",gap:8,flexWrap:"wrap"}}>
<button onClick={()=>{navigator.clipboard.writeText(treatResult.material||"");sSt("📋 治療資料をコピーしました")}} style={{padding:"6px 14px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 治療資料をコピー</button>
<button onClick={()=>{navigator.clipboard.writeText(treatResult.gensparkPrompt||"");sSt("✨ Gensparkプロンプトをコピーしました")}} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:700,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>✨ Gensparkプロンプトをコピー</button>
<button onClick={()=>{saveFavorite("治療資料","[治療資料] "+new Date().toLocaleDateString("ja-JP"),treatResult.material||"","");setTreatModal(false)}} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #a78bfa",background:"#f5f3ff",fontSize:12,fontWeight:700,color:"#6d28d9",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
</div>}
</div>
</div>}
{/* 履歴用お気に入りグループ選択モーダル */}
{favModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFavModal(null)}>
<div style={{background:"rgba(255,255,255,0.85)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderRadius:14,padding:20,maxWidth:320,width:"100%",border:"1px solid rgba(160,220,100,0.2)"}} onClick={e=>e.stopPropagation()}>
<div style={{fontSize:14,fontWeight:700,color:"#2a5018",marginBottom:4}}>⭐ お気に入りに保存</div>
{favModal.title&&<div style={{fontSize:11,color:C.g400,marginBottom:10}}>{favModal.title}</div>}
{FAV_GROUPS.map(g=><button key={g} onClick={()=>{saveFavoriteSplit(g,favModal.title,favModal.input_text,favModal.output_text,favModal.recordId);setFavModal(null)}} style={{display:"block",width:"100%",padding:"10px 14px",marginBottom:6,borderRadius:10,border:"1px solid rgba(160,220,100,0.2)",background:"rgba(255,255,255,0.7)",fontSize:14,fontWeight:600,color:"#2a5018",fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>{g}</button>)}
<button onClick={()=>setFavModal(null)} style={{width:"100%",padding:"8px",borderRadius:10,border:"1px solid rgba(160,220,100,0.2)",background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer",marginTop:4}}>キャンセル</button>
</div></div>}
{typoModalEl}
{noiseModalEl}
</div>);

// === FAVORITES PAGE ===
if(page==="favs"){const gFavs=favorites.filter(f=>f.group_name===favGroup);return(<div style={{maxWidth:1200,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{tooltip.visible&&<div style={{position:"fixed",left:tooltip.x,top:tooltip.y,transform:"translate(-50%, -100%)",background:"rgba(42,58,32,0.92)",color:"#e8f5d8",padding:"4px 10px",borderRadius:8,fontSize:12,fontWeight:600,fontFamily:"'Zen Maru Gothic', sans-serif",pointerEvents:"none",zIndex:99999,whiteSpace:"nowrap",boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>{tooltip.text}</div>}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#92400e",margin:0}}>⭐ お気に入り</h2>
<div style={{display:"flex",gap:6}}>
<button onClick={()=>{loadHist();setPage("hist")}} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📂 履歴</button>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
</div></div>
<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
{FAV_GROUPS.map(g=><button key={g} onClick={()=>setFavGroup(g)} style={{padding:"6px 10px",borderRadius:8,border:`1.5px solid ${favGroup===g?"#f59e0b":C.g200}`,background:favGroup===g?"#fffbeb":C.w,fontSize:12,fontWeight:favGroup===g?700:500,color:favGroup===g?"#92400e":C.g500,fontFamily:"inherit",cursor:"pointer"}}>{g}</button>)}
</div>
<div style={{display:"flex",gap:6,marginBottom:12}}>
<button onClick={()=>{const gf=favorites.filter(f=>f.group_name===favGroup);if(gf.length===0){setFavToast("データがありません");setTimeout(()=>setFavToast(""),2500);return}generateFaq(favGroup,gf)}} disabled={faqLoading} title="このグループのデータからFAQを自動生成" style={{padding:"6px 14px",borderRadius:8,border:"1px solid #a78bfa",background:"#f5f3ff",fontSize:12,fontWeight:600,color:"#7c3aed",fontFamily:"inherit",cursor:"pointer"}}>{faqLoading?"⏳ 生成中...":"❓ FAQ自動生成"}</button>
{favGroup==="美容"&&<button onClick={()=>{const gf=favorites.filter(f=>f.group_name==="美容");if(gf.length===0){setFavToast("美容データがありません");setTimeout(()=>setFavToast(""),2500);return}generateMenu(gf)}} disabled={menuLoading} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>{menuLoading?"⏳ 生成中...":"📝 メニュー説明文生成"}</button>}
<button onClick={()=>{setPortfolioGroup(favGroup);runPortfolio(favGroup)}} disabled={portfolioLoading} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #a78bfa",background:"#f5f3ff",fontSize:12,fontWeight:600,color:"#7c3aed",fontFamily:"inherit",cursor:"pointer"}}>{portfolioLoading?"⏳ 生成中...":"📖 症例ポートフォリオ生成"}</button>
</div>
{gFavs.length===0?<div style={{textAlign:"center",padding:40,color:C.g400,fontSize:13}}>このグループにはお気に入りがありません</div>:
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":tab?"repeat(2,1fr)":"repeat(3,1fr)",gap:8}}>
{gFavs.map((f,i)=>{const favDate=f.created_at?new Date(f.created_at).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"})+" "+new Date(f.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"";const ct=f.content||"";const tt=f.title||"";const hasTrans=ct.includes("【書き起こし】")||tt.includes("|書き起こし");const hasSum=ct.includes("【要約】")||tt.includes("|要約");const extractTrans=()=>{if(tt.includes("|書き起こし"))return ct;const si=ct.indexOf("【書き起こし】");if(si===-1)return ct;const after=ct.substring(si+"【書き起こし】".length);const ei=after.indexOf("【要約】");return(ei===-1?after:after.substring(0,ei)).trim()};const extractSum=()=>{if(tt.includes("|要約"))return ct;const si=ct.indexOf("【要約】");if(si===-1)return ct;return ct.substring(si+"【要約】".length).trim()};const preview=ct.replace(/\n/g," ").substring(0,mob?40:30);const checked=selectedFavIds.has(f.id);const toggleSel=()=>{setSelectedFavIds(prev=>{const n=new Set(prev);if(n.has(f.id))n.delete(f.id);else n.add(f.id);return n})};return<div key={f.id||i} onClick={e=>{if(e.target.tagName==="INPUT"||e.target.tagName==="BUTTON")return;toggleSel()}} style={{padding:mob?"6px 8px":"5px 7px",borderRadius:8,border:checked?`2px solid ${C.p}`:"1px solid rgba(160,220,100,0.2)",background:checked?"rgba(220,252,231,0.3)":"rgba(255,255,255,0.7)",boxShadow:"0 1px 2px rgba(0,0,0,.05)",position:"relative",cursor:"pointer"}}>
<div style={{display:"flex",gap:4,alignItems:"center",marginBottom:2}}>
<input type="checkbox" checked={checked} onChange={toggleSel} style={{width:14,height:14,accentColor:C.p,cursor:"pointer",flexShrink:0}}/>
<span style={{fontSize:mob?10:11,color:"#111",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{favDate}</span>
{hasTrans&&<span style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:5,background:"#ede9fe",color:"#7c3aed"}}>📝 書き起こし</span>}
{hasSum&&<span style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:5,background:"#dcfce7",color:"#166534"}}>📋 要約</span>}
</div>
<div style={{fontSize:mob?14:13,color:C.g700,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{preview||"（内容なし）"}</div>
<div style={{display:"flex",flexWrap:"nowrap",gap:3,alignItems:"center",overflowX:"auto"}}>
{hasTrans&&<button onClick={()=>setFavDetailModal({...f,title:"📝 書き起こし",content:extractTrans()})} title="書き起こし内容を表示" onMouseEnter={e=>showTip(e,"書き起こし内容を表示")} onMouseLeave={hideTip} style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:"#2a4a18",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>📝書起</button>}
{hasSum&&<button onClick={()=>setFavDetailModal({...f,title:"📋 要約",content:extractSum()})} title="要約内容を表示" onMouseEnter={e=>showTip(e,"要約内容を表示")} onMouseLeave={hideTip} style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.p}`,background:C.pLL,fontSize:11,fontWeight:600,color:"#2a4a18",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>📋要約</button>}
{!hasTrans&&!hasSum&&<button onClick={()=>setFavDetailModal(f)} title="内容を表示" onMouseEnter={e=>showTip(e,"内容を表示")} onMouseLeave={hideTip} style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:"#2a4a18",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>📋内容</button>}
<button onClick={()=>openEditModal(f)} title="タイトル・内容を編集" onMouseEnter={e=>showTip(e,"タイトル・内容を編集")} onMouseLeave={hideTip} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:11,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>⭐</button>
<button onClick={()=>{setQcModal({input_text:f.content||""});setQcResult("");setQcLoading(true);fetch("/api/quality-check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:f.content||""})}).then(r=>r.json()).then(d=>{if(d.error)throw new Error(d.error);setQcResult(d.result||"")}).catch(e=>setQcResult("エラー: "+e.message)).finally(()=>setQcLoading(false))}} title="AIで内容を分析" onMouseEnter={e=>showTip(e,"AIで内容を分析")} onMouseLeave={hideTip} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #93c5fd",background:"#eff6ff",fontSize:11,fontWeight:600,color:"#2563eb",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>🔍分析</button>
<button onClick={()=>openGenModal(f)} title="この内容から資料を生成" onMouseEnter={e=>showTip(e,"この内容から資料を生成")} onMouseLeave={hideTip} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #93c5fd",background:"#eff6ff",fontSize:11,fontWeight:600,color:"#2563eb",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>📄資料生成</button>
<button onClick={()=>setFavMoveModal(f)} title="別グループへ移動" onMouseEnter={e=>showTip(e,"別グループへ移動")} onMouseLeave={hideTip} style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:"#2a4a18",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>📁移動</button>
<button onClick={()=>deleteFavorite(f.id)} title="お気に入りから削除" onMouseEnter={e=>showTip(e,"お気に入りから削除")} onMouseLeave={hideTip} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #fca5a5",background:"#fef2f2",fontSize:11,fontWeight:600,color:"#ef4444",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>🗑️</button>
</div></div>})}
</div>}
{/* お気に入り全文モーダル */}
{favDetailModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFavDetailModal(null)}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:C.pDD}}>{favDetailModal.title}</span>
<div style={{display:"flex",gap:6}}>
<button onClick={()=>{navigator.clipboard.writeText(favDetailModal.content||"");sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>setFavDetailModal(null)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div></div>
<div style={{flex:1,overflow:"auto",padding:16}}>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{favDetailModal.content}</pre>
</div></div></div>}
{/* お気に入りAI分析モーダル */}
{qcModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{if(!qcLoading)setQcModal(null)}}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:"#2563eb"}}>🔍 AI分析</span>
<button onClick={()=>{if(!qcLoading)setQcModal(null)}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
{qcLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:28,height:28,border:`3px solid ${C.g200}`,borderTop:"3px solid #3b82f6",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/><span style={{color:C.g500,fontSize:12}}>🔍 分析中...</span></div>}
{qcResult&&!qcLoading&&<div>
<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
<button onClick={()=>{navigator.clipboard.writeText(qcResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
</div>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{qcResult}</pre>
</div>}
</div>
</div></div>}
{/* グループ移動モーダル */}
{favMoveModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFavMoveModal(null)}>
<div style={{background:"#ffffff",borderRadius:14,padding:20,maxWidth:320,width:"100%"}} onClick={e=>e.stopPropagation()}>
<div style={{fontSize:14,fontWeight:700,color:C.pDD,marginBottom:12}}>📁 グループ移動</div>
{FAV_GROUPS.filter(g=>g!==favMoveModal.group_name).map(g=><button key={g} onClick={()=>moveFavorite(favMoveModal.id,g)} style={{display:"block",width:"100%",padding:"8px 12px",marginBottom:6,borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:13,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>{g}</button>)}
<button onClick={()=>setFavMoveModal(null)} style={{width:"100%",padding:"6px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer",marginTop:4}}>キャンセル</button>
</div></div>}
{/* 編集モーダル */}
{favEditModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFavEditModal(null)}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:C.pDD}}>✏️ お気に入り編集</span>
<button onClick={()=>setFavEditModal(null)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
<div style={{marginBottom:12}}>
<label style={{fontSize:12,fontWeight:600,color:C.g600,display:"block",marginBottom:4}}>タイトル</label>
<input value={favEditTitle} onChange={e=>setFavEditTitle(e.target.value)} style={{...ib,width:"100%",padding:"8px 12px",fontSize:13,boxSizing:"border-box"}}/>
</div>
<div style={{marginBottom:12}}>
<label style={{fontSize:12,fontWeight:600,color:C.g600,display:"block",marginBottom:4}}>グループ</label>
<select value={favEditGroup} onChange={e=>setFavEditGroup(e.target.value)} style={{...ib,width:"100%",padding:"8px 12px",fontSize:13,boxSizing:"border-box"}}>
{FAV_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
</select>
</div>
<div style={{marginBottom:12}}>
<label style={{fontSize:12,fontWeight:600,color:C.g600,display:"block",marginBottom:4}}>内容</label>
<textarea value={favEditContent} onChange={e=>setFavEditContent(e.target.value)} rows={10} style={{...ib,width:"100%",padding:"8px 12px",fontSize:13,resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/>
</div>
<button onClick={updateFavorite} style={{width:"100%",padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>💾 保存</button>
</div>
</div></div>}
{/* 資料生成モーダル */}
{favGenModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{if(!favGenLoading)setFavGenModal(null)}}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:640,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:"#2563eb"}}>📄 資料自動生成</span>
<button onClick={()=>{if(!favGenLoading)setFavGenModal(null)}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
<div style={{marginBottom:12}}>
<label style={{fontSize:12,fontWeight:600,color:C.g600,display:"block",marginBottom:4}}>元データ: {favGenModal.title||"無題"}</label>
<div style={{fontSize:11,color:C.g500,background:C.g50,padding:8,borderRadius:8,maxHeight:60,overflow:"auto",lineHeight:1.4}}>{(favGenModal.content||"").substring(0,200)}{(favGenModal.content||"").length>200?"...":""}</div>
</div>
<div style={{marginBottom:12}}>
<label style={{fontSize:12,fontWeight:600,color:C.g600,display:"block",marginBottom:6}}>用途選択</label>
<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
{["患者向け説明文","スタッフ向けマニュアル","院内掲示用"].map(p=><button key={p} onClick={()=>setFavGenPurpose(p)} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${favGenPurpose===p?"#2563eb":C.g200}`,background:favGenPurpose===p?"#eff6ff":C.w,fontSize:12,fontWeight:favGenPurpose===p?700:500,color:favGenPurpose===p?"#2563eb":C.g500,fontFamily:"inherit",cursor:"pointer"}}>{p}</button>)}
</div>
</div>
<button onClick={generateMaterial} disabled={favGenLoading} style={{width:"100%",padding:"10px",borderRadius:10,border:"none",background:favGenLoading?C.g200:"linear-gradient(135deg,#3b82f6,#2563eb)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:favGenLoading?"not-allowed":"pointer",marginBottom:12}}>{favGenLoading?"⏳ 生成中...":"✨ 生成する"}</button>
{favGenLoading&&<div style={{textAlign:"center",padding:16}}><div style={{width:28,height:28,border:`3px solid ${C.g200}`,borderTop:"3px solid #3b82f6",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/><span style={{color:C.g500,fontSize:12}}>Claude AIが文書を生成中...</span></div>}
{favGenResult&&!favGenLoading&&<div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
<span style={{fontSize:12,fontWeight:700,color:"#2563eb"}}>生成結果</span>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>{navigator.clipboard.writeText(favGenResult);sSt("📋 コピーしました")}} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #93c5fd",background:"#eff6ff",fontSize:11,fontWeight:600,color:"#2563eb",fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={saveGenResultAsFavorite} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:11,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
</div>
</div>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit",background:C.g50,padding:12,borderRadius:10,maxHeight:300,overflow:"auto"}}>{favGenResult}</pre>
</div>}
</div>
</div></div>}
{/* FAQ生成モーダル */}
{faqModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setFaqModal(false);setFaqLoading(false)}}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:640,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>❓ FAQ自動生成（{favGroup}）</span>
<button onClick={()=>{setFaqModal(false);setFaqLoading(false)}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
{faqLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:28,height:28,border:`3px solid ${C.g200}`,borderTop:"3px solid #7c3aed",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/><span style={{color:C.g500,fontSize:12}}>FAQ生成中...</span></div>}
{faqResult&&!faqLoading&&<div>
<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8,gap:4}}>
<button onClick={()=>{navigator.clipboard.writeText(faqResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>{saveFavorite(favGroup,"[FAQ] "+favGroup,faqResult,"")}} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:700,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ 保存</button>
</div>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{faqResult}</pre>
</div>}
</div>
</div></div>}
{/* メニュー説明文モーダル */}
{menuModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{if(!menuLoading)setMenuModal(false)}}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:640,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:"#92400e"}}>📝 施術メニュー説明文</span>
<button onClick={()=>{if(!menuLoading)setMenuModal(false)}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
{menuLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:28,height:28,border:`3px solid ${C.g200}`,borderTop:"3px solid #f59e0b",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/><span style={{color:C.g500,fontSize:12}}>メニュー説明文を生成中...</span></div>}
{menuResult&&!menuLoading&&<div>
<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8,gap:4}}>
<button onClick={()=>{navigator.clipboard.writeText(menuResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>{saveFavorite("美容","[メニュー説明] 美容施術",menuResult,"")}} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:700,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ 保存</button>
</div>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{menuResult}</pre>
</div>}
</div>
</div></div>}
</div>)}
// === CASE LIBRARY ===
if(page==="caselib"){const caseFiltered=caseSearch.trim()?favorites.filter(f=>(f.title||"").includes(caseSearch)||(f.content||"").includes(caseSearch)):favorites;const caseGroups=[...new Set(caseFiltered.map(f=>f.group_name||"その他"))];return(<div style={{maxWidth:1200,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#7c3aed",margin:0}}>📚 症例ライブラリ</h2>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
</div>
<input value={caseSearch} onChange={e=>setCaseSearch(e.target.value)} placeholder="🔍 疾患名で検索..." style={{...ib,width:"100%",padding:"10px 14px",fontSize:14,marginBottom:12,boxSizing:"border-box"}}/>
{caseGroups.length===0?<div style={{textAlign:"center",padding:40,color:C.g400,fontSize:13}}>お気に入りに症例データがありません</div>:
caseGroups.map(g=><div key={g} style={{marginBottom:16}}>
<h3 style={{fontSize:14,fontWeight:700,color:"#7c3aed",marginBottom:8,padding:"4px 10px",background:"#f5f3ff",borderRadius:8,display:"inline-block"}}>{g}</h3>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(2,1fr)",gap:8}}>
{caseFiltered.filter(f=>(f.group_name||"その他")===g).map(f=><div key={f.id} style={{padding:10,borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,boxShadow:"0 1px 3px rgba(0,0,0,.05)"}}>
<div style={{fontSize:12,fontWeight:700,color:C.pDD,marginBottom:4}}>{f.title||"無題"}</div>
<div style={{fontSize:11,color:C.g600,marginBottom:6,lineHeight:1.3}}>{(f.content||"").substring(0,50)}{(f.content||"").length>50?"...":""}</div>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>setFavDetailModal(f)} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.g50,fontSize:10,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>📖 全文</button>
<button onClick={()=>generateCaseStudy(f)} style={{padding:"3px 10px",borderRadius:6,border:"1px solid #a78bfa",background:"#f5f3ff",fontSize:10,fontWeight:600,color:"#7c3aed",fontFamily:"inherit",cursor:"pointer"}}>📖 学習する</button>
<button onClick={()=>{navigator.clipboard.writeText(f.content||"");sSt("📋 コピーしました")}} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.g50,fontSize:10,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>📋</button>
</div>
</div>)}
</div>
</div>)}
{/* 症例解説モーダル */}
{caseStudyModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{if(!caseStudyLoading)setCaseStudyModal(null)}}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:640,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>📖 症例解説: {(caseStudyModal.title||"無題").substring(0,30)}</span>
<button onClick={()=>{if(!caseStudyLoading)setCaseStudyModal(null)}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
{caseStudyLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:28,height:28,border:`3px solid ${C.g200}`,borderTop:"3px solid #7c3aed",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/><span style={{color:C.g500,fontSize:12}}>AIが症例を解説中...</span></div>}
{caseStudyResult&&!caseStudyLoading&&<div>
<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8,gap:4}}>
<button onClick={()=>{navigator.clipboard.writeText(caseStudyResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>{saveFavorite(caseStudyModal.group_name||"その他","[症例解説] "+(caseStudyModal.title||"無題").substring(0,30),caseStudyResult,"")}} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:700,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ 保存</button>
</div>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{caseStudyResult}</pre>
</div>}
</div>
</div></div>}
{/* お気に入り全文モーダル(症例ライブラリ用) */}
{favDetailModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFavDetailModal(null)}>
<div style={{background:"#ffffff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:C.pDD}}>{favDetailModal.title}</span>
<button onClick={()=>setFavDetailModal(null)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{favDetailModal.content}</pre>
</div></div></div>}
</div>)}

// === ROLEPLAY ===
const RP_CATEGORIES=[{id:"reception",label:"🏥 受付・接遇",color:"#AED9C8",textColor:"#1A5744",scenarios:["初めて来院した患者への受付対応","保険証を忘れた患者への対応","予約なしで来院した混雑時の対応","待ち時間が長いとクレームする患者","電話で予約を取りたい患者への対応","高齢で耳が聞こえにくい患者への対応","外国人患者（日本語が不得意）への対応","問診票の書き方がわからない患者への説明"]},{id:"atopy",label:"🌿 アトピー・湿疹",color:"#C5B8E8",textColor:"#3A2470",scenarios:["アトピー性皮膚炎の治療方針を不安がる患者","ステロイド外用薬を怖がって使いたくない患者","デュピクセント注射を勧められ費用を心配する患者","プロアクティブ療法の説明を求める患者","子どものアトピーを心配する母親への対応","保湿剤の正しい塗り方を聞く患者","かゆくて夜眠れないと訴える患者","アトピーで学校・仕事に支障が出ている患者"]},{id:"acne",label:"✨ ニキビ・美容",color:"#F2C9A8",textColor:"#7A3D14",scenarios:["ニキビ治療の効果が出ないと訴える患者","ディフェリンゲルの副作用（赤み・乾燥）を心配する患者","ケミカルピーリングの効果と副作用を聞く患者","肝斑治療（トラネキサム酸）の説明を求める患者","ボトックス注射を初めて検討している患者","ヒアルロン酸注射のリスクを心配する患者","施術後のダウンタイムについて質問する患者","美容施術の費用・モニター価格について質問する患者"]},{id:"infection",label:"🦠 感染症・緊急",color:"#F4A8A8",textColor:"#7A1A1A",scenarios:["帯状疱疹の痛みを訴える高齢患者","水虫（足白癬）の治療期間が長いと不満を言う患者","とびひ（伝染性膿痂疹）の子どもを連れた親御さん","疥癬感染が判明し動揺している患者","蜂窩織炎で発熱・腫脹がひどい患者","単純ヘルペスが繰り返すことへの不安を訴える患者"]},{id:"hair",label:"💇 脱毛・AGA",color:"#AED9C8",textColor:"#1A5744",scenarios:["円形脱毛症を発症して動揺している患者","AGA治療薬（フィナステリド）の副作用を心配する患者","医療脱毛の痛みや効果を心配する患者","脱毛施術中に肌トラブルが起きた患者への対応","男性型脱毛症の進行を強く気にする患者"]},{id:"difficult",label:"⚠️ クレーム・困難対応",color:"#F2C9A8",textColor:"#7A3D14",scenarios:["診察時間が短いとクレームする患者","前回と薬が変わったことに不満を言う患者","他院との治療方針の違いを指摘する患者","SNSで見た民間療法を試したいと主張する患者","保険適用外と説明しても納得しない患者","医師や他スタッフへの不満を受付にぶつける患者","電話で強い口調でクレームをつける患者","お会計の金額が思ったより高いと驚く患者"]},{id:"explanation",label:"📋 説明・指導",color:"#C5B8E8",textColor:"#3A2470",scenarios:["外用薬の正しい塗り方・量の説明","内服薬の飲み方・注意点の説明","遮光指導（紫外線対策）の説明","日常生活での皮膚ケア指導","検査（アレルギー検査）の説明と同意取得","診断書・紹介状の依頼への対応","次回予約の取り方・フォローアップの説明"]}];
const rpCat=RP_CATEGORIES.find(c=>c.id===rpCategory)||RP_CATEGORIES[0];
if(page==="roleplay")return(<div style={{maxWidth:800,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#5C4A3A",margin:0}}>🎭 ロールプレイ練習<span style={{fontSize:12,fontWeight:500,color:"#8A7A6A",marginLeft:8}}>（新人教育用）</span></h2>
<button onClick={()=>setPage("main")} style={{padding:"10px 18px",borderRadius:10,border:"none",background:"#D9CFBF",color:"#6B5A4A",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button>
</div>
<p style={{fontSize:13,color:"#8A7A6A",margin:"0 0 12px"}}>実際の診療現場を想定したシナリオで接遇・対応を練習しましょう</p>
<div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
{RP_CATEGORIES.map(cat=><button key={cat.id} onClick={()=>setRpCategory(cat.id)} style={{padding:"6px 14px",borderRadius:20,border:rpCategory===cat.id?"none":"1px solid #ddd",background:rpCategory===cat.id?cat.color:"#f5f5f5",color:rpCategory===cat.id?cat.textColor:"#666",fontSize:12,fontWeight:rpCategory===cat.id?700:500,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{cat.label}</button>)}
</div>
<div style={{...card,background:"#FFFDF9",borderRadius:18,border:"none",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
{rpCat.scenarios.map(s=><button key={s} onClick={()=>setRpInput(s)} style={{padding:"8px 12px",borderRadius:10,border:"1px solid #D9CFBF",background:rpInput===s?rpCat.color:"#FFFDF9",color:rpInput===s?rpCat.textColor:"#5C4A3A",fontSize:12,fontWeight:rpInput===s?700:500,fontFamily:"inherit",cursor:"pointer",textAlign:"left",transition:"background 0.15s"}} onMouseEnter={e=>{if(rpInput!==s)e.target.style.background=rpCat.color+"40"}} onMouseLeave={e=>{if(rpInput!==s)e.target.style.background="#FFFDF9"}}>{s}</button>)}
</div>
<div style={{display:"flex",gap:8,marginBottom:12,flexDirection:mob?"column":"row"}}>
<input value={rpInput} onChange={e=>setRpInput(e.target.value)} placeholder="カスタムシナリオを自由入力（例：アトピーの患者が不安を訴えている）" style={{...ib,flex:1,padding:"10px 14px",fontSize:14}}/>
<button onClick={generateRoleplay} disabled={rpLoading||!rpInput.trim()} style={{padding:"10px 20px",borderRadius:14,border:"none",background:rpLoading?C.g200:"#C4A882",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!rpInput.trim()?.45:1}}>{rpLoading?"⏳ 生成中...":"🎭 練習開始"}</button>
</div>
{rpLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #C4A882",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:"#8A7A6A"}}>AIがシナリオを作成中...</span></div>}
{rpResult&&!rpLoading&&<div style={{marginTop:8}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:"#5C4A3A"}}>🎭 生成結果</span>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>{navigator.clipboard.writeText(rpResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>{saveFavorite("その他","[ロールプレイ] "+rpInput.substring(0,30),rpResult,"")}} style={{padding:"4px 12px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>💾 お気に入り保存</button>
<button onClick={()=>{setRpMaterialModal(true);setRpMaterialPrompt("")}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #C4A882",background:"#FAF0E0",fontSize:12,fontWeight:600,color:"#7A5A30",fontFamily:"inherit",cursor:"pointer"}}>📄 患者向け資料を作成</button>
<button onClick={generateStaffPrompt} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #8AB8C8",background:"#E8F4F8",fontSize:12,fontWeight:600,color:"#286880",fontFamily:"inherit",cursor:"pointer"}}>📋 スタッフ指導資料を作成</button>
</div>
</div>
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{rpResult}</pre>
</div>}
</div>
{rpHistory.length>0&&<div style={{marginTop:16}}>
<h3 style={{fontSize:14,fontWeight:700,color:C.g600,marginBottom:8}}>📝 過去の練習問題</h3>
<div style={{display:"grid",gap:8}}>
{rpHistory.map(h=><div key={h.id} style={{padding:10,borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,boxShadow:"0 1px 3px rgba(0,0,0,.05)",cursor:"pointer"}} onClick={()=>{setRpInput(h.situation);setRpResult(h.result)}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<span style={{fontSize:12,fontWeight:700,color:C.pDD}}>{h.situation}</span>
<span style={{fontSize:10,color:C.g400}}>{h.date}</span>
</div>
<div style={{fontSize:11,color:C.g500,marginTop:4,lineHeight:1.3}}>{(h.result||"").substring(0,80)}...</div>
</div>)}
</div>
</div>}
{rpMaterialModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setRpMaterialModal(false)}}>
<div style={{background:"#FFFDF9",borderRadius:16,padding:24,width:"100%",maxWidth:600,maxHeight:"85vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
<h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#5C4A3A"}}>📄 患者向け資料生成（Genspark用プロンプト）</h3>
<button onClick={()=>setRpMaterialModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{marginBottom:16}}>
<p style={{fontSize:13,color:"#8A7A6A",marginBottom:8}}>資料サイズを選択してください:</p>
<div style={{display:"flex",gap:8}}>
<button onClick={()=>setRpMaterialSize("A5")} style={{padding:"8px 20px",borderRadius:10,border:"none",background:rpMaterialSize==="A5"?"#AED9C8":"#f5f5f5",color:rpMaterialSize==="A5"?"#1A5744":"#666",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>A5サイズ（簡潔版）</button>
<button onClick={()=>setRpMaterialSize("A4")} style={{padding:"8px 20px",borderRadius:10,border:"none",background:rpMaterialSize==="A4"?"#C5B8E8":"#f5f5f5",color:rpMaterialSize==="A4"?"#3A2470":"#666",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>A4サイズ（詳細版）</button>
</div>
</div>
<button onClick={generateMaterialPrompt} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"#C4A882",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",marginBottom:16}}>プロンプトを生成</button>
{rpMaterialPrompt&&<div>
<textarea readOnly value={rpMaterialPrompt} style={{width:"100%",height:200,fontSize:11,padding:12,borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50,fontFamily:"inherit",resize:"vertical",color:C.g700,boxSizing:"border-box"}}/>
<button onClick={()=>{navigator.clipboard.writeText(rpMaterialPrompt);window.open("https://genspark.ai","_blank");sSt("📋 コピーしました")}} style={{width:"100%",padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#3A2470,#5A3E9A)",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",marginTop:8}}>📋 コピーしてGensparkで開く</button>
</div>}
</div>
</div>}
{rpStaffModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setRpStaffModal(false)}}>
<div style={{background:"#FFFDF9",borderRadius:16,padding:24,width:"100%",maxWidth:600,maxHeight:"85vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
<h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#5C4A3A"}}>📋 スタッフ指導資料（Genspark用プロンプト）</h3>
<button onClick={()=>setRpStaffModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<p style={{fontSize:13,color:"#8A7A6A",marginBottom:12}}>以下のプロンプトをコピーしてGensparkに貼り付けてください</p>
<textarea readOnly value={rpStaffPrompt} style={{width:"100%",height:250,fontSize:11,padding:12,borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50,fontFamily:"inherit",resize:"vertical",color:C.g700,boxSizing:"border-box",marginBottom:12}}/>
<div style={{display:"flex",gap:8}}>
<button onClick={()=>{navigator.clipboard.writeText(rpStaffPrompt);sSt("📋 コピーしました")}} style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:"#C4A882",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>{navigator.clipboard.writeText(rpStaffPrompt);window.open("https://genspark.ai","_blank");sSt("📋 コピーしました")}} style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:"#8AB8C8",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>🚀 コピーしてGensparkで開く</button>
</div>
</div>
</div>}
</div>)

// === SNS PAGE ===
if(page==="sns")return(<div style={{maxWidth:800,margin:"0 auto",padding:mob?"10px 8px":"20px 16px",background:"#F5F0EB",minHeight:"100vh"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#5C4A3A",margin:0}}>📣 SNS投稿文生成</h2>
<button onClick={()=>setPage("main")} style={{padding:"10px 18px",borderRadius:10,border:"none",background:"#D9CFBF",color:"#6B5A4A",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button>
</div>
<div style={{...card,background:"#FFFDF9",borderRadius:18,border:"none",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
<p style={{fontSize:13,color:"#8A7A6A",marginBottom:12}}>季節や疾患テーマを入力すると、各SNSに最適化された投稿文をAIが生成します。</p>
<div style={{marginBottom:12}}>
<label style={{fontSize:12,fontWeight:600,color:"#6B5A4A",display:"block",marginBottom:6}}>投稿先</label>
<div style={{display:"flex",gap:6}}>
{["Instagram","X","LINE"].map(p=><button key={p} onClick={()=>setSnsPlatform(p)} style={{padding:"8px 18px",borderRadius:24,border:snsPlatform===p?"1px solid #AED9C8":"1px solid #D9CFBF",background:snsPlatform===p?"#AED9C8":"transparent",fontSize:12,fontWeight:snsPlatform===p?700:500,color:snsPlatform===p?"#1A5744":"#8A7A6A",fontFamily:"inherit",cursor:"pointer"}}>{p}</button>)}
</div>
</div>
<div style={{display:"flex",gap:8,marginBottom:12,flexDirection:mob?"column":"row"}}>
<input value={snsInput} onChange={e=>setSnsInput(e.target.value)} placeholder="季節・疾患テーマを入力（例：夏の紫外線対策）" style={{...ib,flex:1,padding:"10px 14px",fontSize:14,border:"1.5px solid #D9CFBF",borderRadius:12}}/>
<button onClick={generateSns} disabled={snsLoading||!snsInput.trim()} style={{padding:"10px 20px",borderRadius:14,border:"none",background:snsLoading?C.g200:"#C4A882",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!snsInput.trim()?.45:1}}>{snsLoading?"⏳ 生成中...":"📣 投稿文を生成"}</button>
</div>
<div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
{["夏の紫外線対策","冬の乾燥肌ケア","花粉症シーズンの肌荒れ","ニキビ予防","シミ・そばかす対策","美容施術のご案内","新メニュー紹介","年末年始の診療案内"].map(s=>(<button key={s} onClick={()=>setSnsInput(s)} style={{padding:"6px 14px",borderRadius:24,border:"1px solid #C4A882",background:"#FAF0E0",fontSize:11,fontWeight:500,color:"#7A5A30",fontFamily:"inherit",cursor:"pointer"}}>{s}</button>))}
</div>
{snsLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #C4A882",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:"#8A7A6A"}}>投稿文を作成中...</span></div>}
{snsResult&&!snsLoading&&<div style={{marginTop:8}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:"#5C4A3A"}}>📣 {snsPlatform} 投稿文</span>
<button onClick={()=>{navigator.clipboard.writeText(snsResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:10,border:"1px solid #67e8f9",background:"#ecfeff",fontSize:12,fontWeight:600,color:"#0891b2",fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
</div>
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{snsResult}</pre>
</div>}
</div>
{snsHistory.length>0&&<div style={{marginTop:16}}>
<h3 style={{fontSize:14,fontWeight:700,color:"#5C4A3A",marginBottom:8}}>📝 過去の生成履歴</h3>
<div style={{display:"grid",gap:8}}>
{snsHistory.map(h=><div key={h.id} style={{padding:10,borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,boxShadow:"0 1px 3px rgba(0,0,0,.05)",cursor:"pointer"}} onClick={()=>{setSnsInput(h.theme);setSnsPlatform(h.platform);setSnsResult(h.result)}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<span style={{fontSize:12,fontWeight:700,color:C.pDD}}>[{h.platform}] {h.theme}</span>
<span style={{fontSize:10,color:C.g400}}>{h.date}</span>
</div>
<div style={{fontSize:11,color:C.g500,marginTop:4,lineHeight:1.3}}>{(h.result||"").substring(0,80)}...</div>
</div>)}
</div>
</div>}
<div style={{marginTop:20}}>
<div style={{...card,background:"#FFFDF9",borderRadius:18,border:"none",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
<h3 style={{fontSize:16,fontWeight:700,color:"#5C4A3A",margin:"0 0 8px"}}>📅 来月のSNS投稿カレンダー生成</h3>
<p style={{fontSize:12,color:"#8A7A6A",marginBottom:12}}>直近50件の診療記録からトレンドを分析し、Instagram・X・LINEの投稿カレンダーを自動生成します。</p>
<button onClick={runContentCalendar} disabled={calLoading} style={{width:"100%",padding:"18px",borderRadius:14,border:"none",background:calLoading?C.g200:"#8AB8C8",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:calLoading?"not-allowed":"pointer"}}>{calLoading?"⏳ カレンダー生成中...":"📅 来月のSNS投稿カレンダーを生成"}</button>
</div>
</div>
{calModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setCalModal(false)}}>
<div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.g200}`}}>
<h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#0891b2"}}>📅 SNS投稿カレンダー</h3>
<button onClick={()=>setCalModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:20}}>
{calLoading&&<div style={{textAlign:"center",padding:40}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #0891b2",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが診療記録を分析してカレンダーを作成中...</span></div>}
{calResult&&!calLoading&&<div>
<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
<button onClick={()=>{navigator.clipboard.writeText(calResult);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #67e8f9",background:"#ecfeff",fontSize:12,fontWeight:600,color:"#0891b2",fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<select value={calFavGroup} onChange={e=>setCalFavGroup(e.target.value)} style={{padding:"6px 10px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontFamily:"inherit",color:C.g600}}>
{FAV_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
</select>
<button onClick={()=>{saveFavorite(calFavGroup,"[SNSカレンダー] "+new Date().toLocaleDateString("ja-JP"),calResult,"");setCalModal(false)}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
</div>
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{calResult}</pre>
</div>}
</div>
</div>
</div>}
</div>)

// === KNOWLEDGE BASE PAGE ===
if(page==="knowledge"){const KB_MODES=[{id:"report",label:"📊 月次品質レポート生成",desc:"直近30件の履歴を分析し品質レポートを作成",color:"#2d6a4f",bg:"#d8f3dc",textColor:"#2d6a4f"},{id:"manual",label:"📖 院内マニュアル生成",desc:"疾患別の外用方法・服薬指導・患者説明をまとめる",color:"#1d4e7a",bg:"#d0e8f5",textColor:"#1d4e7a"},{id:"library",label:"📚 説明文ライブラリ生成",desc:"疾患別に標準説明文・治療方針・注意点を作成",color:"#5a3e8a",bg:"#e8e0f5",textColor:"#5a3e8a"},{id:"training",label:"👥 対応パターン集生成",desc:"新人向けによくある訴えと対応例をまとめる",color:"#7a4010",bg:"#fde8d0",textColor:"#7a4010"}];return(<div style={{maxWidth:800,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>📚 育成・ナレッジベース</h2>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
</div>
<div style={card}>
<p style={{fontSize:13,color:C.g500,marginBottom:16}}>直近30件の診療記録をAIが分析し、スタッフ育成やナレッジ共有に役立つ資料を自動生成します。</p>
<div style={{display:"grid",gap:10,gridTemplateColumns:mob?"1fr":"1fr 1fr"}}>
{KB_MODES.map(m=><button key={m.id} onClick={()=>runKnowledgeBase(m.id)} disabled={kbLoading} style={{padding:"14px 16px",borderRadius:14,border:`1.5px solid ${kbLoading?C.g200:m.color}22`,background:kbLoading?C.g200:m.bg,color:kbLoading?C.g400:m.textColor,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:kbLoading?"not-allowed":"pointer",textAlign:"left",transition:"all 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
<div>{m.label}</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>{m.desc}</div>
</button>)}
</div>
</div>
{kbModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setKbModal(false)}}>
<div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.g200}`}}>
<h3 style={{margin:0,fontSize:16,fontWeight:700,color:C.pDD}}>{kbMode==="report"?"📊 月次品質レポート":kbMode==="manual"?"📖 院内マニュアル":kbMode==="library"?"📚 説明文ライブラリ":"👥 対応パターン集"}</h3>
<button onClick={()=>setKbModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:20}}>
{kbLoading&&<div style={{textAlign:"center",padding:40}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが診療記録を分析中...</span></div>}
{kbResult&&!kbLoading&&<div>
<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
<button onClick={()=>{navigator.clipboard.writeText(kbResult);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<select value={kbFavGroup} onChange={e=>setKbFavGroup(e.target.value)} style={{padding:"6px 10px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontFamily:"inherit",color:C.g600}}>
{FAV_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
</select>
<button onClick={()=>{const title=kbMode==="report"?"[品質レポート]":kbMode==="manual"?"[院内マニュアル]":kbMode==="library"?"[説明文ライブラリ]":"[対応パターン集]";saveFavorite(kbFavGroup,title+" "+new Date().toLocaleDateString("ja-JP"),kbResult,"");setKbModal(false)}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
</div>
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{kbResult}</pre>
</div>}
</div>
</div>
</div>}
<div style={{marginTop:20}}>
<div style={card}>
<h3 style={{fontSize:16,fontWeight:700,color:"#1d4e7a",margin:"0 0 8px"}}>🌐 ホームページコンテンツ生成</h3>
<p style={{fontSize:12,color:C.g500,marginBottom:12}}>直近50件の診療記録を基に、ホームページ掲載用のコンテンツをAIが自動生成します。</p>
<div style={{display:"grid",gap:10,gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr"}}>
<button onClick={()=>runHomepageContent("faq")} disabled={hpLoading} style={{padding:"14px 16px",borderRadius:14,border:"1.5px solid #5a3e8a22",background:hpLoading?C.g200:"#e8e0f5",color:hpLoading?C.g400:"#5a3e8a",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:hpLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
<div>❓ FAQ生成</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>患者目線のQ&A 15問</div>
</button>
<button onClick={()=>runHomepageContent("factsheet")} disabled={hpLoading} style={{padding:"14px 16px",borderRadius:14,border:"1.5px solid #2d6a4f22",background:hpLoading?C.g200:"#d8f3dc",color:hpLoading?C.g400:"#2d6a4f",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:hpLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
<div>📄 疾患ファクトシート生成</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>原因・症状・治療・予防</div>
</button>
<button onClick={()=>runHomepageContent("seasonal")} disabled={hpLoading} style={{padding:"14px 16px",borderRadius:14,border:"1.5px solid #92400e22",background:hpLoading?C.g200:"#fde8d0",color:hpLoading?C.g400:"#92400e",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:hpLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
<div>🌸 季節啓発コンテンツ生成</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>季節性疾患トレンド分析</div>
</button>
</div>
</div>
</div>
{hpModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setHpModal(false)}}>
<div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.g200}`}}>
<h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#1d4e7a"}}>{hpType==="faq"?"❓ FAQ（よくある質問）":hpType==="factsheet"?"📄 疾患ファクトシート":"🌸 季節啓発コンテンツ"}</h3>
<button onClick={()=>setHpModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:20}}>
{hpLoading&&<div style={{textAlign:"center",padding:40}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #2563eb",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが診療記録を分析してコンテンツを生成中...</span></div>}
{hpResult&&!hpLoading&&<div>
<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
<button onClick={()=>{navigator.clipboard.writeText(hpResult);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<select value={hpFavGroup} onChange={e=>setHpFavGroup(e.target.value)} style={{padding:"6px 10px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontFamily:"inherit",color:C.g600}}>
{FAV_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
</select>
<button onClick={()=>{const title=hpType==="faq"?"[HP FAQ]":hpType==="factsheet"?"[疾患ファクトシート]":"[季節啓発コンテンツ]";saveFavorite(hpFavGroup,title+" "+new Date().toLocaleDateString("ja-JP"),hpResult,"");setHpModal(false)}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
</div>
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{hpResult}</pre>
</div>}
</div>
</div>
</div>}
<div style={{marginTop:20}}>
<div style={card}>
<h3 style={{fontSize:16,fontWeight:700,color:"#7a4010",margin:"0 0 8px"}}>🤝 患者体験改善</h3>
<p style={{fontSize:12,color:C.g500,marginBottom:12}}>直近50件の診療記録から患者体験の改善ポイントをAIが分析します。</p>
<div style={{display:"grid",gap:10,gridTemplateColumns:mob?"1fr":"1fr 1fr"}}>
<button onClick={()=>runPatientExperience("patient")} disabled={pxLoading} style={{padding:"14px 16px",borderRadius:14,border:"1.5px solid #5a3e8a22",background:pxLoading?C.g200:"#e8e0f5",color:pxLoading?C.g400:"#5a3e8a",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:pxLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
<div>😊 患者ニーズ・不安分析</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>訴えTOP10と満足度向上提案</div>
</button>
<button onClick={()=>runPatientExperience("training")} disabled={pxLoading} style={{padding:"14px 16px",borderRadius:14,border:"1.5px solid #2d6a4f22",background:pxLoading?C.g200:"#d8f3dc",color:pxLoading?C.g400:"#2d6a4f",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:pxLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
<div>💬 説明方法改善提案</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>対応パターンと説明改善</div>
</button>
</div>
</div>
</div>
{pxModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setPxModal(false)}}>
<div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.g200}`}}>
<h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#e11d48"}}>{pxType==="patient"?"😊 患者ニーズ・不安分析":"💬 説明方法改善提案"}</h3>
<button onClick={()=>setPxModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:20}}>
{pxLoading&&<div style={{textAlign:"center",padding:40}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #e11d48",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが診療記録を分析中...</span></div>}
{pxResult&&!pxLoading&&<div>
<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
<button onClick={()=>{navigator.clipboard.writeText(pxResult);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<select value={pxFavGroup} onChange={e=>setPxFavGroup(e.target.value)} style={{padding:"6px 10px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontFamily:"inherit",color:C.g600}}>
{FAV_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
</select>
<button onClick={()=>{const title=pxType==="patient"?"[患者ニーズ分析]":"[説明方法改善]";saveFavorite(pxFavGroup,title+" "+new Date().toLocaleDateString("ja-JP"),pxResult,"");setPxModal(false)}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
</div>
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{pxResult}</pre>
</div>}
</div>
</div>
</div>}

{/* ⑦ 診療哲学抽出 */}
<div style={{marginTop:20}}>
  <div style={card}>
    <h3 style={{fontSize:16,fontWeight:700,color:"#7c3aed",margin:"0 0 8px"}}>🌟 診療哲学・クリニックらしさの抽出</h3>
    <p style={{fontSize:12,color:C.g500,marginBottom:12}}>診療記録・カウンセリング記録をAIが分析し、当院独自の診療哲学・価値観・強みを言語化します。ミッション策定・ブランディング・ホームページコピーの素材として活用できます。</p>
    <button onClick={runPhilosophy} disabled={philLoading} style={{width:"100%",padding:"18px",borderRadius:14,border:"1.5px solid #5a3e8a22",background:philLoading?C.g200:"#e8e0f5",color:philLoading?C.g400:"#5a3e8a",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:philLoading?"not-allowed":"pointer",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
      {philLoading?"⏳ 分析中...":"🌟 診療哲学・クリニックらしさを抽出する"}
    </button>
  </div>
</div>

{/* ⑨ 採用ペルソナ生成 */}
<div style={{marginTop:20}}>
  <div style={card}>
    <h3 style={{fontSize:16,fontWeight:700,color:"#0891b2",margin:"0 0 8px"}}>🤝 採用ペルソナ・求人票素材の生成</h3>
    <p style={{fontSize:12,color:C.g500,marginBottom:12}}>議事録・タスク実績をAIが分析し、当院で活躍できる人材像・求人票のコピー・面接評価基準を自動生成します。採用の属人化を防ぎ、ミスマッチを減らします。</p>
    <button onClick={runPersona} disabled={personaLoading} style={{width:"100%",padding:"18px",borderRadius:14,border:"1.5px solid #1d4e7a22",background:personaLoading?C.g200:"#d0e8f5",color:personaLoading?C.g400:"#1d4e7a",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:personaLoading?"not-allowed":"pointer",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
      {personaLoading?"⏳ 分析中...":"🤝 採用ペルソナ・求人票素材を生成する"}
    </button>
  </div>
</div>

{/* 診療哲学モーダル */}
{philModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setPhilModal(false)}}>
  <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.g200}`}}>
      <h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#7c3aed"}}>🌟 診療哲学・クリニックらしさ</h3>
      <button onClick={()=>setPhilModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
    </div>
    <div style={{flex:1,overflow:"auto",padding:20}}>
      {philLoading&&<div style={{textAlign:"center",padding:40}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #7c3aed",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>診療記録・カウンセリング記録を分析中...</span></div>}
      {philResult&&!philLoading&&<div>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
          <button onClick={()=>{navigator.clipboard.writeText(philResult);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
          <button onClick={()=>{saveFavorite("その他","[診療哲学] "+new Date().toLocaleDateString("ja-JP"),philResult,"");setPhilModal(false)}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
        </div>
        <pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{philResult}</pre>
      </div>}
    </div>
  </div>
</div>}

{/* 採用ペルソナモーダル */}
{personaModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setPersonaModal(false)}}>
  <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.g200}`}}>
      <h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#0891b2"}}>🤝 採用ペルソナ・求人票素材</h3>
      <button onClick={()=>setPersonaModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
    </div>
    <div style={{flex:1,overflow:"auto",padding:20}}>
      {personaLoading&&<div style={{textAlign:"center",padding:40}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #0891b2",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>議事録・タスク実績を分析中...</span></div>}
      {personaResult&&!personaLoading&&<div>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
          <button onClick={()=>{navigator.clipboard.writeText(personaResult);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
          <button onClick={()=>{saveFavorite("その他","[採用ペルソナ] "+new Date().toLocaleDateString("ja-JP"),personaResult,"");setPersonaModal(false)}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
        </div>
        <pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{personaResult}</pre>
      </div>}
    </div>
  </div>
</div>}

{/* ⑧ 症例ポートフォリオ自動生成 */}
<div style={{marginTop:20}}>
  <div style={card}>
    <h3 style={{fontSize:16,fontWeight:700,color:"#059669",margin:"0 0 8px"}}>📖 症例ポートフォリオ自動生成</h3>
    <p style={{fontSize:12,color:C.g500,marginBottom:12}}>お気に入りに保存した症例データをAIが整理し、施術ごとの症例集・ビフォーアフター傾向・よくある相談パターンをまとめます。ホームページ・院内掲示・スタッフ教育の素材として活用できます。</p>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      {["美容","保険","カウンセリング","治療説明","美容施術説明","その他"].map(g=>(
        <button key={g} onClick={()=>setPortfolioGroup(g)} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${portfolioGroup===g?"#059669":C.g200}`,background:portfolioGroup===g?"#d1fae5":C.w,fontSize:12,fontWeight:portfolioGroup===g?700:500,color:portfolioGroup===g?"#065f46":C.g500,fontFamily:"inherit",cursor:"pointer"}}>{g}</button>
      ))}
    </div>
    <button onClick={()=>runPortfolio(portfolioGroup)} disabled={portfolioLoading} style={{width:"100%",padding:"18px",borderRadius:14,border:"1.5px solid #2d6a4f22",background:portfolioLoading?C.g200:"#d8f3dc",color:portfolioLoading?C.g400:"#2d6a4f",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:portfolioLoading?"not-allowed":"pointer",boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
      {portfolioLoading?"⏳ 生成中...":"📖 「"+portfolioGroup+"」グループの症例ポートフォリオを生成"}
    </button>
  </div>
</div>

{/* 症例ポートフォリオモーダル */}
{portfolioModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setPortfolioModal(false)}}>
  <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.g200}`}}>
      <h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#059669"}}>📖 症例ポートフォリオ — {portfolioGroup}</h3>
      <button onClick={()=>setPortfolioModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
    </div>
    <div style={{flex:1,overflow:"auto",padding:20}}>
      {portfolioLoading&&<div style={{textAlign:"center",padding:40}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #059669",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>お気に入りデータを分析して症例集を生成中...</span></div>}
      {portfolioResult&&!portfolioLoading&&<div>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
          <button onClick={()=>{navigator.clipboard.writeText(portfolioResult);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
          <button onClick={()=>{saveFavorite("その他","[症例ポートフォリオ:"+portfolioGroup+"] "+new Date().toLocaleDateString("ja-JP"),portfolioResult,"");setPortfolioModal(false)}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
        </div>
        <pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{portfolioResult}</pre>
      </div>}
    </div>
  </div>
</div>}
</div>)}

// === SATISFACTION ANALYSIS PAGE ===
if(page==="satisfaction")return(<div style={{maxWidth:800,margin:"0 auto",padding:mob?"10px 8px":"20px 16px",background:"#F5F0EB",minHeight:"100vh"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#5C4A3A",margin:0}}>📊 患者満足度分析</h2>
<button onClick={()=>setPage("main")} style={{padding:"10px 18px",borderRadius:10,border:"none",background:"#D9CFBF",color:"#6B5A4A",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button>
</div>
<div style={{...card,background:"#FFFDF9",borderRadius:18,border:"none",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
<p style={{fontSize:13,color:"#8A7A6A",marginBottom:12}}>診療記録とカウンセリング記録（直近30件ずつ）をAIが分析し、患者の関心・不安・改善ポイントを可視化します。</p>
<button onClick={runSatisfactionAnalysis} disabled={satLoading} style={{width:"100%",padding:"18px",borderRadius:14,border:"none",background:satLoading?C.g200:"#C4A882",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:satLoading?"not-allowed":"pointer",marginBottom:12}}>{satLoading?"⏳ 分析中...":"📊 満足度分析を実行"}</button>
{satLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #C4A882",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:"#8A7A6A"}}>AIが記録を分析中...</span></div>}
{satResult&&!satLoading&&<div>
<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
<button onClick={()=>{navigator.clipboard.writeText(satResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
</div>
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{satResult}</pre>
</div>}
</div>
<div style={{marginTop:20}}>
<div style={{...card,background:"#FFFDF9",borderRadius:18,border:"none",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
<h3 style={{fontSize:16,fontWeight:700,color:"#5C4A3A",margin:"0 0 8px"}}>📈 トレンド・統計レポート</h3>
<p style={{fontSize:12,color:"#8A7A6A",marginBottom:12}}>直近100件の診療記録からデータ分析・統計レポートをAIが自動生成します。</p>
<div style={{display:"grid",gap:10,gridTemplateColumns:mob?"1fr":"1fr 1fr"}}>
<button onClick={()=>runTrendReport("trend")} disabled={trLoading} style={{padding:"18px 20px",borderRadius:14,border:"none",background:trLoading?C.g200:"#AED9C8",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:trLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.08)"}}>
<div style={{color:"#1A5744"}}>📅 疾患トレンド分析</div>
<div style={{fontSize:11,fontWeight:400,marginTop:4,color:"#2D7A63"}}>月別・季節別の疾患傾向と予測</div>
</button>
<button onClick={()=>runTrendReport("drugs")} disabled={trLoading} style={{padding:"18px 20px",borderRadius:14,border:"none",background:trLoading?C.g200:"#F2C9A8",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:trLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.08)"}}>
<div style={{color:"#7A3D14"}}>💊 処方・処置ランキング</div>
<div style={{fontSize:11,fontWeight:400,marginTop:4,color:"#A0562A"}}>薬品・処置TOP10と在庫参考</div>
</button>
<button onClick={()=>runTrendReport("patient")} disabled={trLoading} style={{padding:"18px 20px",borderRadius:14,border:"none",background:trLoading?C.g200:"#C5B8E8",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:trLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.08)"}}>
<div style={{color:"#3A2470"}}>👥 患者ニーズ分析</div>
<div style={{fontSize:11,fontWeight:400,marginTop:4,color:"#5A3E9A"}}>訴え・不安パターンと改善提案</div>
</button>
<button onClick={()=>runTrendReport("summary")} disabled={trLoading} style={{padding:"18px 20px",borderRadius:14,border:"none",background:trLoading?C.g200:"#F4A8A8",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:trLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.08)"}}>
<div style={{color:"#7A1A1A"}}>📊 経営サマリー</div>
<div style={{fontSize:11,fontWeight:400,marginTop:4,color:"#A03030"}}>疾患構成・治療傾向・改善提案</div>
</button>
</div>
</div>
</div>
{trModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setTrModal(false)}}>
<div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.g200}`}}>
<h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#0891b2"}}>{trType==="trend"?"📅 疾患トレンド分析":trType==="drugs"?"💊 処方・処置ランキング":trType==="patient"?"👥 患者ニーズ分析":"📊 経営サマリー"}</h3>
<button onClick={()=>setTrModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:20}}>
{trLoading&&<div style={{textAlign:"center",padding:40}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #0891b2",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>⏳ 分析中... ({trCount}件)</span></div>}
{trResult&&!trLoading&&<div>
<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
<button onClick={()=>{navigator.clipboard.writeText(trResult);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<select value={trFavGroup} onChange={e=>setTrFavGroup(e.target.value)} style={{padding:"6px 10px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontFamily:"inherit",color:C.g600}}>
{FAV_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
</select>
<button onClick={()=>{const title=trType==="trend"?"[疾患トレンド]":trType==="drugs"?"[処方ランキング]":trType==="patient"?"[患者ニーズ]":"[経営サマリー]";saveFavorite(trFavGroup,title+" "+new Date().toLocaleDateString("ja-JP"),trResult,"");setTrModal(false)}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
</div>
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{trResult}</pre>
</div>}
</div>
</div>
</div>}

{/* ① 患者インサイト分析ダッシュボード */}
<div style={{marginTop:20}}>
  <div style={{...card,background:"#FFFDF9",borderRadius:18,border:"none",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>
    <h3 style={{fontSize:16,fontWeight:700,color:"#1e40af",margin:"0 0 8px"}}>🔭 患者インサイト分析ダッシュボード</h3>
    <p style={{fontSize:12,color:"#8A7A6A",marginBottom:12,lineHeight:1.6}}>診療記録・カウンセリング・症例データを横断的にAIが分析し、マーケティング戦略・集客改善・季節対策・患者層の深掘りを行います。</p>
    <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
      {[
        {id:"full",label:"🔭 総合インサイト"},
        {id:"marketing",label:"📣 マーケティング戦略"},
        {id:"seasonal",label:"🌸 季節・トレンド予測"},
        {id:"segment",label:"👥 患者セグメント分析"},
        {id:"revenue",label:"💰 収益改善提案"}
      ].map(m=>(
        <button key={m.id} onClick={()=>setInsightMode(m.id)} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${insightMode===m.id?"#1e40af":"#e5e7eb"}`,background:insightMode===m.id?"#eff6ff":"#fff",fontSize:12,fontWeight:insightMode===m.id?700:500,color:insightMode===m.id?"#1e40af":"#64748b",fontFamily:"inherit",cursor:"pointer"}}>{m.label}</button>
      ))}
    </div>
    <button onClick={()=>runInsightDashboard(insightMode)} disabled={insightLoading} style={{width:"100%",padding:"18px",borderRadius:14,border:"none",background:insightLoading?"#e2e8f0":"linear-gradient(135deg,#1e40af,#3b82f6)",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:insightLoading?"not-allowed":"pointer",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
      {insightLoading?"⏳ 分析中...":"🔭 患者インサイトを分析する"}
    </button>
  </div>
</div>

{/* 患者インサイトモーダル */}
{insightModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setInsightModal(false)}}>
  <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #e2e8f0"}}>
      <h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#1e40af"}}>
        {insightMode==="full"?"🔭 総合インサイト":insightMode==="marketing"?"📣 マーケティング戦略":insightMode==="seasonal"?"🌸 季節・トレンド予測":insightMode==="segment"?"👥 患者セグメント分析":"💰 収益改善提案"}
      </h3>
      <button onClick={()=>setInsightModal(false)} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:12,fontWeight:600,color:"#64748b",fontFamily:"inherit",cursor:"pointer"}}>✕</button>
    </div>
    <div style={{flex:1,overflow:"auto",padding:20}}>
      {insightLoading&&<div style={{textAlign:"center",padding:40}}>
        <div style={{width:32,height:32,border:"3px solid #e2e8f0",borderTop:"3px solid #1e40af",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/>
        <span style={{color:"#64748b"}}>診療・カウンセリング・症例データを横断分析中...</span>
      </div>}
      {insightResult&&!insightLoading&&<div>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
          <button onClick={()=>{navigator.clipboard.writeText(insightResult);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #e2e8f0",background:"#fff",fontSize:12,fontWeight:600,color:"#1e40af",fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
          <button onClick={()=>{const title=insightMode==="full"?"[総合インサイト]":insightMode==="marketing"?"[マーケティング戦略]":insightMode==="seasonal"?"[季節トレンド予測]":insightMode==="segment"?"[患者セグメント]":"[収益改善提案]";saveFavorite("その他",title+" "+new Date().toLocaleDateString("ja-JP"),insightResult,"");setInsightModal(false)}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
        </div>
        <pre style={{fontSize:13,color:"#1e293b",whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.8,fontFamily:"inherit",background:"#f8fafc",padding:14,borderRadius:12}}>{insightResult}</pre>
      </div>}
    </div>
  </div>
</div>}
</div>)

// === DOC GENERATION ===
if(page==="doc")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{prog>0&&<div style={{width:"100%",height:5,background:"rgba(160,220,100,0.2)",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#3a6820)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>📄 説明資料の作成</h2><span style={{fontSize:10,color:C.g400,fontWeight:500,marginLeft:8}}>{geminiModel||"Gemini 3.5 Flash"}</span><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>疾患名や施術名を入力すると、当院の診療履歴をAIが参照して患者向け説明資料を自動生成します。</p>
<div style={{display:"flex",gap:8,marginBottom:12,flexDirection:mob?"column":"row"}}>
<input value={docDisease} onChange={e=>setDocDisease(e.target.value)} placeholder="疾患名・施術名を入力（例：アトピー性皮膚炎、ポテンツァ）" style={{...ib,flex:1,padding:"10px 14px",fontSize:14}}/>
<button onClick={generateDoc} disabled={docLd||!docDisease.trim()} style={{padding:"10px 20px",borderRadius:14,border:"none",background:docLd?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!docDisease.trim()?.45:1}}>
{docLd?"⏳ 生成中...":"✨ 生成"}</button></div>
<div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
{["アトピー性皮膚炎","ざ瘡（ニキビ）","蕁麻疹","乾癬","帯状疱疹","尋常性疣贅","脂漏性皮膚炎","円形脱毛症","白斑","酒さ","シミ・肝斑","医療脱毛","ポテンツァ","ノーリス（IPL）","ゼオスキン","ピーリング","外用方法の説明","皮膚腫瘍切除術後の注意点","レーザー施術後の注意点","ピーリング後の注意点"].map(d=>(<button key={d} onClick={()=>{setDocDisease(d)}} style={{padding:"3px 10px",borderRadius:8,border:`1px solid ${C.p}44`,background:C.pLL,fontSize:11,fontWeight:500,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>{d}</button>))}
</div>
<div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
{[{v:"ja",l:"🇯🇵 日本語"},{v:"en",l:"🇺🇸 English"},{v:"zh",l:"🇨🇳 中文"},{v:"ko",l:"🇰🇷 한국어"},{v:"th",l:"🇹🇭 ไทย"}].map(({v,l})=>(
<button key={v} onClick={()=>setDocLang(v)} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${docLang===v?C.pD:C.g200}`,background:docLang===v?C.pLL:"#fff",fontSize:11,fontWeight:600,color:docLang===v?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{l}</button>
))}
<button onClick={()=>setQModal(true)} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.g200}`,background:"#fff",fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer",marginLeft:"auto"}}>📄 問診票生成</button>
</div>
<textarea value={docFreePrompt} onChange={e=>setDocFreePrompt(e.target.value)} placeholder="追加指示（任意）：例「小児向けに平易な表現で」「治療費の目安欄も追加して」" rows={2} style={{...ib,width:"100%",padding:"8px 12px",fontSize:13,marginBottom:12,resize:"vertical",boxSizing:"border-box"}}/>
{docLd&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが履歴を分析して説明資料を作成中...</span></div>}
{docOut&&<div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>📋 {docDisease} 説明資料</span>
<button onClick={()=>{navigator.clipboard.writeText(docOut)}} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.p}44`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button></div>
<textarea value={docOut} onChange={e=>setDocOut(e.target.value)} style={{width:"100%",height:400,padding:14,borderRadius:12,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.8,boxSizing:"border-box"}}/>
</div>}
</div></div>);

// === MINUTES ===
if(page==="minutes")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{prog>0&&<div style={{width:"100%",height:5,background:"rgba(160,220,100,0.2)",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#3a6820)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}><h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>📝 議事録まとめ</h2><span style={{fontSize:10,color:C.g400,fontWeight:500,marginLeft:8}}>{geminiModel||"Gemini 3.5 Flash"}</span><button onClick={()=>{minStop();setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
{st&&st!=="待機中"&&<div style={{fontSize:12,color:st.includes("✓")?"#22c55e":st.includes("エラー")?"#ef4444":"#f59e0b",fontWeight:600,marginBottom:8,textAlign:"center",padding:"4px 8px",borderRadius:8,background:st.includes("✓")?"#f0fdf4":st.includes("エラー")?"#fef2f2":"#fffbeb"}}>{st}</div>}
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>会議やミーティングを録音・書き起こしし、AIが議事録を自動作成します。</p>
<input value={minTitle} onChange={e=>setMinTitle(e.target.value)} placeholder="議事録タイトル（例：2月定例ミーティング）" style={{width:"100%",padding:"8px 12px",borderRadius:10,border:`1.5px solid ${C.g200}`,fontSize:14,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>
<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"8px 12px",borderRadius:10,border:`1px solid ${minAudioSave?C.p:C.g200}`,background:minAudioSave?C.pLL:C.g50}}>
<span style={{fontSize:13,fontWeight:600,color:C.pD}}>🎙️ 音声保存</span>
<button onClick={()=>setMinAudioSave(v=>!v)} style={{padding:"4px 16px",borderRadius:8,border:"none",background:minAudioSave?C.rG:C.g200,color:minAudioSave?C.w:C.g500,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>
{minAudioSave?"ON":"OFF"}
</button>
<span style={{fontSize:11,color:minAudioSave?C.pD:C.g400}}>
{minAudioSave?"録音停止時にSupabaseへ自動保存（約30〜60MB/時間）":"音声は保存されません"}
</span>
</div>
<div style={{marginBottom:10}}>
<div style={{fontSize:12,fontWeight:600,color:C.g600,marginBottom:6}}>要約モデル</div>
<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
{[{v:"gemini-3-pro",label:"Gemini 3.1 Pro",desc:"最新・最高精度 ⭐"},{v:"gemini-3-5-flash",label:"Gemini 3.5 Flash ✨",desc:"最新・超高速"},{v:"claude",label:"Claude Sonnet 4.6",desc:"日本語精度"}].map(m=>{const sel=minutesModel===m.v;return(
<button key={m.v} onClick={()=>{setMinutesModel(m.v);try{localStorage.setItem("mk_minutesModel",m.v)}catch{}}} disabled={minLd} style={{flex:"1 1 140px",padding:"8px 10px",borderRadius:10,border:sel?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:sel?C.pLL:C.w,fontSize:12,fontWeight:sel?700:500,color:sel?C.pD:C.g500,cursor:minLd?"not-allowed":"pointer",fontFamily:"inherit",textAlign:"center"}}>
<div>{m.label}</div><div style={{fontSize:10,marginTop:2,fontWeight:400,opacity:0.8}}>{m.desc}</div>
</button>
)})}
</div>
</div>
<textarea value={minPrompt} onChange={e=>setMinPrompt(e.target.value)} placeholder="AIへの追加指示（任意）：例「院内勉強会の形式で」「スタッフミーティング用に簡潔に」" rows={2} style={{...ib,width:"100%",padding:"8px 12px",fontSize:13,marginBottom:10,resize:"vertical",boxSizing:"border-box"}}/>
<RecoveryBanner mode="minutes"/>
<DiagRow active={minRS!=="inactive"}/>
<div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
<span style={{fontSize:24,fontWeight:700,fontVariantNumeric:"tabular-nums",color:C.pD}}>{String(Math.floor(minEl/60)).padStart(2,"0")}:{String(minEl%60).padStart(2,"0")}</span>
{(autosaveAt||{}).minutes?<span style={{fontSize:10,color:C.g400}}>💾 自動保存: {new Date(autosaveAt.minutes).toLocaleTimeString("ja-JP")}</span>:null}
{minRS==="inactive"?<div style={{display:"flex",gap:8,alignItems:"center",minHeight:50,flexWrap:"wrap",justifyContent:"center"}}>
<button onClick={minGo} style={{padding:"10px 24px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:120,whiteSpace:"nowrap"}}>🎙 録音開始</button>
{minInp.trim()&&!minOut&&<button onClick={minSum} style={{padding:"10px 20px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:120,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>✨ 要約作成</button>}
{minInp.trim()&&!minLd&&<button onClick={saveMinInputOnly} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${C.g200}`,background:"#fff",fontSize:12,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>📝 書き起こしを保存</button>}
{minOut.trim()&&!minOut.startsWith("エラー")&&!minLd&&<button onClick={saveMinOutputOnly} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${C.p}`,background:C.pLL,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>📋 要約を保存</button>}
<button onClick={minNext} style={{padding:"10px 24px",borderRadius:14,border:"2px solid "+C.p,background:C.w,color:C.pD,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 2px 6px rgba(0,0,0,.12)"}}>次へ ▶</button></div>
:minRS==="paused"?<div style={{display:"flex",gap:8,alignItems:"center",minHeight:50,flexWrap:"wrap",justifyContent:"center"}}>
<button onClick={resumeMin} style={{padding:"10px 20px",borderRadius:14,border:"none",background:C.rG,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:100,whiteSpace:"nowrap"}}>▶ 再開</button>
<button onClick={minSum} style={{padding:"10px 20px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:140,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>✓ 停止して要約</button><button type="button" onClick={minStopAndSaveOnly} style={{padding:"10px 18px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#0f9d6e,#10b981)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:140,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>💾 停止して内容を保存</button>
<button type="button" onClick={minPauseSaveAndNext} disabled={minSavingNext} style={{padding:"10px 18px",borderRadius:14,border:"2px solid #0f9d6e",background:"#ecfdf5",color:"#0f766e",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:minSavingNext?"wait":"pointer",minWidth:140,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>{minSavingNext?"💾 保存中...":"💾 保存して次へ"}</button>
<button type="button" onClick={minPauseDiscardAndNext} disabled={minSavingNext} style={{padding:"10px 18px",borderRadius:14,border:`1px solid ${C.g300}`,background:"#fff",color:"#dc2626",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:minSavingNext?"not-allowed":"pointer",minWidth:140,whiteSpace:"nowrap"}}>🗑 保存せずに次へ</button></div>
:<div style={{display:"flex",gap:8,alignItems:"center",minHeight:50,flexWrap:"wrap",justifyContent:"center"}}>
<button onClick={pauseMin} style={{padding:"10px 16px",borderRadius:14,border:"none",background:"#fbbf24",color:"#78350f",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:100,whiteSpace:"nowrap"}}>⏸ 一時停止</button>
<button onClick={minSum} style={{padding:"10px 20px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:140,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>✓ 停止して要約</button><button type="button" onClick={minStopAndSaveOnly} style={{padding:"10px 18px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#0f9d6e,#10b981)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:140,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>💾 停止して内容を保存</button>
</div>}
<span style={{fontSize:12,color:minRS==="recording"?C.rG:minRS==="paused"?C.warn:C.g400,fontWeight:600}}>{minRS==="recording"?"● 録音中":minRS==="paused"?"⏸ 一時停止中":"停止"}</span>
{(minRS==="recording"||minRS==="paused")&&<div style={{flex:"1 1 200px",minWidth:120,maxWidth:300,height:10,background:C.g100||"#f0f0f0",borderRadius:5,overflow:"hidden",border:`1px solid ${C.g200}`}}><div style={{width:`${Math.min(100,lv)}%`,height:"100%",background:lv>40?"#10b981":lv>10?"#f59e0b":"#94a3b8",transition:"width 120ms linear, background 200ms"}}/></div>}
{(minRS==="recording"||minRS==="paused")&&minInp.trim()&&
<button onClick={()=>saveMinDraft(false)} disabled={minAutoSaving} style={{padding:"6px 14px",borderRadius:10,border:`1px solid ${C.p}`,background:C.pLL,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:minAutoSaving?"wait":"pointer",whiteSpace:"nowrap"}}>
{minAutoSaving?"💾 保存中...":"💾 今すぐ保存"}
</button>}
{minAutoSaving&&<span style={{fontSize:11,color:C.g400,fontWeight:600}}>💾 自動保存中...</span>}
{minDraftId&&!minAutoSaving&&minRS!=="inactive"&&<span style={{fontSize:11,color:C.pD,fontWeight:600}}>✓ 保存済み（30分毎に自動更新）</span>}
</div>
<div style={{marginBottom:12}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,gap:6,flexWrap:"wrap"}}><span style={{fontSize:12,fontWeight:600,color:C.g500,whiteSpace:"nowrap",flexShrink:0}}>書き起こし（10秒間隔）</span><div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
<span style={{fontSize:10,color:C.g400,fontWeight:600,whiteSpace:"nowrap"}}>高さ:</span>
{[[120,"小"],[240,"中"],[480,"大"]].map(([h,label])=><button key={h} type="button" onClick={()=>{setMinTaHeight(h);try{localStorage.setItem("mk_minTranscriptHeight",String(h))}catch{}}} style={{padding:"2px 7px",borderRadius:6,border:minTaHeight===h?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:minTaHeight===h?C.pLL:C.w,fontSize:10,fontWeight:minTaHeight===h?700:500,color:minTaHeight===h?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>{label}</button>)}
<button onClick={async()=>{
const t=minInp;
if(!t||!t.trim()){sSt("書き起こしテキストがありません");return}
setMinTypoLd(true);sSt("🔍 書き起こしAI校正中...");
try{
const r=await fetch("/api/minutes-typos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t,dictionary:dict.map(([from,to])=>({from,to}))})});
const d=await r.json();
if(d.error){sSt("校正エラー: "+d.error);return}
if(!d.corrections||d.corrections.length===0){sSt("✓ 専門用語の誤りは見つかりませんでした");return}
const registeredFroms=new Set(dict.map(([f])=>f));
const newCorrections=d.corrections.filter(c=>!registeredFroms.has(c.from));
if(newCorrections.length===0){sSt("✓ 新しい誤字候補はありません（全て登録済み）");return}
const sel={};
newCorrections.forEach((c,i)=>{if(c.candidates&&c.candidates.length===1)sel[i]=0});
setTypoSelections(sel);setTypoCustomInputs({});setTypoTarget("minInp");setTypoModal(newCorrections);
sSt("校正候補が見つかりました");
}catch(e){sSt("校正エラー: "+e.message)}
finally{setMinTypoLd(false)}
}} disabled={minTypoLd} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #a78bfa",background:"#f5f3ff",fontSize:11,fontWeight:600,color:"#5a3e8a",fontFamily:"inherit",cursor:minTypoLd?"wait":"pointer",whiteSpace:"nowrap"}}>
{minTypoLd?"🔍...":"🔬 用語スキャン"}
</button>
<span style={{fontSize:11,color:C.g400,whiteSpace:"nowrap"}}>{minInp.length>0?Math.ceil(minInp.length/40)+"行":"未入力"}</span>
{minInp.trim()&&<button type="button" disabled={cleaningTx} onClick={()=>manualClean(minInp,(c)=>{setMinInp(c);minIR.current=c},"min")} style={{fontSize:13,color:'#7c3aed',background:'#f5f3ff',border:'1px solid #ddd6fe',borderRadius:6,padding:'4px 10px',cursor:cleaningTx?'wait':'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>{cleanBtnLabel('✨ 書き起こしを補正')}</button>}{undoCleanBtn("min")}
{minInp&&<button type="button" onClick={()=>setMinInp('')} style={{fontSize:13,color:'#c0392b',background:'#fff0f0',border:'1px solid #f0c0c0',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>🗑 クリア</button>}
</div></div>
<textarea value={minInp} onChange={e=>setMinInp(e.target.value)} placeholder="録音開始すると自動で書き起こされます。手動入力も可能です。" style={{width:"100%",height:minTaHeight,padding:10,borderRadius:12,border:`1px solid ${C.g200}`,background:C.g50,fontSize:13,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/></div>
{asrEngine==="avalon"&&avalonFellBack&&<div style={{marginTop:8,padding:"8px 12px",borderRadius:10,border:"1px solid #fde68a",background:"#fef9c3",fontSize:12,color:"#92400e",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
<span>⚠️ Avalon に接続できず Whisper で書き起こしました{avalonFellBackReason?`（理由: ${avalonFellBackReason}）`:"（AQUA_API_KEY未設定/エンドポイント/Avalon障害のいずれか）"}。</span>
<button type="button" onClick={()=>{setAvalonFellBack(false);setAvalonFellBackReason("")}} style={{fontSize:11,color:"#92400e",background:"#fff",border:"1px solid #fde68a",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>閉じる</button>
</div>}
{asrEngine==="both"&&<div style={{marginTop:10,padding:12,borderRadius:12,border:"1px solid #fbcfe8",background:"#fff7fb"}}>
<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
<span style={{fontSize:13,fontWeight:700,color:"#be123c"}}>⚖️ A/B検証: Whisper vs Avalon</span>
{abAvalonError&&(abAvalonIOS?<span style={{fontSize:11,color:"#1d4ed8",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:6,padding:"2px 8px"}}>ℹ️ {abAvalonError}</span>:<span style={{fontSize:11,color:"#b91c1c",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:6,padding:"2px 8px"}}>⚠️ Avalon 接続失敗: {abAvalonError}（Whisperで穴埋めしていません）</span>)}
{(abWhisper||abAvalon||abAvalonError)&&<button type="button" onClick={()=>{setAbWhisper("");setAbAvalon("");setAbWhisperMs(0);setAbAvalonMs(0);setAbFallback(false);setAbAvalonError("");setAbAvalonIOS(false)}} style={{fontSize:11,color:"#c0392b",background:"#fff0f0",border:"1px solid #f0c0c0",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>🗑 比較結果クリア</button>}
</div>
<div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
<div style={{flex:1,minWidth:280}}>
<div style={{fontSize:12,color:"#666",marginBottom:4}}>Whisper（{abWhisper.length}文字 / 累計{abWhisperMs}ms）</div>
<textarea value={abWhisper} readOnly placeholder="（両方比較で録音すると Whisper の結果がここに表示されます）" style={{width:"100%",minHeight:160,padding:10,borderRadius:10,border:"1px solid #e5e7eb",background:"#fff",fontSize:13,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/>
</div>
<div style={{flex:1,minWidth:280}}>
<div style={{fontSize:12,color:"#666",marginBottom:4}}>Avalon（{abAvalon.length}文字 / 累計{abAvalonMs}ms）{abAvalonError&&(abAvalonIOS?<span style={{color:"#1d4ed8",fontWeight:700}}> ・iOS非対応</span>:<span style={{color:"#b91c1c",fontWeight:700}}> ・接続失敗</span>)}</div>
<textarea value={abAvalonError?(abAvalonIOS?`ℹ️ ${abAvalonError}\n\n（iPhone/iPadではAvalonが扱えない音声形式のため、左のWhisperのみで書き起こしています。PCではAvalon列も表示されます）`:`⚠️ Avalon 接続失敗: ${abAvalonError}\n\n（このモードではWhisperの文字で穴埋めしません。設定/キー/エンドポイントを確認してください）${abAvalon?"\n\n--- これまでの成功分 ---\n"+abAvalon:""}`):abAvalon} readOnly placeholder="（両方比較で録音すると Avalon の結果がここに表示されます）" style={{width:"100%",minHeight:160,padding:10,borderRadius:10,border:abAvalonError?(abAvalonIOS?"1px solid #bfdbfe":"1px solid #fecaca"):"1px solid #ddd6fe",background:abAvalonError?(abAvalonIOS?"#f5f9ff":"#fff7f7"):"#fff",fontSize:13,color:abAvalonError?(abAvalonIOS?"#1d4ed8":"#b91c1c"):C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/>
</div>
</div>
<p style={{fontSize:11,color:C.g400,margin:"8px 0 0"}}>※ A/B検証はまずテスト音声で。患者会話に使う前に Aqua のプライバシー方針（学習利用・第三者送信）を確認してください（クラウド送信のため）。</p>
</div>}
{minLd&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが議事録を作成中...</span></div>}
{minOut.startsWith("エラー")&&minInp.trim()&&<div style={{marginTop:8,padding:"10px 14px",borderRadius:10,background:"#fef9c3",border:"1px solid #fde047",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
<span style={{fontSize:12,color:"#854d0e"}}>⚠️ 要約に失敗しました。書き起こし内容は保存できます。</span>
<button onClick={saveMinInputOnly} style={{padding:"5px 14px",borderRadius:8,border:"none",background:"#854d0e",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📝 書き起こしを保存</button>
</div>}
{minOut&&<div>
{minFinalIntegrationFailed&&<div style={{marginBottom:10,padding:"12px 14px",borderRadius:10,background:"#fef2f2",border:"2px solid #dc2626",fontSize:12,color:"#991b1b",lineHeight:1.6,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
<div style={{flex:"1 1 auto",minWidth:200}}>🚨 最終統合処理に失敗しました。各チャンクの要約を連結したものを表示しています。<br/>Gemini 2.5 Pro または Claude Sonnet 4.6 に切り替えて再生成することを推奨します。{minFinalIntegrationError?<><br/><span style={{fontSize:11,opacity:0.8}}>エラー: {minFinalIntegrationError.substring(0,150)}</span></>:null}</div>
<button onClick={saveMinPartial} style={{padding:"6px 14px",borderRadius:8,border:"none",background:"#dc2626",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>💾 チャンク要約のみで保存</button>
</div>}
{minTruncated&&!minFinalIntegrationFailed&&!minOut.startsWith("エラー")&&<div style={{marginBottom:10,padding:"10px 14px",borderRadius:10,background:"#fef3c7",border:"1px solid #f59e0b",fontSize:12,color:"#92400e",lineHeight:1.6}}>⚠️ 要約が長すぎて途中で切れている可能性があります。AIモデルを「Gemini 2.5 Pro」または「Claude Sonnet 4.6」に切り替えて再生成してください。</div>}
{(()=>{if(!minOut||minOut.startsWith("エラー"))return null;const m=minOut.match(/【端的な要約】([\s\S]*?)(?:【議事録】|$)/);const sum=m?m[1].trim():"";if(!sum)return null;return(<div style={{marginBottom:10,padding:"12px 16px",borderRadius:12,background:C.pLL,border:`1.5px solid ${C.p}55`}}><div style={{fontSize:12,fontWeight:700,color:C.pD,marginBottom:6}}>📝 端的な要約</div><div style={{fontSize:13,color:C.g900,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{sum}</div></div>)})()}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>📋 議事録{modelBadge(minutesGenModel)}</span>
<div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
<div style={{display:"flex",alignItems:"center",gap:4}}>
<span style={{fontSize:11,color:C.g500}}>文字</span>
{[11,13,14,16,18].map(s=><button key={s} onClick={()=>setMinOutFontSize(s)} style={{padding:"2px 7px",borderRadius:6,border:minOutFontSize===s?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:minOutFontSize===s?C.pLL:C.w,fontSize:10,fontWeight:minOutFontSize===s?700:500,color:minOutFontSize===s?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{s}</button>)}
</div>
<div style={{display:"flex",alignItems:"center",gap:4}}>
<span style={{fontSize:11,color:C.g500}}>高さ</span>
{[[200,"小"],[300,"中"],[500,"大"],[800,"特大"]].map(([h,label])=><button key={h} onClick={()=>setMinOutHeight(h)} style={{padding:"2px 7px",borderRadius:6,border:minOutHeight===h?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:minOutHeight===h?C.pLL:C.w,fontSize:10,fontWeight:minOutHeight===h?700:500,color:minOutHeight===h?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{label}</button>)}
</div>
<button onClick={()=>{navigator.clipboard.writeText(minOut)}} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.p}44`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
{minOut&&<button type="button" onClick={()=>setMinOut('')} style={{fontSize:13,color:'#c0392b',background:'#fff0f0',border:'1px solid #f0c0c0',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>🗑 クリア</button>}
</div>
<button onClick={async()=>{
const t=minOut;
if(!t||!t.trim()){sSt("議事録テキストがありません");return}
setMinTypoLd(true);sSt("🔍 議事録AI校正中...");
try{
const r=await fetch("/api/minutes-typos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t,dictionary:dict.map(([from,to])=>({from,to}))})});
const d=await r.json();
if(d.error){sSt("校正エラー: "+d.error);return}
if(!d.corrections||d.corrections.length===0){sSt("✓ 専門用語の誤りは見つかりませんでした");return}
const registeredFroms=new Set(dict.map(([f])=>f));
const newCorrections=d.corrections.filter(c=>!registeredFroms.has(c.from));
if(newCorrections.length===0){sSt("✓ 新しい誤字候補はありません（全て登録済み）");return}
const sel={};
newCorrections.forEach((c,i)=>{if(c.candidates&&c.candidates.length===1)sel[i]=0});
setTypoSelections(sel);setTypoCustomInputs({});setTypoTarget("minOut");setTypoModal(newCorrections);
sSt("校正候補が見つかりました");
}catch(e){sSt("校正エラー: "+e.message)}
finally{setMinTypoLd(false)}
}} disabled={minTypoLd} style={{padding:"4px 12px",borderRadius:10,border:"1px solid #a78bfa",background:"#f5f3ff",fontSize:12,fontWeight:600,color:"#5a3e8a",fontFamily:"inherit",cursor:minTypoLd?"wait":"pointer"}}>
{minTypoLd?"🔍 校正中...":"🔬 専門用語スキャン"}
</button></div>
<textarea value={minOut} onChange={e=>setMinOut(e.target.value)} style={{width:"100%",height:minOutHeight,padding:14,borderRadius:12,border:`1px solid ${C.g200}`,background:C.w,fontSize:minOutFontSize,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.8,boxSizing:"border-box"}}/>
</div>}
<div style={{...card,marginTop:16}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:14,fontWeight:700,color:C.pDD}}>📥 議事録を手動登録</span>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>setManualMinMode("text")} style={{padding:"3px 10px",borderRadius:6,border:manualMinMode==="text"?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:manualMinMode==="text"?C.pLL:C.w,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>テキスト</button>
<button onClick={()=>setManualMinMode("file")} style={{padding:"3px 10px",borderRadius:6,border:manualMinMode==="file"?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:manualMinMode==="file"?C.pLL:C.w,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>ファイル</button>
</div>
</div>
<input value={manualMinTitle} onChange={e=>setManualMinTitle(e.target.value)} placeholder="タイトル（例：2月スタッフミーティング）" style={{width:"100%",padding:"8px 12px",borderRadius:10,border:`1.5px solid ${C.g200}`,fontSize:13,fontFamily:"inherit",marginBottom:8,boxSizing:"border-box"}}/>
{manualMinMode==="text"?
<textarea value={manualMinText} onChange={e=>setManualMinText(e.target.value)} placeholder="議事録の内容をここに貼り付けてください..." style={{width:"100%",height:120,padding:10,borderRadius:10,border:`1.5px solid ${C.g200}`,fontSize:13,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box",marginBottom:8}}/>
:<div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleMinuteFile(f)}} onClick={()=>{const i=document.createElement("input");i.type="file";i.accept=".txt,.csv,.md,.docx";i.onchange=e=>{const f=e.target.files[0];if(f)handleMinuteFile(f)};i.click()}} style={{width:"100%",height:80,borderRadius:10,border:`2px dashed ${C.g200}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",marginBottom:8,background:C.g50,boxSizing:"border-box"}}>
<span style={{fontSize:12,color:C.g400,textAlign:"center"}}>📁 クリックまたはドラッグ&ドロップ<br/>.txt .csv .md .docx対応</span>
</div>}
{manualMinText&&<div style={{fontSize:11,color:C.g400,marginBottom:6}}>{manualMinText.length}文字</div>}
<button onClick={saveManualMinute} disabled={!manualMinText.trim()} style={{padding:"8px 20px",borderRadius:10,border:"none",background:manualMinText.trim()?C.p:C.g200,color:C.w,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:manualMinText.trim()?"pointer":"default",opacity:manualMinText.trim()?1:0.5}}>💾 登録する</button>
</div>
{prog>0&&<div style={{width:"100%",height:5,background:"rgba(160,220,100,0.2)",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#3a6820)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
{prog>0&&<div style={{textAlign:"center",fontSize:11,color:"#6b7280",marginBottom:8}}>{st}</div>}
<div style={{marginTop:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
<span style={{fontSize:14,fontWeight:700,color:C.pDD}}>📚 議事録履歴{minHistTotal>0&&minHist.length>=500&&minHistTotal>500?<span style={{marginLeft:8,fontSize:11,fontWeight:600,color:"#d97706"}}>（直近500件表示中 / 全{minHistTotal}件）</span>:minHistTotal>0?<span style={{marginLeft:8,fontSize:11,fontWeight:500,color:C.g500}}>（全{minHistTotal}件）</span>:null}</span>
<div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
  <div style={{display:"flex",alignItems:"center",gap:3}}>
    <span style={{fontSize:10,color:C.g500}}>文字</span>
    {[10,12,13,14,16].map(s=><button key={s} onClick={()=>setMinHistFontSize(s)} style={{padding:"1px 6px",borderRadius:5,border:minHistFontSize===s?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:minHistFontSize===s?C.pLL:C.w,fontSize:10,fontWeight:minHistFontSize===s?700:500,color:minHistFontSize===s?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{s}</button>)}
  </div>
  <div style={{display:"flex",alignItems:"center",gap:3}}>
    <span style={{fontSize:10,color:C.g500}}>高さ</span>
    {[[150,"小"],[300,"中"],[500,"大"],[900,"全"]].map(([h,label])=><button key={h} onClick={()=>setMinHistHeight(h)} style={{padding:"1px 6px",borderRadius:5,border:minHistHeight===h?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:minHistHeight===h?C.pLL:C.w,fontSize:10,fontWeight:minHistHeight===h?700:500,color:minHistHeight===h?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{label}</button>)}
  </div>
</div>
<div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
{selMinutes.length>0&&<><button onClick={generateTasksFromSelected} style={{padding:"4px 10px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 選択({selMinutes.length})からタスク生成</button>
<button onClick={analyzeSelectedMinutes} disabled={taskAnalLd} style={{padding:"4px 10px",borderRadius:8,border:"none",background:taskAnalLd?C.g200:`linear-gradient(135deg,#7c3aed,#a78bfa)`,color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>{taskAnalLd?"⏳ 分析中...":"📊 時系列分析"}</button>
{selMinutes.length>=2&&<button onClick={mergeSelectedMinutes} disabled={mergeLd} style={{padding:"4px 12px",borderRadius:8,border:"none",background:mergeLd?C.g200:"linear-gradient(135deg,#7c3aed,#6d28d9)",color:C.w,fontSize:11,fontWeight:600,fontFamily:"inherit",cursor:"pointer"}}>{mergeLd?"⏳ まとめ中...":"🔗 選択分をまとめる("+selMinutes.length+"件)"}</button>}
<button onClick={deleteMinSelected} title="選択した議事録を一括削除" style={{padding:"4px 10px",borderRadius:8,border:"none",background:"#dc2626",color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>🗑 削除({selMinutes.length})</button>
<button onClick={()=>setSelMinutes([])} style={{padding:"4px 8px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:10,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>選択解除</button></>}
<button onClick={loadMinHist} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📂 履歴を見る</button></div></div>
{mergeLd&&<div style={{textAlign:"center",padding:16}}><div style={{width:28,height:28,border:"3px solid #e5e7eb",borderTop:"3px solid #7c3aed",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/><span style={{color:"#6b7280",fontSize:12}}>AIが議事録をまとめ中...</span></div>}
{minHist.filter(m=>m.output_text!=="（録音中・未要約）").map(m=>{const sel=selMinutes.includes(m.id);return(<div key={m.id} style={{padding:10,borderRadius:10,border:sel?`2px solid ${C.p}`:`1px solid ${C.g200}`,marginBottom:6,background:sel?C.pLL:C.g50}}>
<div onClick={()=>setOpenMinId(openMinId===m.id?null:m.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,cursor:"pointer"}}>
<div style={{display:"flex",alignItems:"center",gap:6}}>
<input type="checkbox" checked={sel} onClick={(e)=>e.stopPropagation()} onChange={(e)=>{e.stopPropagation();setSelMinutes(prev=>prev.includes(m.id)?prev.filter(x=>x!==m.id):[...prev,m.id])}} style={{cursor:"pointer",accentColor:C.p}}/>
{(m.title||"").startsWith("【まとめ】")&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:"#ede9fe",color:"#7c3aed",fontWeight:700,marginRight:2}}>統合</span>}<span style={{fontSize:13,fontWeight:700,color:C.pD}}>{m.title||"無題"}</span>{m.ai_model&&modelBadge(m.ai_model)}
<span style={{fontSize:10,color:C.g400}}>{openMinId===m.id?"▼":"▶"}</span></div>
<span style={{fontSize:10,color:C.g400}}>{new Date(m.created_at).toLocaleDateString("ja-JP")}</span></div>
{openMinId===m.id?<div style={{marginBottom:4}}>{(()=>{try{const src=JSON.parse(m.input_text);if(src&&src.source_titles){return(<div style={{padding:6,borderRadius:6,background:"#f5f3ff",border:"1px solid #c4b5fd",marginBottom:6,fontSize:11}}>
<span style={{fontWeight:700,color:"#7c3aed"}}>📎 まとめ元:</span>
{src.source_titles.map((s,i)=>(<span key={i} style={{marginLeft:4,padding:"1px 6px",borderRadius:4,background:"#ede9fe",color:"#6d28d9"}}>{s.date} {s.title}</span>))}
</div>)}}catch{}return null})()}{editMinId===m.id?(
  <div onClick={e=>e.stopPropagation()}>
    <input
      value={editMinTitle}
      onChange={e=>setEditMinTitle(e.target.value)}
      style={{width:"100%",padding:"6px 10px",borderRadius:8,border:`1.5px solid ${C.p}`,background:C.w,fontSize:13,fontWeight:700,fontFamily:"inherit",outline:"none",marginBottom:6,boxSizing:"border-box"}}
      placeholder="タイトル"
    />
    <textarea
      value={editMinText}
      onChange={e=>setEditMinText(e.target.value)}
      style={{width:"100%",height:300,padding:8,borderRadius:8,border:`1.5px solid ${C.p}`,background:C.w,fontSize:12,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.8,boxSizing:"border-box",outline:"none"}}
    />
    <div style={{display:"flex",gap:6,marginTop:6}}>
      <button onClick={saveMinEdit} disabled={editMinSaving} style={{padding:"4px 14px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:editMinSaving?"wait":"pointer"}}>
        {editMinSaving?"保存中...":"💾 保存"}
      </button>
      <button onClick={()=>{setEditMinId(null);setEditMinText("");setEditMinTitle("")}} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>
        キャンセル
      </button>
    </div>
  </div>
):(
  <div>
    <div style={{fontSize:minHistFontSize,color:C.g600,maxHeight:minHistHeight,overflowY:"auto",marginBottom:4,padding:"8px 10px",borderRadius:8,background:C.w,border:`1px solid ${C.g200}`,lineHeight:1.85}}><MinutesFormatted text={m.output_text||""}/></div>
    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      <button onClick={(e)=>{e.stopPropagation();navigator.clipboard.writeText(m.output_text||"")}} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.p}44`,background:C.w,fontSize:10,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
      <button onClick={(e)=>{e.stopPropagation();setEditMinId(m.id);setEditMinText(m.output_text||"");setEditMinTitle(m.title||"")}} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.w,fontSize:10,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✏️ 編集</button>
      {m.output_text&&m.output_text!=="（録音中・未要約）"&&<button onClick={(e)=>{e.stopPropagation();generateTasksFromMinute(m)}} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.p}44`,background:C.w,fontSize:10,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 タスク生成</button>}
      <button onClick={(e)=>{e.stopPropagation();setMinDeleteConfirm({ids:[m.id],count:1,hasAudio:!!m.audio_path,anchor:calcPopAnchor(e)})}} title={m.audio_path?"議事録と音声を削除":"議事録を削除"} style={{padding:"3px 10px",borderRadius:6,border:"1px solid #dc2626",background:C.w,fontSize:10,fontWeight:600,color:"#dc2626",fontFamily:"inherit",cursor:"pointer"}}>🗑 削除</button>
    </div>
  </div>
)}
{m.input_text&&m.input_text!=="（録音中・未要約）"&&(editMinTxId===m.id?(
<div style={{marginTop:8}} onClick={e=>e.stopPropagation()}>
<div style={{fontSize:11,fontWeight:700,color:"#7c3aed",marginBottom:4}}>📝 書き起こし全文を編集</div>
<textarea value={editMinTxText} onChange={e=>setEditMinTxText(e.target.value)} style={{width:"100%",height:300,padding:8,borderRadius:8,border:`1.5px solid ${C.p}`,background:C.w,fontSize:11,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box",outline:"none"}}/>
<div style={{display:"flex",gap:6,marginTop:6}}>
<button onClick={saveMinTxEdit} disabled={editMinTxSaving} style={{padding:"4px 14px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:editMinTxSaving?"wait":"pointer"}}>{editMinTxSaving?"保存中...":"💾 保存"}</button>
<button onClick={()=>{setEditMinTxId(null);setEditMinTxText("")}} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>キャンセル</button>
</div>
</div>
):(
<div style={{marginTop:8,display:"flex",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
<details style={{flex:"1 1 60%",minWidth:0}}>
<summary style={{fontSize:11,color:C.g400,cursor:"pointer",userSelect:"none"}}>📝 書き起こし全文を表示（{Math.ceil((m.input_text||"").length/40)}行）</summary>
<pre style={{fontSize:11,color:C.g600,whiteSpace:"pre-wrap",wordBreak:"break-word",marginTop:6,padding:8,borderRadius:8,background:C.g50,maxHeight:200,overflowY:"auto",lineHeight:1.6,fontFamily:"inherit"}}>{m.input_text}</pre>
</details>
<button onClick={(e)=>{e.stopPropagation();copyTextToClipboard(m.input_text,"書き起こし全文")}} title="書き起こし全文をクリップボードにコピー" style={{padding:"4px 10px",borderRadius:6,border:"1px solid #d4cce8",background:"#fff",color:"#7c3aed",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap",fontFamily:"inherit"}}>📋 コピー</button>
<button onClick={(e)=>{e.stopPropagation();setEditMinTxId(m.id);setEditMinTxText(m.input_text||"")}} title="書き起こし全文を編集" style={{padding:"4px 10px",borderRadius:6,border:"1px solid #d4cce8",background:"#fff",color:"#7c3aed",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap",fontFamily:"inherit"}}>✏️ 編集</button>
</div>
))}
</div>:<div style={{fontSize:12,color:C.g600,maxHeight:60,overflow:"hidden",marginBottom:4}}>{(m.output_text||"").substring(0,100)}...</div>}
</div>)})}
{taskAnalysis&&<div style={{marginTop:12,padding:12,borderRadius:12,border:`2px solid #a78bfa`,background:"#f5f3ff"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:"#7c3aed"}}>📊 時系列分析結果</span>
<button onClick={()=>navigator.clipboard.writeText(taskAnalysis)} style={{padding:"3px 10px",borderRadius:8,border:`1px solid #a78bfa`,background:C.w,fontSize:11,fontWeight:600,color:"#7c3aed",fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button></div>
<div style={{fontSize:13,color:C.g700,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{taskAnalysis}</div>
</div>}
</div>
{typoModalEl}
{noiseModalEl}
{/* 議事録削除確認ポップオーバー（押した削除ボタンのすぐ近くに表示／中央表示をやめスクロール不要に）
    ★ Portalで document.body 直下に描画し、祖先のtransform/filter等に影響されず viewport基準で固定表示 */}
{minDeleteConfirm&&typeof document!=="undefined"&&createPortal(
  <>
    {/* 透明オーバーレイ：外側クリックで閉じる */}
    <div onClick={()=>!minDeleting&&setMinDeleteConfirm(null)} style={{position:"fixed",inset:0,background:"transparent",zIndex:100000}}/>
    {/* ポップオーバー本体：クリックされたボタンの座標(anchor)直下に固定表示 */}
    <div style={{position:"fixed",top:(minDeleteConfirm.anchor?.top??80),left:(minDeleteConfirm.anchor?.left??16),zIndex:100001,background:"#fff",borderRadius:12,padding:18,width:300,maxWidth:"calc(100vw - 16px)",boxShadow:"0 8px 32px rgba(0,0,0,0.2)",border:"1px solid #eee"}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:10,color:"#dc2626"}}>🗑 議事録を削除しますか？</div>
      <div style={{fontSize:13,color:"#555",marginBottom:16,lineHeight:1.6}}>
        {minDeleteConfirm.count}件の議事録（要約・書き起こし{minDeleteConfirm.hasAudio?"・音声":""}）を削除します。<br/>
        <span style={{color:"#dc2626",fontWeight:600}}>この操作は取り消せません。</span>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button onClick={()=>setMinDeleteConfirm(null)} disabled={minDeleting} style={{padding:"7px 14px",background:"#e5e5e5",border:"none",borderRadius:8,cursor:minDeleting?"not-allowed":"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600,color:"#555",opacity:minDeleting?0.6:1}}>キャンセル</button>
        <button onClick={()=>executeMinDelete(minDeleteConfirm.ids)} disabled={minDeleting} style={{padding:"7px 14px",background:"#dc2626",color:"#fff",border:"none",borderRadius:8,cursor:minDeleting?"wait":"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,opacity:minDeleting?0.8:1}}>{minDeleting?"削除中...":"削除する"}</button>
      </div>
    </div>
  </>,
  document.body
)}
</div></div>);

// === SEMINAR LEARNING ===
if(page==="seminar")return(<div style={{maxWidth:mob?"100%":820,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{prog>0&&<div style={{width:"100%",height:5,background:"rgba(160,220,100,0.2)",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#3a6820)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
  <h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>🎓 セミナー学習</h2>
  <span style={{fontSize:10,color:C.g400,fontWeight:500,marginLeft:8,flex:1}}>{smnSummaryModelUsed||smnSummaryModel}</span>
  <button onClick={openSmnHist} style={{padding:"6px 12px",borderRadius:10,border:`1px solid ${C.p}66`,background:C.pLL,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📂 履歴</button>
  <button onClick={()=>{smnStop();setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
</div>
{st&&st!=="待機中"&&<div style={{fontSize:12,color:st.includes("✓")?"#22c55e":st.includes("⚠️")||st.includes("エラー")?"#ef4444":"#f59e0b",fontWeight:600,marginBottom:8,textAlign:"center",padding:"4px 8px",borderRadius:8,background:st.includes("✓")?"#f0fdf4":st.includes("⚠️")||st.includes("エラー")?"#fef2f2":"#fffbeb"}}>{st}</div>}
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>セミナー音声を書き起こし → 詳細な要約・まとめ → Genspark共有資料 → AI気づき・提案 を一気通貫で生成します。</p>

<input value={smnTitle} onChange={e=>setSmnTitle(e.target.value)} placeholder="セミナータイトル（例：5月クリニック経営セミナー）" style={{width:"100%",padding:"8px 12px",borderRadius:10,border:`1.5px solid ${C.g200}`,fontSize:14,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>

{/* モデル選択 */}
<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
{[{v:"gemini-3-pro",label:"Gemini 3.1 Pro",desc:"最新・最高精度 ⭐"},{v:"gemini-3-5-flash",label:"Gemini 3.5 Flash ✨",desc:"最新・超高速"},{v:"claude",label:"Claude Sonnet 4.6",desc:"日本語精度"}].map(m=>{const sel=smnSummaryModel===m.v;return(<button key={m.v} onClick={()=>{setSmnSummaryModel(m.v);try{localStorage.setItem("mk_smnSummaryModel",m.v)}catch{}}} disabled={smnSummaryLoading||smnGensparkLoading||smnInsightsLoading} style={{flex:"1 1 140px",padding:"8px 10px",borderRadius:10,border:sel?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:sel?C.pLL:C.w,fontSize:12,fontWeight:sel?700:500,color:sel?C.pD:C.g500,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}><div>{m.label}</div><div style={{fontSize:10,marginTop:2,fontWeight:400,opacity:0.8}}>{m.desc}</div></button>)})}
</div>

{/* 入力モード切替 */}
<div style={{display:"flex",gap:8,marginBottom:16}}>
  <button onClick={()=>setSmnMode("record")} style={{flex:1,padding:"10px 12px",borderRadius:10,border:smnMode==="record"?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:smnMode==="record"?C.pLL:C.w,fontSize:13,fontWeight:smnMode==="record"?700:500,color:smnMode==="record"?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>🎙 録音して書き起こす</button>
  <button onClick={()=>setSmnMode("paste")} style={{flex:1,padding:"10px 12px",borderRadius:10,border:smnMode==="paste"?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:smnMode==="paste"?C.pLL:C.w,fontSize:13,fontWeight:smnMode==="paste"?700:500,color:smnMode==="paste"?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>📝 テキストを直接入力</button>
</div>

{/* 録音モード */}
{smnMode==="record"&&<div style={{marginBottom:12}}>
  {/* R-3: 音声保存トグル */}
  <div style={{marginBottom:10,padding:"8px 12px",background:C.pLL,borderRadius:10,border:`1px solid ${C.g200}`}}>
    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:smnRS==="inactive"?"pointer":"not-allowed",opacity:smnRS==="inactive"?1:0.6}}>
      <input type="checkbox" checked={smnAudioSave} disabled={smnRS!=="inactive"} onChange={e=>{setSmnAudioSave(e.target.checked);try{localStorage.setItem("mk_smnAudioSave",String(e.target.checked))}catch{}}} style={{cursor:smnRS==="inactive"?"pointer":"not-allowed"}}/>
      🎙 音声ファイルも保存する（後で聴き返したい場合）
    </label>
    {smnAudioSave&&<div style={{fontSize:11,color:C.g400,marginLeft:24,marginTop:2}}>※ 長時間録音時にメモリを使うため、必要なときのみONを推奨。録音停止時に Supabase Storage に保存されます。</div>}
  </div>
  <RecoveryBanner mode="seminar"/>
  <DiagRow active={smnRS!=="inactive"}/>
  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
    <span style={{fontSize:24,fontWeight:700,fontVariantNumeric:"tabular-nums",color:C.pD}}>{String(Math.floor(smnEl/60)).padStart(2,"0")}:{String(smnEl%60).padStart(2,"0")}</span>
    {(autosaveAt||{}).seminar?<span style={{fontSize:10,color:C.g400}}>💾 自動保存: {new Date(autosaveAt.seminar).toLocaleTimeString("ja-JP")}</span>:null}
    {smnRS==="inactive"?
      <button onClick={smnGo} style={{padding:"10px 24px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:140,whiteSpace:"nowrap"}}>🎙 録音開始</button>
      :smnRS==="paused"?
      <>
        <button onClick={resumeSmn} style={{padding:"10px 20px",borderRadius:14,border:"none",background:C.rG,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:100,whiteSpace:"nowrap"}}>▶ 再開</button>
        <button onClick={smnStop} style={{padding:"10px 20px",borderRadius:14,border:"none",background:"#dc2626",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:120,whiteSpace:"nowrap"}}>⏹ 録音停止</button><button type="button" onClick={smnStopAndSaveOnly} style={{padding:"10px 18px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#0f9d6e,#10b981)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:140,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>💾 停止して書き起こしを保存</button>
      </>
      :
      <>
        <button onClick={pauseSmn} style={{padding:"10px 16px",borderRadius:14,border:"none",background:"#fbbf24",color:"#78350f",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:100,whiteSpace:"nowrap"}}>⏸ 一時停止</button>
        <button onClick={smnStop} style={{padding:"10px 20px",borderRadius:14,border:"none",background:"#dc2626",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:120,whiteSpace:"nowrap"}}>⏹ 録音停止</button><button type="button" onClick={smnStopAndSaveOnly} style={{padding:"10px 18px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#0f9d6e,#10b981)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:140,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>💾 停止して書き起こしを保存</button>
      </>
    }
    <span style={{fontSize:12,color:smnRS==="recording"?C.rG:smnRS==="paused"?"#d97706":C.g400,fontWeight:600}}>{smnRS==="recording"?"● 録音中（10秒毎に書き起こし）":smnRS==="paused"?"⏸ 一時停止中":"停止"}</span>
    {(smnRS==="recording"||smnRS==="paused")&&<div style={{flex:"1 1 200px",minWidth:120,maxWidth:300,height:10,background:C.g100||"#f0f0f0",borderRadius:5,overflow:"hidden",border:`1px solid ${C.g200}`}}><div style={{width:`${Math.min(100,lv)}%`,height:"100%",background:lv>40?"#10b981":lv>10?"#f59e0b":"#94a3b8",transition:"width 120ms linear, background 200ms"}}/></div>}
  </div>
</div>}

{/* テキスト直接入力モード */}
{smnMode==="paste"&&<div style={{marginBottom:12}}>
  <div style={{fontSize:12,fontWeight:600,color:C.g500,marginBottom:4}}>📝 書き起こしテキスト（YouTube字幕・配布資料・他ツールでの書き起こしを貼り付け）</div>
</div>}

{/* 共通: 書き起こしテキストエリア */}
<div style={{marginBottom:14}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
    <span style={{fontSize:12,fontWeight:600,color:C.g500}}>{smnMode==="record"?"📝 書き起こし結果（編集可能）":"📝 セミナー書き起こしテキスト"}</span>
    <span style={{fontSize:11,color:C.g400}}>{smnTranscript.length.toLocaleString()} 文字</span>
  </div>
  <textarea value={smnTranscript} onChange={e=>setSmnTranscript(e.target.value)} placeholder={smnMode==="record"?"録音開始すると自動で書き起こされます":"セミナーの書き起こしテキスト、YouTube字幕、資料の文字起こしなどを貼り付けてください"} style={{width:"100%",height:smnMode==="paste"?400:240,padding:12,borderRadius:12,border:`1px solid ${C.g200}`,background:C.g50,fontSize:13,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/>
</div>

{/* 要約生成ボタン */}
<div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
  <button onClick={runSmnSummary} disabled={!smnTranscript||smnSummaryLoading} style={{flex:"1 1 200px",padding:"12px 24px",borderRadius:14,border:"none",background:smnSummaryLoading||!smnTranscript?C.g200:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:smnSummaryLoading||!smnTranscript?C.g500:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:smnSummaryLoading||!smnTranscript?"not-allowed":"pointer",boxShadow:smnSummaryLoading||!smnTranscript?"none":`0 2px 8px rgba(0,0,0,.15)`}}>{smnSummaryLoading?"⏳ 詳細要約を生成中...":"📚 詳細要約を生成"}</button>
  {smnTranscript.trim()&&<button disabled={cleaningTx} onClick={()=>manualClean(smnTranscript,(c)=>{setSmnTranscript(c);smnTextRef.current=c},"smn")} style={{padding:"10px 16px",borderRadius:12,border:"1px solid #ddd6fe",background:"#f5f3ff",fontSize:12,fontWeight:600,color:"#7c3aed",fontFamily:"inherit",cursor:cleaningTx?"wait":"pointer"}}>{cleanBtnLabel("✨ 書き起こしを補正")}</button>}{undoCleanBtn("smn")}
  {(smnTranscript||smnSummary)&&<button onClick={clearSmnAll} style={{padding:"10px 16px",borderRadius:12,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>🗑 クリア</button>}
</div>

{smnSummaryLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIがセミナーを詳細要約中...（長文の場合 1-2分かかります）</span></div>}

{/* 詳細要約結果 */}
{smnSummary&&<div style={{marginTop:12,padding:14,borderRadius:12,background:"#f0fdf4",border:`2px solid ${C.p}88`}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
    <h3 style={{fontSize:15,fontWeight:700,color:"#2a5018",margin:0}}>📚 詳細要約・まとめ{modelBadge(smnSummaryModelUsed||smnSummaryModel)}</h3>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <button onClick={()=>{navigator.clipboard.writeText(smnSummary);sSt("✓ 要約をコピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.p}`,background:C.w,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
      <button onClick={saveSmnResult} disabled={smnSaved} style={{padding:"4px 12px",borderRadius:8,border:"none",background:smnSaved?"#10b981":C.p,color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:smnSaved?"default":"pointer",opacity:smnSaved?0.85:1}}>{smnSaved?"✓ 保存済み":"💾 保存"}</button>
    </div>
  </div>
  <div style={{fontSize:13,lineHeight:1.8,color:C.g900,maxHeight:600,overflowY:"auto",padding:10,borderRadius:8,background:C.w,border:`1px solid ${C.g200}`,wordBreak:"break-word"}} dangerouslySetInnerHTML={{__html:renderSmnMarkdown(smnSummary)}}/>

  {/* 応用機能ボタン */}
  <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
    <button onClick={runSmnGenspark} disabled={smnGensparkLoading} style={{flex:"1 1 200px",padding:"10px 16px",borderRadius:12,border:"none",background:smnGensparkLoading?C.g200:"linear-gradient(135deg,#7c3aed,#a78bfa)",color:smnGensparkLoading?C.g500:C.w,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:smnGensparkLoading?"wait":"pointer"}}>{smnGensparkLoading?"⏳ 生成中...":"📋 Genspark共有資料用テキストを生成"}</button>
    <button onClick={runSmnInsights} disabled={smnInsightsLoading} style={{flex:"1 1 200px",padding:"10px 16px",borderRadius:12,border:"none",background:smnInsightsLoading?C.g200:"linear-gradient(135deg,#f59e0b,#fbbf24)",color:smnInsightsLoading?C.g500:"#78350f",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:smnInsightsLoading?"wait":"pointer"}}>{smnInsightsLoading?"⏳ 生成中...":"💡 AI気づき・提案を生成"}</button>
  </div>
</div>}

{/* Genspark用テキスト結果 */}
{smnGensparkText&&<div style={{marginTop:12,padding:14,borderRadius:12,background:"#f5f3ff",border:"2px solid #a78bfa"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
    <h3 style={{fontSize:15,fontWeight:700,color:"#5b21b6",margin:0}}>📋 Genspark共有資料用テキスト{modelBadge(smnSummaryModelUsed||smnSummaryModel)}</h3>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <button onClick={()=>{navigator.clipboard.writeText(smnGensparkText);sSt("✓ Genspark用テキストをコピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #7c3aed",background:C.w,fontSize:11,fontWeight:600,color:"#5b21b6",fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
      <button onClick={saveSmnResult} disabled={smnSaved} title="この時点で生成されているもの全部（要約・Genspark・AI気づき・書き起こし）を一括保存" style={{padding:"4px 12px",borderRadius:8,border:"none",background:smnSaved?"#10b981":"#7c3aed",color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:smnSaved?"default":"pointer",opacity:smnSaved?0.85:1}}>{smnSaved?"✓ 保存済み":"💾 保存"}</button>
      <a href="https://www.genspark.ai/" target="_blank" rel="noreferrer" style={{padding:"4px 12px",borderRadius:8,border:"none",background:"#7c3aed",color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",textDecoration:"none"}}>🔗 Gensparkを開く</a>
    </div>
  </div>
  <textarea readOnly value={smnGensparkText} style={{width:"100%",minHeight:300,padding:10,borderRadius:8,border:"1px solid #c4b5fd",background:C.w,fontSize:12,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.7,boxSizing:"border-box"}}/>
  <p style={{fontSize:11,color:"#7c3aed",marginTop:6,marginBottom:0}}>💡 このテキストをコピーしてGensparkに貼り付けると、スライド資料が自動生成されます。</p>
</div>}

{/* AI気づき・提案 */}
{smnInsights&&<div style={{marginTop:12,padding:14,borderRadius:12,background:"#fffbeb",border:"2px solid #f59e0b"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
    <h3 style={{fontSize:15,fontWeight:700,color:"#92400e",margin:0}}>💡 AI気づき・提案（経営・人材・見逃し・応用）{modelBadge(smnSummaryModelUsed||smnSummaryModel)}</h3>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <button onClick={()=>{navigator.clipboard.writeText(smnInsights);sSt("✓ 気づき・提案をコピーしました")}} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #f59e0b",background:C.w,fontSize:11,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
      <button onClick={saveSmnResult} disabled={smnSaved} title="この時点で生成されているもの全部（要約・Genspark・AI気づき・書き起こし）を一括保存" style={{padding:"4px 12px",borderRadius:8,border:"none",background:smnSaved?"#10b981":"#f59e0b",color:smnSaved?C.w:"#78350f",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:smnSaved?"default":"pointer",opacity:smnSaved?0.85:1}}>{smnSaved?"✓ 保存済み":"💾 保存"}</button>
    </div>
  </div>
  <div style={{whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.8,color:C.g900,maxHeight:600,overflowY:"auto",padding:10,borderRadius:8,background:C.w,border:"1px solid #fde047"}}>{smnInsights}</div>
</div>}

</div>

{/* 履歴モーダル */}
{smnHistOpen&&<div onClick={()=>setSmnHistOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
  <div onClick={e=>e.stopPropagation()} style={{background:C.w,borderRadius:14,padding:18,maxWidth:760,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <h3 style={{fontSize:16,fontWeight:700,color:"#2a5018",margin:0}}>📂 セミナー学習履歴（{smnHistList.length}件）</h3>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        {smnSelectMode&&<>
          <button onClick={()=>setSmnSelectedIds(new Set(smnHistList.map(x=>x.id)))} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${C.p}`,background:C.pLL,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>☑ 全選択</button>
          <button onClick={()=>setSmnSelectedIds(new Set())} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>⬜ 全解除</button>
          <button onClick={deleteSmnSelected} disabled={smnSelectedIds.size===0} style={{padding:"4px 12px",borderRadius:6,border:"none",background:smnSelectedIds.size>0?"#dc2626":"#ddd",color:"#fff",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:smnSelectedIds.size>0?"pointer":"not-allowed"}}>🗑 {smnSelectedIds.size}件削除</button>
        </>}
        <button onClick={()=>{setSmnSelectMode(p=>{if(p)setSmnSelectedIds(new Set());return!p})}} style={{padding:"4px 10px",borderRadius:6,border:smnSelectMode?`2px solid ${C.pD}`:`1px solid ${C.g200}`,background:smnSelectMode?C.pLL:C.w,color:smnSelectMode?C.pD:C.g500,fontSize:11,fontWeight:smnSelectMode?700:500,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>{smnSelectMode?"✕ 選択モード解除":"☑ 選択モード"}</button>
        <button onClick={()=>setSmnHistOpen(false)} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
      </div>
    </div>
    {smnHistList.length===0?<p style={{fontSize:13,color:C.g400,textAlign:"center",padding:20}}>保存されたセミナー学習はまだありません。</p>:
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {smnHistList.map(it=>{
        const smnSel=smnSelectedIds.has(it.id);
        return(<div key={it.id} onClick={()=>{if(smnSelectMode)toggleIdInSet(setSmnSelectedIds,it.id)}} style={{padding:12,borderRadius:10,border:smnSelectMode&&smnSel?"2px solid #dc2626":`1px solid ${C.g200}`,background:smnSelectMode&&smnSel?"#fef2f2":"#fafafa",cursor:smnSelectMode?"pointer":"default"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,gap:6,flexWrap:"wrap"}}>
            {smnSelectMode&&<input type="checkbox" checked={smnSel} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{width:18,height:18,cursor:"pointer",flexShrink:0,accentColor:"#dc2626"}}/>}
            <div style={{flex:1,minWidth:200}}>
              {renderTitleEditor(it,{reloadFn:openSmnHist,isSelectMode:smnSelectMode,localUpdater:(id,t)=>setSmnHistList(p=>p.map(x=>x.id===id?{...x,title:t}:x)),titleStyle:{fontSize:13,fontWeight:700,color:C.pD}})}
              <div style={{fontSize:10,color:C.g400,marginTop:2}}>{new Date(it.created_at).toLocaleString("ja-JP")} ・ {it.ai_model||""}</div>
            </div>
            {!smnSelectMode&&<div style={{display:"flex",gap:6}}>
              <button onClick={()=>restoreSmnRecord(it)} style={{padding:"4px 10px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>復元</button>
              <button onClick={()=>deleteSmnRecord(it.id)} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #dc2626",background:C.w,fontSize:11,fontWeight:600,color:"#dc2626",fontFamily:"inherit",cursor:"pointer"}}>削除</button>
            </div>}
          </div>
          <div style={{fontSize:11,color:C.g600,maxHeight:60,overflow:"hidden",whiteSpace:"pre-wrap",lineHeight:1.5}}>{(it.output_text||"").substring(0,160)}...</div>
        </div>);
      })}
    </div>}
  </div>
</div>}
</div>);

// === SUMMARY TEST LAB ===
if(page==="summary_lab")return(<div style={{maxWidth:mob?"100%":900,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:6,flexWrap:"wrap"}}>
  <h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>📝 要約テストラボ</h2>
  <div style={{display:"flex",gap:6}}>
    <button onClick={()=>{setLabHistOpen(true);loadLabHistory()}} style={{padding:"6px 12px",borderRadius:10,border:`1px solid ${C.p}66`,background:C.pLL,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📂 履歴</button>
    <button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
  </div>
</div>
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>同じテキストを複数のAIで一斉に要約し、品質・速度・コストを横並びで比較できます。</p>
<div style={{marginBottom:12}}>
  <div style={{fontSize:12,fontWeight:600,color:C.g600,marginBottom:6}}>テンプレート</div>
  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
    {Object.entries(LAB_TEMPLATES).map(([k,v])=>{const sel=labTemplate===k;return(
      <button key={k} onClick={()=>{setLabTemplate(k);try{localStorage.setItem("mk_labTemplate",k)}catch{}}} style={{flex:"1 1 120px",padding:"8px 10px",borderRadius:10,border:sel?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:sel?C.pLL:C.w,fontSize:12,fontWeight:sel?700:500,color:sel?C.pD:C.g500,cursor:"pointer",fontFamily:"inherit"}}>{v.label}</button>
    )})}
  </div>
  {labTemplate==="exam"&&<div style={{marginTop:8,padding:10,borderRadius:8,background:"#fafaf9",border:`1px solid ${C.g200}`}}>
    <div style={{fontSize:11,fontWeight:600,color:C.g600,marginBottom:6}}>📋 診察サブテンプレート（A）評価を1行目配置・要約ラボ専用プロンプト）</div>
    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      {LAB_EXAM_TEMPLATES.map(tpl=>{const sel=labExamTplId===tpl.id;return(
        <button key={tpl.id} onClick={()=>{setLabExamTplId(tpl.id);try{localStorage.setItem("mk_labExamTplId",tpl.id)}catch{}}} style={{padding:"5px 10px",borderRadius:8,border:sel?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:sel?C.pLL:C.w,fontSize:11,fontWeight:sel?700:500,color:sel?C.pD:C.g600,cursor:"pointer",fontFamily:"inherit"}}>{tpl.name}</button>
      )})}
    </div>
  </div>}
</div>
<div style={{marginBottom:12}}>
  <div style={{fontSize:12,fontWeight:600,color:C.g600,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
    <span>テキスト入力</span>
    <span style={{fontSize:11,color:C.g400,fontWeight:500}}>{(labText||"").length.toLocaleString()}文字</span>
  </div>
  <textarea value={labText} onChange={e=>setLabText(e.target.value)} placeholder="ここに書き起こしテキストを貼り付け..." style={{width:"100%",minHeight:160,padding:10,borderRadius:8,border:`1px solid ${C.g200}`,fontFamily:"inherit",fontSize:13,resize:"vertical",boxSizing:"border-box"}}/>
  <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
    <button onClick={()=>{if(iR.current){setLabText(iR.current);sSt("✓ 録音書き起こしから読み込み")}else{sSt("⚠️ 録音書き起こしがありません")}}} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g600,cursor:"pointer",fontFamily:"inherit"}}>📥 録音から読み込み</button>
    <button onClick={()=>{if(navigator.clipboard&&navigator.clipboard.readText)navigator.clipboard.readText().then(t=>{setLabText(t);sSt("✓ クリップボードから貼り付け")}).catch(()=>{sSt("⚠️ クリップボード読み取り失敗")})}} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g600,cursor:"pointer",fontFamily:"inherit"}}>📋 クリップボード</button>
    <button onClick={()=>{setLabText("");sSt("クリアしました")}} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g600,cursor:"pointer",fontFamily:"inherit"}}>🗑 クリア</button>
  </div>
</div>
<div style={{marginBottom:12}}>
  <div style={{fontSize:12,fontWeight:600,color:C.g600,marginBottom:6}}>モデル選択（複数選択可・最大4つ）</div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    {["gemini-pro","gemini-3-pro","gemini-3-5-flash","claude"].map(m=>{const selected=labModels.includes(m);const color=csModelColorByLabel(m);return(
      <button key={m} onClick={()=>toggleLabModel(m)} disabled={labBusy} style={{position:"relative",flex:"1 1 180px",padding:"12px",borderRadius:10,border:selected?`2px solid ${color}`:`1px solid ${C.g200}`,background:selected?C.pLL:C.w,fontSize:12,fontWeight:selected?700:500,color:selected?color:C.g500,cursor:labBusy?"not-allowed":"pointer",fontFamily:"inherit",textAlign:"center"}}>
        {selected&&<span style={{position:"absolute",top:4,left:8,color,fontSize:14,fontWeight:700}}>✓</span>}
        <div style={{fontWeight:700,fontSize:13}}>{csModelLabel(m)}</div>
        <div style={{fontSize:10,marginTop:3,fontWeight:400,opacity:0.85}}>{csModelSubLabel(m)}</div>
      </button>
    )})}
  </div>
</div>
{labBusy?(
  <button onClick={stopLabAnalyze} style={{width:"100%",padding:"14px",borderRadius:12,border:"2px solid #dc2626",background:"#fef2f2",color:"#dc2626",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>⏹ AI要約中... (クリックで停止)</button>
):(
  <button onClick={runLabAnalyzeAll} disabled={!labText||labText.trim().length<10} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:(!labText||labText.trim().length<10)?C.g200:"linear-gradient(135deg,#5a9040,#3a6820)",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:(!labText||labText.trim().length<10)?"not-allowed":"pointer",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>📚 {labModels.length}個のAIで{labModels.length>1?"一斉":""}要約</button>
)}
</div>
{labResults.length>0&&<div style={card}>
{labResults.length>1&&<div style={{display:"flex",gap:4,marginBottom:8,borderBottom:`2px solid ${C.g200}`,overflowX:"auto"}}>
  <button onClick={()=>setLabCompareTab("all")} style={{padding:"7px 14px",border:"none",background:labCompareTab==="all"?"#888":"transparent",color:labCompareTab==="all"?"#fff":C.g600,fontWeight:labCompareTab==="all"?700:500,borderRadius:"8px 8px 0 0",cursor:"pointer",whiteSpace:"nowrap",fontSize:12,fontFamily:"inherit",marginBottom:-2}}>🔬 全体比較</button>
  {labResults.map((r,i)=>{const color=csModelColorByLabel(r.model);const active=labCompareTab===r.model;return(
    <button key={i} onClick={()=>setLabCompareTab(r.model)} style={{padding:"7px 14px",border:"none",background:active?color:"transparent",color:active?"#fff":C.g600,fontWeight:active?700:500,borderRadius:"8px 8px 0 0",cursor:"pointer",whiteSpace:"nowrap",fontSize:12,fontFamily:"inherit",marginBottom:-2,borderBottom:active?`2px solid ${color}`:"2px solid transparent"}}>{csModelLabel(r.model)}{r.status==="running"?" ⏳":r.status==="error"?" ⚠️":r.status==="aborted"?" ⏹":""}</button>
  )})}
</div>}
{(labCompareTab==="all"||labResults.length===1)&&<div style={{display:"grid",gridTemplateColumns:mob?"1fr":`repeat(${Math.min(labResults.length,2)},minmax(0,1fr))`,gap:12}}>
  {labResults.map((r,i)=>{const color=csModelColorByLabel(r.model);const dur=r.endedAt&&r.startedAt?((r.endedAt-r.startedAt)/1000).toFixed(1):null;return(
    <div key={i} style={{border:`1px solid ${C.g200}`,borderRadius:10,overflow:"hidden",background:C.w}}>
      <div style={{padding:"8px 12px",background:color+"15",borderLeft:`4px solid ${color}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
        <strong style={{fontSize:13,color}}>{csModelLabel(r.model)}</strong>
        <span style={{fontSize:10,color:C.g500}}>{r.status==="running"?"⏳ 実行中...":r.status==="done"?`✓ 完了${dur?` (${dur}s)`:""}`:r.status==="error"?"⚠️ エラー":r.status==="aborted"?"⏹ 停止":""}</span>
      </div>
      <div style={{padding:10,maxHeight:400,overflowY:"auto"}}>
        {r.status==="error"?(<div style={{color:"#dc2626",fontSize:12}}>{r.error}</div>):(<pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,fontSize:12,fontFamily:"inherit",lineHeight:1.6}}>{r.output||(r.status==="running"?"（生成中...）":"")}</pre>)}
      </div>
      {r.usage&&<div style={{padding:"6px 10px",fontSize:10,color:C.g500,borderTop:`1px solid ${C.g200}`,background:"#fafaf9"}}>入力: {(r.usage.promptTokens||r.usage.input_tokens||0).toLocaleString()}t / 出力: {(r.usage.completionTokens||r.usage.output_tokens||0).toLocaleString()}t</div>}
    </div>
  )})}
</div>}
{labCompareTab!=="all"&&labResults.length>1&&labResults.filter(r=>r.model===labCompareTab).map((r,i)=>{const color=csModelColorByLabel(r.model);const dur=r.endedAt&&r.startedAt?((r.endedAt-r.startedAt)/1000).toFixed(1):null;return(
  <div key={i} style={{border:`1px solid ${C.g200}`,borderRadius:10,overflow:"hidden"}}>
    <div style={{padding:"10px 14px",background:color+"15",borderLeft:`4px solid ${color}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
      <strong style={{fontSize:16,color}}>{csModelLabel(r.model)}</strong>
      <span style={{fontSize:11,color:C.g500}}>{r.status==="running"?"⏳ 実行中...":r.status==="done"?`✓ 完了${dur?` (${dur}s)`:""}`:r.status==="error"?"⚠️ エラー":r.status==="aborted"?"⏹ 停止":""}</span>
    </div>
    <div style={{padding:14}}>
      {r.status==="error"?(<div style={{color:"#dc2626",fontSize:13}}>{r.error}</div>):(<pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,fontSize:13,fontFamily:"inherit",lineHeight:1.7}}>{r.output||(r.status==="running"?"（生成中...）":"")}</pre>)}
    </div>
    {r.usage&&<div style={{padding:"8px 14px",fontSize:11,color:C.g500,borderTop:`1px solid ${C.g200}`,background:"#fafaf9"}}>入力: {(r.usage.promptTokens||r.usage.input_tokens||0).toLocaleString()}t / 出力: {(r.usage.completionTokens||r.usage.output_tokens||0).toLocaleString()}t</div>}
  </div>
)})}
{labResults.filter(r=>r.status==="done").length>0&&<div style={{marginTop:12,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
  <button onClick={saveLabResultsAll} disabled={labSaving} style={{padding:"10px 16px",borderRadius:10,border:"none",background:labSaving?C.g200:C.p,color:"#fff",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:labSaving?"not-allowed":"pointer"}}>{labSaving?"保存中...":"💾 完了分をすべて保存"}</button>
  {labSaveMsg&&<span style={{fontSize:12,color:C.pD,fontWeight:600}}>{labSaveMsg}</span>}
</div>}
</div>}
{labHistOpen&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setLabHistOpen(false)}>
  <div style={{background:C.w,borderRadius:14,padding:20,maxWidth:800,width:"100%",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:8,flexWrap:"wrap"}}>
      <h3 style={{margin:0,fontSize:16,fontWeight:700,color:C.pD}}>📂 要約テストラボ 履歴 ({labHistList.length}件)</h3>
      <div style={{display:"flex",gap:6}}>
        {labSelectMode?(<>
          <button onClick={deleteLabHistSelected} disabled={labSelectedIds.length===0} style={{padding:"6px 12px",borderRadius:8,border:"none",background:labSelectedIds.length>0?"#dc2626":C.g200,color:"#fff",fontSize:12,fontWeight:600,cursor:labSelectedIds.length>0?"pointer":"not-allowed",fontFamily:"inherit"}}>🗑 {labSelectedIds.length}件削除</button>
          <button onClick={()=>{setLabSelectMode(false);setLabSelectedIds([])}} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g600,cursor:"pointer",fontFamily:"inherit"}}>キャンセル</button>
        </>):(<>
          <button onClick={()=>setLabSelectMode(true)} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g600,cursor:"pointer",fontFamily:"inherit"}}>☑ 選択</button>
          <button onClick={()=>setLabHistOpen(false)} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
        </>)}
      </div>
    </div>
    <input type="text" placeholder="🔍 タイトル・入力で検索" value={labHistSearch} onChange={e=>setLabHistSearch(e.target.value)} style={{width:"100%",padding:8,borderRadius:8,border:`1px solid ${C.g200}`,fontSize:12,marginBottom:10,boxSizing:"border-box",fontFamily:"inherit"}}/>
    {labHistLoading?(<div style={{textAlign:"center",padding:20,color:C.g500}}>読み込み中...</div>):labHistList.length===0?(<div style={{textAlign:"center",padding:20,color:C.g500}}>履歴がありません</div>):(<div style={{display:"flex",flexDirection:"column",gap:8}}>
      {labHistList.filter(h=>{const q=labHistSearch.toLowerCase();if(!q)return true;return(h.title||"").toLowerCase().includes(q)||(h.input_text||"").toLowerCase().includes(q)}).map(h=>{const sel=labSelectedIds.includes(h.id);return(
        <div key={h.id} style={{border:`1px solid ${sel?C.p:C.g200}`,borderRadius:10,padding:10,background:sel?C.pLL:C.w,cursor:"pointer",display:"flex",alignItems:"flex-start",gap:8}} onClick={()=>{if(labSelectMode){setLabSelectedIds(prev=>prev.includes(h.id)?prev.filter(x=>x!==h.id):[...prev,h.id])}else{restoreLab(h)}}}>
          {labSelectMode&&<input type="checkbox" checked={sel} readOnly style={{marginTop:3}}/>}
          <div style={{flex:1,minWidth:0}}>
            {renderTitleEditor(h,{reloadFn:loadLabHistory,isSelectMode:labSelectMode,localUpdater:(id,t)=>setLabHistList(p=>p.map(x=>x.id===id?{...x,title:t}:x)),titleStyle:{fontSize:13,fontWeight:600,color:C.pD,marginBottom:3,wordBreak:"break-all"}})}
            <div style={{fontSize:10,color:C.g500,marginBottom:4}}>{toJSTDate(h.created_at)} ・ {csModelLabel(h.ai_model)}</div>
            <div style={{fontSize:11,color:C.g600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{(h.input_text||"").slice(0,120)}{(h.input_text||"").length>120?"...":""}</div>
          </div>
          {!labSelectMode&&<button onClick={e=>{e.stopPropagation();deleteLabHistOne(h.id)}} style={{padding:"4px 8px",borderRadius:6,border:"none",background:"transparent",color:"#dc2626",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>}
        </div>
      )})}
    </div>)}
  </div>
</div>}
</div>);

// === COUNSELING ANALYSIS ===
if(page==="counsel")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{prog>0&&<div style={{width:"100%",height:5,background:"rgba(160,220,100,0.2)",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#3a6820)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,gap:6,flexWrap:"wrap"}}><h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>🧠 カウンセリング分析</h2><span style={{fontSize:10,color:C.g400,fontWeight:500,marginLeft:8,flex:1}}>{geminiModel||csModelLabel(csModel)}</span><button onClick={()=>{setCsShowHistory(true);loadCsHistory()}} style={{padding:"6px 12px",borderRadius:10,border:`1px solid ${C.p}66`,background:C.pLL,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📂 履歴</button><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>カウンセリング内容をAIが多角的に分析。傾聴力・ニーズ把握・提案力の改善やトークスクリプト提案、年間計画を生成します。<br/><span style={{fontSize:12,color:C.pD,fontWeight:600}}>💬 カウンセリング履歴: {csCount}件保存済み（カウンセリング室の記録を自動蓄積）</span></p>
<div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
{[{k:"full",l:"📊 総合分析"},{k:"listening",l:"👂 傾聴・共感"},{k:"needs",l:"🎯 ニーズ把握"},{k:"marketing",l:"💡 マーケティング"},{k:"plan",l:"📅 年間計画"}].map(m=>(<button key={m.k} onClick={()=>setCsMode(m.k)} style={{padding:"5px 12px",borderRadius:10,border:csMode===m.k?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:csMode===m.k?C.pLL:C.w,fontSize:12,fontWeight:csMode===m.k?700:500,color:csMode===m.k?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{m.l}</button>))}
</div>
<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
{[{v:"gemini-3-pro",label:"Gemini 3.1 Pro",desc:"最新・最高精度 ⭐"},{v:"gemini-3-5-flash",label:"Gemini 3.5 Flash ✨",desc:"最新・超高速"},{v:"claude",label:"Claude Sonnet 4.6",desc:"日本語精度"}].map(m=>{const selected=csModels.includes(m.v);return(<button key={m.v} onClick={()=>toggleCsModel(m.v)} disabled={csLd} style={{position:"relative",flex:"1 1 140px",padding:"10px 12px 8px",borderRadius:10,border:selected?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:selected?C.pLL:C.w,fontSize:12,fontWeight:selected?700:500,color:selected?C.pD:C.g500,cursor:csLd?"not-allowed":"pointer",fontFamily:"inherit",textAlign:"center"}}>{selected&&<span style={{position:"absolute",top:4,left:6,color:C.pD,fontSize:13,fontWeight:700}}>✓</span>}<div>{m.label}</div><div style={{fontSize:10,marginTop:2,fontWeight:400,opacity:0.8}}>{m.desc}</div></button>)})}
</div>
<div style={{marginBottom:10}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
<span style={{fontSize:12,fontWeight:600,color:C.g500}}>分析テキスト</span>
<button onClick={openCsPickModal} style={{padding:"3px 10px",borderRadius:8,border:`1px solid ${C.p}44`,background:C.pLL,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 書き起こしを選択</button></div>
{renderSourceInfo()}
<textarea value={csTx} onChange={e=>{const v=e.target.value;setCsTx(v);if(!v.trim()){setCsSourcePatientId("");setCsSourceDate("")}}} placeholder="📋ボタンでカウンセリング履歴から選択、または会話のテキストを直接貼り付けてください" style={{width:"100%",height:100,padding:10,borderRadius:10,border:`1px solid ${C.g200}`,fontSize:13,color:C.g700,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/>
{csTx.trim()&&<div style={{marginTop:6}}><button type="button" disabled={cleaningTx} onClick={()=>manualClean(csTx,(c)=>setCsTx(c),"cs")} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #ddd6fe",background:"#f5f3ff",fontSize:12,fontWeight:600,color:"#7c3aed",fontFamily:"inherit",cursor:cleaningTx?"wait":"pointer"}}>{cleanBtnLabel("✨ 書き起こしを補正")}</button>{undoCleanBtn("cs")}</div>}</div>
{csLd?(<button onClick={stopCsAnalyze} title="クリックで分析を停止" style={{padding:"10px 24px",borderRadius:14,border:"2px solid #dc2626",background:"#fef2f2",color:"#dc2626",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",marginBottom:12,width:"100%"}}>⏹ AI分析中... (クリックで停止)</button>):(<button onClick={csModels.length>1?runCsAnalyzeAll:analyzeCounseling} style={{padding:"10px 24px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",marginBottom:12,width:"100%"}}>{csModels.length>1?`🧠 ${csModels.length}個のAIで一斉分析`:"🧠 分析開始"}</button>)}
{csLd&&csResults.length===0&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>{csModelLabel(csModel)} で分析中...</span></div>}

{/* 3モデル並列比較表示 */}
{csResults.length>1&&<div style={{marginTop:14}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>🔬 {csResults.length}モデル比較</span>
{!csLd&&csResults.some(r=>r.status==="done")&&<button onClick={saveCsResultsAll} disabled={csSaving} style={{padding:"6px 14px",borderRadius:10,border:"none",background:csSaving?C.g200:"linear-gradient(135deg,#7f77dd,#5a4fc4)",color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:csSaving?"not-allowed":"pointer"}}>{csSaving?"⏳ 保存中...":"💾 完了分をすべて保存"}</button>}
</div>
{csSaveMsg&&<div style={{fontSize:12,fontWeight:600,color:csSaveMsg.includes("失敗")?"#dc2626":"#16a34a",marginBottom:8}}>{csSaveMsg}</div>}
{renderSourceInfo()}

{/* タブ切替バー */}
<div style={{display:"flex",gap:2,marginBottom:8,borderBottom:`2px solid ${C.g200}`,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
  <button onClick={()=>setCsCompareTab("all")} style={{padding:"7px 14px",border:"none",background:csCompareTab==="all"?C.pD:"transparent",color:csCompareTab==="all"?C.w:C.g600,fontWeight:csCompareTab==="all"?700:500,borderRadius:"8px 8px 0 0",cursor:"pointer",whiteSpace:"nowrap",fontSize:12,fontFamily:"inherit",marginBottom:-2,borderBottom:csCompareTab==="all"?`2px solid ${C.pD}`:"2px solid transparent"}}>🔬 全体比較</button>
  {csResults.map((r,i)=>{const color=csModelColor(r.model);const active=csCompareTab===r.model;return(<button key={i} onClick={()=>setCsCompareTab(r.model)} style={{padding:"7px 14px",border:"none",background:active?color:"transparent",color:active?"#fff":C.g600,fontWeight:active?700:500,borderRadius:"8px 8px 0 0",cursor:"pointer",whiteSpace:"nowrap",fontSize:12,fontFamily:"inherit",marginBottom:-2,borderBottom:active?`2px solid ${color}`:"2px solid transparent"}}>{csModelLabel(r.model)}{r.status==="running"?" ⏳":r.status==="error"?" ⚠️":r.status==="aborted"?" ⏹":""}</button>)})}
</div>

{csCompareTab==="all"?(
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":`repeat(${csResults.length},minmax(0,1fr))`,gap:12}}>
{csResults.map((r,i)=>{
  const color=csModelColor(r.model);
  const elapsed=r.endedAt?((r.endedAt-r.startedAt)/1000).toFixed(1):null;
  return(<div key={i} style={{border:`1px solid ${C.g200}`,borderRadius:10,padding:10,background:C.w,display:"flex",flexDirection:"column",gap:8,minWidth:0}}>
    <div style={{paddingBottom:6,borderBottom:`2px solid ${color}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      <strong style={{fontSize:12,color}}>{csModelLabel(r.model)}</strong>
      <span style={{fontSize:10,fontWeight:600}}>{r.status==="running"?"⏳ 分析中...":r.status==="done"?"✅ 完了":r.status==="error"?"❌ エラー":r.status==="aborted"?"⏹ 停止":""}</span>
    </div>
    <div style={{maxHeight:360,overflowY:"auto",fontSize:12,lineHeight:1.65,whiteSpace:"pre-wrap",wordBreak:"break-word",color:C.g700,padding:"4px 6px",background:"#fafafa",borderRadius:6}}>
      {r.status==="running"&&!r.output&&<div style={{textAlign:"center",padding:20,color:"#94a3b8"}}><div style={{width:24,height:24,border:`3px solid ${color}33`,borderTop:`3px solid ${color}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/>応答待ち...</div>}
      {r.status==="error"&&<div style={{color:"#dc2626"}}>⚠️ {r.error||"不明なエラー"}</div>}
      {r.status==="aborted"&&!r.output&&<div style={{color:"#64748b"}}>⏹ 停止されました</div>}
      {r.output}
    </div>
    {r.scores&&Object.keys(r.scores).length>0&&<ScoreRadar scores={r.scores} compact/>}
    {r.usage&&<div style={{padding:6,background:"#f8f4ff",borderRadius:6,fontSize:10,color:"#475569",lineHeight:1.5}}>
      <div>📊 入力 {(r.usage.input_tokens||0).toLocaleString()} / 出力 {(r.usage.output_tokens||0).toLocaleString()} tokens</div>
      <div>料金: <strong style={{color:"#7c3aed",fontSize:12}}>¥{(r.usage.cost_jpy||0).toFixed(2)}</strong></div>
    </div>}
    {elapsed&&<div style={{fontSize:10,color:"#94a3b8",textAlign:"right"}}>⏱ {elapsed}s</div>}
  </div>);
})}
</div>
):(
<div>
{csResults.filter(r=>r.model===csCompareTab).map((r,i)=>{
  const color=csModelColor(r.model);
  const elapsed=r.endedAt?((r.endedAt-r.startedAt)/1000).toFixed(1):null;
  return(<div key={i} style={{border:`1px solid ${C.g200}`,borderRadius:12,padding:18,background:C.w}}>
    <div style={{paddingBottom:10,marginBottom:14,borderBottom:`3px solid ${color}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <strong style={{fontSize:16,color}}>{csModelLabel(r.model)}</strong>
      <span style={{fontSize:13,fontWeight:600}}>{r.status==="running"?"⏳ 分析中...":r.status==="done"?"✅ 完了":r.status==="error"?"❌ エラー":r.status==="aborted"?"⏹ 停止":""}</span>
    </div>
    <div style={{fontSize:14,lineHeight:1.75,whiteSpace:"pre-wrap",wordBreak:"break-word",color:C.g700,maxHeight:600,overflowY:"auto",marginBottom:16,padding:"8px 10px",background:"#fafafa",borderRadius:8}}>
      {r.status==="running"&&!r.output&&<div style={{textAlign:"center",padding:30,color:"#94a3b8"}}><div style={{width:32,height:32,border:`3px solid ${color}33`,borderTop:`3px solid ${color}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/>応答待ち...</div>}
      {r.status==="error"&&<div style={{color:"#dc2626"}}>⚠️ {r.error||"不明なエラー"}</div>}
      {r.status==="aborted"&&!r.output&&<div style={{color:"#64748b"}}>⏹ 停止されました</div>}
      {r.output}
    </div>
    {r.scores&&Object.keys(r.scores).length>0&&<div style={{marginBottom:14}}><ScoreRadar scores={r.scores}/></div>}
    <div style={{display:"flex",gap:14,fontSize:12,color:C.g600,flexWrap:"wrap",alignItems:"center"}}>
      {r.usage&&<div>📊 入力 {(r.usage.input_tokens||0).toLocaleString()} / 出力 {(r.usage.output_tokens||0).toLocaleString()} tokens ／ <strong style={{color:"#7c3aed"}}>¥{(r.usage.cost_jpy||0).toFixed(2)}</strong></div>}
      {elapsed&&<div style={{marginLeft:"auto"}}>⏱ {elapsed}s</div>}
    </div>
  </div>);
})}
</div>
)}
</div>}
{csOut&&csResults.length<=1&&<div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>📋 分析結果</span>
<button onClick={()=>navigator.clipboard.writeText(csOut)} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.p}44`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button></div>
{renderSourceInfo()}
{csScores&&Object.keys(csScores).length>0&&<div style={{marginBottom:12}}>
<div style={{fontSize:12,fontWeight:700,color:"#6b5fd1",marginBottom:6,display:"flex",alignItems:"center",gap:6}}><span>📊 評価スコア（10点満点）</span><span style={{fontSize:11,color:"#94a3b8",fontWeight:500}}>{Object.keys(csScores).length}/8項目</span></div>
<ScoreRadar scores={csScores}/>
</div>}
<textarea value={csOut} onChange={e=>setCsOut(e.target.value)} style={{width:"100%",height:400,padding:14,borderRadius:12,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.8,boxSizing:"border-box"}}/>
<div style={{display:"flex",gap:8,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
<button onClick={saveCounselingAnalysis} disabled={csSaving} style={{padding:"8px 18px",borderRadius:12,border:"none",background:csSaving?C.g200:"linear-gradient(135deg,#7f77dd,#5a4fc4)",color:C.w,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:csSaving?"not-allowed":"pointer"}}>{csSaving?"⏳ 保存中...":"💾 保存"}</button>
{csSaveMsg&&<span style={{fontSize:12,fontWeight:600,color:csSaveMsg.includes("失敗")?"#dc2626":"#16a34a"}}>{csSaveMsg}</span>}
</div>
{csUsage&&<div style={{marginTop:16,padding:12,background:"#f8f4ff",border:"1px solid #d4cce8",borderRadius:10,fontSize:13,color:"#475569"}}>
  <div style={{fontWeight:700,marginBottom:6,color:"#6b5fd1"}}>📊 API使用量</div>
  <div>モデル: <strong>{csUsage.model_resolved||csAiModel}</strong>　／　入力: <strong>{(csUsage.input_tokens||0).toLocaleString()}</strong> tokens　／　出力: <strong>{(csUsage.output_tokens||0).toLocaleString()}</strong> tokens　／　合計: <strong>{((csUsage.input_tokens||0)+(csUsage.output_tokens||0)).toLocaleString()}</strong> tokens</div>
  <div style={{marginTop:4}}>料金: <strong style={{color:"#7c3aed",fontSize:15}}>¥{(csUsage.cost_jpy||0).toFixed(2)}</strong><span style={{marginLeft:10,fontSize:11,color:"#94a3b8"}}>(USD ${(csUsage.cost_usd||0).toFixed(4)} ／ レート ¥{csUsage.usd_jpy_rate||155}/USD)</span></div>
</div>}
</div>}

{/* 履歴モーダル */}
{csShowHistory&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setCsShowHistory(false)}}>
<div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #e2e8f0",flexWrap:"wrap",gap:8}}>
<h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#5a4fc4"}}>📂 カウンセリング分析履歴 <span style={{fontSize:12,color:"#94a3b8",fontWeight:500}}>{csHistory.length}件</span></h3>
<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
{csSelectMode&&<>
  <button onClick={()=>setCsSelectedIds(new Set(csHistory.map(x=>x.id)))} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #c4b5fd",background:"#f5f3ff",fontSize:11,fontWeight:600,color:"#5b21b6",fontFamily:"inherit",cursor:"pointer"}}>☑ 全選択</button>
  <button onClick={()=>setCsSelectedIds(new Set())} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"#fff",fontSize:11,fontWeight:600,color:"#64748b",fontFamily:"inherit",cursor:"pointer"}}>⬜ 全解除</button>
  <button onClick={deleteCsSelected} disabled={csSelectedIds.size===0} style={{padding:"4px 12px",borderRadius:6,border:"none",background:csSelectedIds.size>0?"#dc2626":"#ddd",color:"#fff",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:csSelectedIds.size>0?"pointer":"not-allowed"}}>🗑 {csSelectedIds.size}件削除</button>
</>}
<button onClick={()=>{setCsSelectMode(p=>{if(p)setCsSelectedIds(new Set());return!p})}} style={{padding:"4px 10px",borderRadius:6,border:csSelectMode?"2px solid #7c3aed":"1px solid #ddd",background:csSelectMode?"#faf8ff":"#fff",color:csSelectMode?"#7c3aed":"#555",fontSize:11,fontWeight:csSelectMode?700:500,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>{csSelectMode?"✕ 選択モード解除":"☑ 選択モード"}</button>
<button onClick={()=>setCsShowHistory(false)} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:12,fontWeight:600,color:"#64748b",fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
{csHistoryLd&&<div style={{textAlign:"center",padding:40}}><div style={{width:28,height:28,border:"3px solid #e9e6ff",borderTop:"3px solid #7f77dd",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:"#64748b",fontSize:12}}>読み込み中...</span></div>}
{!csHistoryLd&&csHistory.length===0&&<div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:13}}>保存された分析履歴がありません</div>}
{!csHistoryLd&&csHistory.map(r=>{
  const dateStr=r.created_at?new Date(r.created_at).toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
  const typeColor=r.analysis_type==="総合分析"?"#7c3aed":r.analysis_type==="傾聴・共感"?"#0891b2":r.analysis_type==="ニーズ把握"?"#16a34a":r.analysis_type==="マーケティング"?"#f59e0b":"#dc2626";
  const csSel=csSelectedIds.has(r.id);
  return(<div key={r.id} onClick={()=>{if(csSelectMode)toggleIdInSet(setCsSelectedIds,r.id)}} style={{padding:12,borderRadius:12,border:csSelectMode&&csSel?"2px solid #dc2626":"1px solid #e9e6ff",background:csSelectMode&&csSel?"#fef2f2":"#faf9ff",marginBottom:8,cursor:csSelectMode?"pointer":"default"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
      {csSelectMode&&<input type="checkbox" checked={csSel} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{width:18,height:18,marginRight:4,cursor:"pointer",flexShrink:0,accentColor:"#dc2626"}}/>}
      <div style={{flex:1,minWidth:200}}>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
          <span style={{fontSize:10,fontWeight:700,color:typeColor,padding:"2px 8px",borderRadius:6,background:typeColor+"15",border:`1px solid ${typeColor}44`}}>{r.analysis_type||"分析"}</span>
          <span style={{fontSize:10,color:"#94a3b8"}}>{dateStr}</span>
          {r.source_patient_id&&<span style={{fontSize:10,fontWeight:600,color:"#3a6ea5",padding:"2px 7px",borderRadius:6,background:"#f0f7ff",border:"1px solid #cce0ff"}}>📋 患者ID: {r.source_patient_id}</span>}
          {r.source_date&&<span style={{fontSize:10,fontWeight:600,color:"#3a6ea5",padding:"2px 7px",borderRadius:6,background:"#f0f7ff",border:"1px solid #cce0ff"}}>📅 {(()=>{try{return new Date(r.source_date).toLocaleDateString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"})}catch{return r.source_date}})()}</span>}
        </div>
        {renderTitleEditor(r,{reloadFn:loadCsHistory,isSelectMode:csSelectMode,localUpdater:(id,t)=>setCsHistory(p=>p.map(x=>x.id===id?{...x,title:t}:x)),titleStyle:{fontSize:13,fontWeight:600,color:"#334155",wordBreak:"break-word"}})}
        {r.scores&&Object.keys(r.scores).length>0&&<div style={{fontSize:10,color:"#6b5fd1",marginTop:4}}>📊 スコア{Object.keys(r.scores).length}項目</div>}
      </div>
      {!csSelectMode&&<div style={{display:"flex",gap:4}}>
        <button onClick={()=>restoreCsAnalysis(r)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #7f77dd",background:"#fff",fontSize:11,fontWeight:600,color:"#5a4fc4",fontFamily:"inherit",cursor:"pointer"}}>↻ 再表示</button>
        <button onClick={()=>deleteCsAnalysis(r.id)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #fca5a5",background:"#fff",fontSize:11,fontWeight:600,color:"#dc2626",fontFamily:"inherit",cursor:"pointer"}}>🗑 削除</button>
      </div>}
    </div>
  </div>)
})}
</div>
</div>
</div>}

{/* 書き起こし選択モーダル */}
{csPickOpen&&(()=>{
  const q=csPickSearch.trim().toLowerCase();
  const filteredList=q?csPickList.filter(it=>((it.input_text||"").toLowerCase().includes(q))||((it.output_text||"").toLowerCase().includes(q))||((it.patient_name||"").toLowerCase().includes(q))||((it.patient_id||"").toLowerCase().includes(q))):csPickList;
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setCsPickOpen(false)}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:720,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #e2e8f0"}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#0c4a6e"}}>💬 カウンセリング書き起こしを選択 <span style={{fontSize:12,color:"#94a3b8",fontWeight:500}}>{csPickList.length}件</span></h3>
        <button onClick={()=>setCsPickOpen(false)} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:12,fontWeight:600,color:"#64748b",fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button>
      </div>
      <div style={{padding:"10px 20px 0"}}>
        <input type="text" placeholder="🔍 タイトル・患者名・本文で検索..." value={csPickSearch} onChange={e=>setCsPickSearch(e.target.value)} style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"1px solid "+C.g200,fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none"}}/>
      </div>
      <div style={{flex:1,overflow:"auto",padding:"12px 20px",display:"flex",flexDirection:"column",gap:8}}>
        {csPickLoading&&<div style={{textAlign:"center",padding:40}}><div style={{width:28,height:28,border:"3px solid #e0f2fe",borderTop:"3px solid #0891b2",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:"#64748b",fontSize:12}}>カウンセリング履歴を取得中...</span></div>}
        {!csPickLoading&&filteredList.length===0&&<div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:13}}>{csPickList.length===0?"カウンセリング履歴が見つかりません":"該当する書き起こしが見つかりません"}</div>}
        {!csPickLoading&&filteredList.map(item=>{
          const hasInput=!!(item.input_text&&item.input_text.trim());
          const hasOutput=!!(item.output_text&&item.output_text.trim());
          const baseText=item.input_text||item.output_text||"";
          const preview=baseText.substring(0,100)+(baseText.length>100?"...":"");
          const sourceTag=hasInput?"📝 書き起こし":hasOutput?"📋 要約のみ":"（内容なし）";
          const sourceColor=hasInput?"#0891b2":hasOutput?"#f59e0b":"#94a3b8";
          return(<div key={item.id} onClick={()=>selectCsRecord(item)} style={{border:"1px solid #e5e5e5",borderRadius:10,padding:12,cursor:"pointer",background:"#fafafa",transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background="#e0f2fe";e.currentTarget.style.borderColor="#0891b2"}} onMouseLeave={e=>{e.currentTarget.style.background="#fafafa";e.currentTarget.style.borderColor="#e5e5e5"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#0369a1",fontWeight:600}}>📅 {formatCsPickDate(item.created_at)}</span>
              <span style={{fontSize:9,color:sourceColor,fontWeight:700,padding:"1px 6px",borderRadius:5,background:sourceColor+"15",border:"1px solid "+sourceColor+"44"}}>{sourceTag}</span>
            </div>
            <div style={{fontSize:13,fontWeight:700,color:"#0c4a6e",marginBottom:6,wordBreak:"break-word"}}>{getCsDisplayTitle(item)}</div>
            <div style={{fontSize:12,color:"#475569",lineHeight:1.6,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{preview||"（プレビュー不可）"}</div>
          </div>);
        })}
      </div>
      <div style={{padding:"8px 20px 14px",fontSize:11,color:"#94a3b8",textAlign:"right",borderTop:"1px solid #f1f5f9"}}>{filteredList.length} / {csPickList.length} 件</div>
    </div>
  </div>);
})()}

{/* ② 患者ジャーニーマップ */}
<div style={{marginTop:16}}>
<div style={{...card,background:"linear-gradient(135deg,#f0f9ff,#e0f2fe)",border:"1.5px solid #7dd3fc"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,gap:6,flexWrap:"wrap"}}>
<h3 style={{fontSize:15,fontWeight:700,color:"#0369a1",margin:0}}>🗺️ 患者ジャーニーマップ生成</h3>
<button onClick={openJourneyHist} style={{padding:"5px 12px",borderRadius:10,border:"1px solid #7dd3fc",background:"#fff",fontSize:11,fontWeight:700,color:"#0369a1",fontFamily:"inherit",cursor:"pointer"}}>📂 ジャーニー履歴</button>
</div>
<p style={{fontSize:12,color:"#0c4a6e",marginBottom:10,lineHeight:1.6}}>カウンセリング・診療記録をAIが分析し、患者が「初回来院 → 検討 → 決断 → リピート」の各フェーズで感じている不安・期待・行動パターンを可視化します。ホームページ改善・問診票設計・接遇向上に活用できます。</p>
<div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
{[{v:"gemini-3-pro",label:"Gemini 3.1 Pro",desc:"最新・最高精度 ⭐"},{v:"gemini-3-5-flash",label:"Gemini 3.5 Flash ✨",desc:"最新・超高速"},{v:"claude",label:"Claude Sonnet 4.6",desc:"日本語精度"}].map(m=>{const selected=journeyModels.includes(m.v);return(<button key={m.v} onClick={()=>toggleJourneyModel(m.v)} disabled={journeyLoading} style={{position:"relative",flex:"1 1 140px",padding:"8px 10px 6px",borderRadius:10,border:selected?"2px solid #0369a1":"1px solid #cbd5e1",background:selected?"#e0f2fe":"#fff",fontSize:11,fontWeight:selected?700:500,color:selected?"#0369a1":"#64748b",cursor:journeyLoading?"not-allowed":"pointer",fontFamily:"inherit",textAlign:"center"}}>{selected&&<span style={{position:"absolute",top:3,left:6,color:"#0369a1",fontSize:12,fontWeight:700}}>✓</span>}<div>{m.label}</div><div style={{fontSize:9,marginTop:2,fontWeight:400,opacity:0.8}}>{m.desc}</div></button>)})}
</div>
{journeyLoading?(<button onClick={stopJourneyMap} style={{width:"100%",padding:"14px",borderRadius:12,border:"2px solid #dc2626",background:"#fef2f2",color:"#dc2626",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>⏹ AI生成中... (クリックで停止)</button>):(<button onClick={journeyModels.length>1?runJourneyMapAll:runJourneyMap} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#0369a1,#0891b2)",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>{journeyModels.length>1?`🗺️ ${journeyModels.length}個のAIで一斉生成`:"🗺️ 患者ジャーニーマップを生成する"}</button>)}
</div>
</div>

{/* 患者ジャーニーマップ モーダル */}
{journeyModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setJourneyModal(false)}}>
<div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #e2e8f0"}}>
<h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#0369a1"}}>🗺️ 患者ジャーニーマップ</h3>
<button onClick={()=>setJourneyModal(false)} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:12,fontWeight:600,color:"#64748b",fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:20}}>
{journeyLoading&&<div style={{textAlign:"center",padding:40}}>
<div style={{width:32,height:32,border:"3px solid #e2e8f0",borderTop:"3px solid #0369a1",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/>
<span style={{color:"#64748b"}}>カウンセリング・診療記録を分析中...</span>
</div>}
{/* 並列結果（複数モデル時） */}
{journeyResults.length>1&&<div style={{marginTop:0}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
<span style={{fontSize:13,fontWeight:700,color:"#0369a1"}}>🔬 {journeyResults.length}モデル比較</span>
{!journeyLoading&&journeyResults.some(r=>r.status==="done")&&<button onClick={saveJourneyResultsAll} disabled={journeySaving} style={{padding:"5px 12px",borderRadius:10,border:"none",background:journeySaving?"#e2e8f0":"linear-gradient(135deg,#0369a1,#0891b2)",color:"#fff",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:journeySaving?"not-allowed":"pointer"}}>{journeySaving?"⏳ 保存中...":"💾 完了分をすべて保存"}</button>}
</div>
{journeySaveMsg&&<div style={{fontSize:12,fontWeight:600,color:journeySaveMsg.includes("失敗")?"#dc2626":"#16a34a",marginBottom:8}}>{journeySaveMsg}</div>}

{/* タブ切替バー */}
<div style={{display:"flex",gap:2,marginBottom:8,borderBottom:"2px solid #e2e8f0",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
  <button onClick={()=>setJourneyCompareTab("all")} style={{padding:"7px 14px",border:"none",background:journeyCompareTab==="all"?"#0369a1":"transparent",color:journeyCompareTab==="all"?"#fff":"#475569",fontWeight:journeyCompareTab==="all"?700:500,borderRadius:"8px 8px 0 0",cursor:"pointer",whiteSpace:"nowrap",fontSize:12,fontFamily:"inherit",marginBottom:-2}}>🔬 全体比較</button>
  {journeyResults.map((r,i)=>{const color=csModelColor(r.model);const active=journeyCompareTab===r.model;return(<button key={i} onClick={()=>setJourneyCompareTab(r.model)} style={{padding:"7px 14px",border:"none",background:active?color:"transparent",color:active?"#fff":"#475569",fontWeight:active?700:500,borderRadius:"8px 8px 0 0",cursor:"pointer",whiteSpace:"nowrap",fontSize:12,fontFamily:"inherit",marginBottom:-2}}>{csModelLabel(r.model)}{r.status==="running"?" ⏳":r.status==="error"?" ⚠️":r.status==="aborted"?" ⏹":""}</button>)})}
</div>

{journeyCompareTab==="all"?(
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":`repeat(${journeyResults.length},minmax(0,1fr))`,gap:10}}>
{journeyResults.map((r,i)=>{
  const color=csModelColor(r.model);
  const elapsed=r.endedAt?((r.endedAt-r.startedAt)/1000).toFixed(1):null;
  return(<div key={i} style={{border:"1px solid #e2e8f0",borderRadius:10,padding:10,background:"#fff",display:"flex",flexDirection:"column",gap:6,minWidth:0}}>
    <div style={{paddingBottom:6,borderBottom:`2px solid ${color}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      <strong style={{fontSize:11,color}}>{csModelLabel(r.model)}</strong>
      <span style={{fontSize:10,fontWeight:600}}>{r.status==="running"?"⏳ 生成中...":r.status==="done"?"✅ 完了":r.status==="error"?"❌ エラー":r.status==="aborted"?"⏹ 停止":""}</span>
    </div>
    <div style={{maxHeight:360,overflowY:"auto",fontSize:11.5,lineHeight:1.65,whiteSpace:"pre-wrap",wordBreak:"break-word",color:"#334155",padding:"4px 6px",background:"#f8fafc",borderRadius:6}}>
      {r.status==="running"&&!r.output&&<div style={{textAlign:"center",padding:20,color:"#94a3b8"}}><div style={{width:24,height:24,border:`3px solid ${color}33`,borderTop:`3px solid ${color}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/>応答待ち...</div>}
      {r.status==="error"&&<div style={{color:"#dc2626"}}>⚠️ {r.error||"不明なエラー"}</div>}
      {r.status==="aborted"&&!r.output&&<div style={{color:"#64748b"}}>⏹ 停止されました</div>}
      {r.output}
    </div>
    {r.usage&&<div style={{padding:5,background:"#f8f4ff",borderRadius:6,fontSize:10,color:"#475569",lineHeight:1.4}}>
      <div>📊 入力 {(r.usage.input_tokens||0).toLocaleString()} / 出力 {(r.usage.output_tokens||0).toLocaleString()} tokens</div>
      <div>料金: <strong style={{color:"#7c3aed",fontSize:11}}>¥{(r.usage.cost_jpy||0).toFixed(2)}</strong></div>
    </div>}
    {elapsed&&<div style={{fontSize:9,color:"#94a3b8",textAlign:"right"}}>⏱ {elapsed}s</div>}
  </div>);
})}
</div>
):(
<div>
{journeyResults.filter(r=>r.model===journeyCompareTab).map((r,i)=>{
  const color=csModelColor(r.model);
  const elapsed=r.endedAt?((r.endedAt-r.startedAt)/1000).toFixed(1):null;
  return(<div key={i} style={{border:"1px solid #e2e8f0",borderRadius:12,padding:18,background:"#fff"}}>
    <div style={{paddingBottom:10,marginBottom:14,borderBottom:`3px solid ${color}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <strong style={{fontSize:16,color}}>{csModelLabel(r.model)}</strong>
      <span style={{fontSize:13,fontWeight:600}}>{r.status==="running"?"⏳ 生成中...":r.status==="done"?"✅ 完了":r.status==="error"?"❌ エラー":r.status==="aborted"?"⏹ 停止":""}</span>
    </div>
    <div style={{fontSize:14,lineHeight:1.8,whiteSpace:"pre-wrap",wordBreak:"break-word",color:"#334155",maxHeight:600,overflowY:"auto",marginBottom:14,padding:"10px 12px",background:"#f8fafc",borderRadius:10}}>
      {r.status==="running"&&!r.output&&<div style={{textAlign:"center",padding:30,color:"#94a3b8"}}><div style={{width:32,height:32,border:`3px solid ${color}33`,borderTop:`3px solid ${color}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/>応答待ち...</div>}
      {r.status==="error"&&<div style={{color:"#dc2626"}}>⚠️ {r.error||"不明なエラー"}</div>}
      {r.status==="aborted"&&!r.output&&<div style={{color:"#64748b"}}>⏹ 停止されました</div>}
      {r.output}
    </div>
    <div style={{display:"flex",gap:14,fontSize:12,color:"#475569",flexWrap:"wrap",alignItems:"center"}}>
      {r.usage&&<div>📊 入力 {(r.usage.input_tokens||0).toLocaleString()} / 出力 {(r.usage.output_tokens||0).toLocaleString()} tokens ／ <strong style={{color:"#7c3aed"}}>¥{(r.usage.cost_jpy||0).toFixed(2)}</strong></div>}
      {elapsed&&<div style={{marginLeft:"auto"}}>⏱ {elapsed}s</div>}
    </div>
  </div>);
})}
</div>
)}
</div>}

{/* 単一結果 */}
{journeyResult&&!journeyLoading&&journeyResults.length<=1&&<div>
<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
<button onClick={()=>{navigator.clipboard.writeText(journeyResult);sSt("📋 コピーしました")}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #e2e8f0",background:"#fff",fontSize:12,fontWeight:600,color:"#0369a1",fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={saveJourneyResult} disabled={journeySaving} style={{padding:"6px 14px",borderRadius:10,border:"none",background:journeySaving?"#e2e8f0":"linear-gradient(135deg,#0369a1,#0891b2)",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:journeySaving?"not-allowed":"pointer"}}>{journeySaving?"⏳ 保存中...":"💾 保存"}</button>
<button onClick={()=>{saveFavorite("カウンセリング","[患者ジャーニーマップ] "+new Date().toLocaleDateString("ja-JP"),journeyResult,"");setJourneyModal(false)}} style={{padding:"6px 14px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ お気に入り保存</button>
{journeySaveMsg&&<span style={{fontSize:11,fontWeight:600,color:journeySaveMsg.includes("失敗")?"#dc2626":"#16a34a"}}>{journeySaveMsg}</span>}
{journeyMeta?.model&&<span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>{csModelLabel(journeyMeta.model)||journeyMeta.model}</span>}
</div>
<pre style={{fontSize:13,color:"#334155",whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.8,fontFamily:"inherit",background:"#f8fafc",padding:14,borderRadius:12}}>{journeyResult}</pre>
{journeyMeta?.usage&&<div style={{marginTop:12,padding:10,background:"#f8f4ff",border:"1px solid #d4cce8",borderRadius:8,fontSize:12,color:"#475569"}}>
  <div style={{fontWeight:700,color:"#6b5fd1",marginBottom:4}}>📊 API使用量</div>
  <div>入力 {(journeyMeta.usage.input_tokens||0).toLocaleString()} / 出力 {(journeyMeta.usage.output_tokens||0).toLocaleString()} tokens　／　料金 <strong style={{color:"#7c3aed"}}>¥{(journeyMeta.usage.cost_jpy||0).toFixed(2)}</strong></div>
</div>}
</div>}
</div>
</div>
</div>}

{/* ジャーニー履歴モーダル */}
{journeyHistOpen&&(()=>{
  const q=journeyHistSearch.trim().toLowerCase();
  const filteredJourneyList=q?journeyHistList.filter(it=>((it.title||"").toLowerCase().includes(q))||((it.output_text||"").toLowerCase().includes(q))||((it.ai_model||"").toLowerCase().includes(q))):journeyHistList;
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setJourneyHistOpen(false)}}>
    <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:720,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #e2e8f0",flexWrap:"wrap",gap:8}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#0369a1"}}>📂 ジャーニーマップ履歴 <span style={{fontSize:12,color:"#94a3b8",fontWeight:500}}>{journeyHistList.length}件</span></h3>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        {journeySelectMode&&<>
          <button onClick={()=>setJourneySelectedIds(new Set(filteredJourneyList.map(x=>x.id)))} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #7dd3fc",background:"#f0f9ff",fontSize:11,fontWeight:600,color:"#0369a1",fontFamily:"inherit",cursor:"pointer"}}>☑ 全選択</button>
          <button onClick={()=>setJourneySelectedIds(new Set())} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"#fff",fontSize:11,fontWeight:600,color:"#64748b",fontFamily:"inherit",cursor:"pointer"}}>⬜ 全解除</button>
          <button onClick={deleteJourneySelected} disabled={journeySelectedIds.size===0} style={{padding:"4px 12px",borderRadius:6,border:"none",background:journeySelectedIds.size>0?"#dc2626":"#ddd",color:"#fff",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:journeySelectedIds.size>0?"pointer":"not-allowed"}}>🗑 {journeySelectedIds.size}件削除</button>
        </>}
        <button onClick={()=>{setJourneySelectMode(p=>{if(p)setJourneySelectedIds(new Set());return!p})}} style={{padding:"4px 10px",borderRadius:6,border:journeySelectMode?"2px solid #0891b2":"1px solid #ddd",background:journeySelectMode?"#f0fafd":"#fff",color:journeySelectMode?"#0891b2":"#555",fontSize:11,fontWeight:journeySelectMode?700:500,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>{journeySelectMode?"✕ 選択モード解除":"☑ 選択モード"}</button>
        <button onClick={()=>setJourneyHistOpen(false)} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:12,fontWeight:600,color:"#64748b",fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button>
        </div>
      </div>
      <div style={{padding:"10px 20px 0"}}>
        <input type="text" placeholder="🔍 タイトル・本文・モデルで検索..." value={journeyHistSearch} onChange={e=>setJourneyHistSearch(e.target.value)} style={{width:"100%",padding:"8px 12px",borderRadius:10,border:"1px solid #e2e8f0",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none"}}/>
      </div>
      <div style={{flex:1,overflow:"auto",padding:"12px 20px",display:"flex",flexDirection:"column",gap:8}}>
        {journeyHistLoading&&<div style={{textAlign:"center",padding:40}}><div style={{width:28,height:28,border:"3px solid #e0f2fe",borderTop:"3px solid #0891b2",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:"#64748b",fontSize:12}}>履歴を取得中...</span></div>}
        {!journeyHistLoading&&filteredJourneyList.length===0&&<div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:13}}>{journeyHistList.length===0?"保存された履歴がありません":"該当する履歴が見つかりません"}</div>}
        {!journeyHistLoading&&filteredJourneyList.map(item=>{
          const preview=(item.output_text||"").substring(0,100)+((item.output_text||"").length>100?"...":"");
          const jrnSel=journeySelectedIds.has(item.id);
          return(<div key={item.id} onClick={()=>{if(journeySelectMode)toggleIdInSet(setJourneySelectedIds,item.id)}} style={{border:journeySelectMode&&jrnSel?"2px solid #dc2626":"1px solid #e5e5e5",borderRadius:10,padding:12,background:journeySelectMode&&jrnSel?"#fef2f2":"#fafafa",position:"relative",transition:"all 0.15s",cursor:journeySelectMode?"pointer":"default",display:"flex",alignItems:"flex-start",gap:8}} onMouseEnter={e=>{if(!journeySelectMode){e.currentTarget.style.background="#e0f2fe";e.currentTarget.style.borderColor="#0891b2"}}} onMouseLeave={e=>{if(!journeySelectMode){e.currentTarget.style.background="#fafafa";e.currentTarget.style.borderColor="#e5e5e5"}}}>
            {journeySelectMode&&<input type="checkbox" checked={jrnSel} onChange={()=>{}} onClick={e=>e.stopPropagation()} style={{width:18,height:18,marginTop:2,cursor:"pointer",flexShrink:0,accentColor:"#dc2626"}}/>}
            <div onClick={journeySelectMode?undefined:()=>restoreJourney(item)} style={{cursor:journeySelectMode?"pointer":"pointer",paddingRight:journeySelectMode?0:36,flex:1,minWidth:0}}>
              <div style={{fontSize:11,color:"#0369a1",fontWeight:600,marginBottom:4}}>📅 {formatCsPickDate(item.created_at)}{item.ai_model?<span style={{marginLeft:6,color:"#94a3b8"}}>／ {item.ai_model}</span>:null}</div>
              {renderTitleEditor(item,{reloadFn:openJourneyHist,isSelectMode:journeySelectMode,localUpdater:(id,t)=>setJourneyHistList(p=>p.map(x=>x.id===id?{...x,title:t}:x)),titleStyle:{fontSize:13,fontWeight:700,color:"#0c4a6e",marginBottom:6,wordBreak:"break-word"}})}
              <div style={{fontSize:12,color:"#475569",lineHeight:1.6,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{preview||"（プレビューなし）"}</div>
            </div>
            {!journeySelectMode&&<button onClick={e=>{e.stopPropagation();deleteJourneyHist(item.id)}} title="この履歴を削除" style={{position:"absolute",top:8,right:8,padding:"4px 10px",borderRadius:8,border:"1px solid #fca5a5",background:"#fff",fontSize:11,fontWeight:600,color:"#dc2626",fontFamily:"inherit",cursor:"pointer"}}>🗑 削除</button>}
          </div>);
        })}
      </div>
      <div style={{padding:"8px 20px 14px",fontSize:11,color:"#94a3b8",textAlign:"right",borderTop:"1px solid #f1f5f9"}}>{filteredJourneyList.length} / {journeyHistList.length} 件</div>
    </div>
  </div>);
})()}
</div></div>);

// === TASKS ===
if(page==="tasks")return(<div style={{maxWidth:1200,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{prog>0&&<div style={{width:"100%",height:5,background:"rgba(160,220,100,0.2)",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#3a6820)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>✅ タスク管理</h2>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>{const matchSel=t=>selMatrixDate==="手動作成"?(!t.minute_id||!minHist.find(h=>h.id===t.minute_id)):t.minute_id===selMatrixDate;const et=selMatrixDate?tasks.filter(matchSel):tasks;const m=selMatrixDate&&selMatrixDate!=="手動作成"?minHist.find(h=>h.id===selMatrixDate):null;const labelForFile=selMatrixDate?(selMatrixDate==="手動作成"?"手動作成":(m?toJSTDate(m.created_at).replace(/\//g,"-")+"_"+new Date(m.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}).replace(":",""):"議事録")):"";exportToExcel(et,todos,minHist,selMatrixDate?"タスク_"+labelForFile:"四象限マトリクス");sSt("✓ Excelを出力しました")}} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:10,fontWeight:600,color:"#16a34a",fontFamily:"inherit",cursor:"pointer"}}>📊 Excel</button>
<button onClick={()=>{const matchSel=t=>selMatrixDate==="手動作成"?(!t.minute_id||!minHist.find(h=>h.id===t.minute_id)):t.minute_id===selMatrixDate;const et=selMatrixDate?tasks.filter(matchSel):tasks;const m=selMatrixDate&&selMatrixDate!=="手動作成"?minHist.find(h=>h.id===selMatrixDate):null;const labelForFile=selMatrixDate?(selMatrixDate==="手動作成"?"手動作成":(m?toJSTDate(m.created_at).replace(/\//g,"-")+"_"+new Date(m.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}).replace(":",""):"議事録")):"";exportToPDF(et,todos,minHist,selMatrixDate?"Tasks_"+labelForFile:"Task_Matrix");sSt("✓ PDFを出力しました")}} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:10,fontWeight:600,color:"#dc2626",fontFamily:"inherit",cursor:"pointer"}}>📕 PDF</button>
<button onClick={()=>{const matchSel=t=>selMatrixDate==="手動作成"?(!t.minute_id||!minHist.find(h=>h.id===t.minute_id)):t.minute_id===selMatrixDate;const et=selMatrixDate?tasks.filter(matchSel):tasks;const m=selMatrixDate&&selMatrixDate!=="手動作成"?minHist.find(h=>h.id===selMatrixDate):null;const labelForFile=selMatrixDate?(selMatrixDate==="手動作成"?"手動作成":(m?toJSTDate(m.created_at).replace(/\//g,"-")+"_"+new Date(m.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}).replace(":",""):"議事録")):"";exportToWord(et,todos,minHist,selMatrixDate?"タスク_"+labelForFile:"四象限マトリクス");sSt("✓ Wordを出力しました")}} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:10,fontWeight:600,color:"#2563eb",fontFamily:"inherit",cursor:"pointer"}}>📝 Word</button>
</div>
<span style={{fontSize:10,color:C.g400}}>{geminiModel||"Gemini 3.5 Flash"}</span>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
{st&&st!=="待機中"&&<div style={{fontSize:12,color:st.includes("✓")?"#22c55e":st.includes("エラー")?"#ef4444":"#f59e0b",fontWeight:600,marginBottom:8,textAlign:"center",padding:"4px 8px",borderRadius:8,background:st.includes("✓")?"#f0fdf4":st.includes("エラー")?"#fef2f2":"#fffbeb"}}>{st}</div>}
<div style={{marginBottom:12,display:"flex",gap:6,flexWrap:"wrap"}}>
{[{k:"matrix",l:"📊 四象限マトリクス",match:v=>taskView.startsWith("matrix")},{k:"daily",l:"📅 日別タスク"},{k:"timeline",l:"📊 タイムライン"},{k:"staff",l:"⚙️ スタッフ登録"}].map(v=>(<button key={v.k} onClick={()=>setTaskView(v.k)} style={{padding:"4px 12px",borderRadius:8,border:(v.match?v.match(v):taskView===v.k)?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:(v.match?v.match(v):taskView===v.k)?C.pLL:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>{v.l}</button>))}
</div>
{taskView.startsWith("matrix")?<div>
{(()=>{const ROLE_COLORS={director:{bg:"#fef2f2",border:"#fca5a5",text:"#dc2626",label:"👨‍⚕️ 院長"},manager:{bg:"#eff6ff",border:"#93c5fd",text:"#2563eb",label:"📊 マネジャー"},leader:{bg:"#f0fdf4",border:"#86efac",text:"#16a34a",label:"👤 リーダー"},staff:{bg:"#fffbeb",border:"#fcd34d",text:"#ca8a04",label:"🏥 スタッフ"}};
return(<>
<div style={{marginBottom:12,padding:10,borderRadius:10,border:"1px solid #e5e7eb",background:"#f9fafb"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,cursor:"pointer"}} onClick={()=>setMatrixHistOpen(!matrixHistOpen)}>
<span style={{fontSize:13,fontWeight:700,color:"#1f2937"}}>📅 タスク生成履歴</span>
<span style={{fontSize:11,color:"#9ca3af"}}>{matrixHistOpen?"▼":"▶"}</span>
</div>
{matrixHistOpen&&<div style={{display:"flex",flexDirection:"column",gap:4}}>
{selMatrixDate&&<button onClick={()=>setSelMatrixDate(null)} style={{padding:"3px 10px",borderRadius:6,border:"2px solid #6b7280",background:"#f3f4f6",fontSize:11,fontWeight:700,color:"#374151",cursor:"pointer",fontFamily:"inherit",alignSelf:"flex-start",marginBottom:4}}>🔄 全タスク表示に戻す</button>}
{(()=>{
// 議事録IDごとにタスクを集約（同日でも別議事録なら別エントリ）
const manualTasks=tasks.filter(t=>!t.minute_id||!minHist.find(h=>h.id===t.minute_id));
const minuteIds=[...new Set(tasks.map(t=>t.minute_id).filter(id=>id&&minHist.find(h=>h.id===id)))];
const entries=minuteIds.map(id=>{const m=minHist.find(h=>h.id===id);return{key:id,minute:m,tasks:tasks.filter(t=>t.minute_id===id)}}).sort((a,b)=>new Date(b.minute.created_at)-new Date(a.minute.created_at));
if(manualTasks.length>0)entries.unshift({key:"手動作成",minute:null,tasks:manualTasks});
return entries.map(entry=>{const doneCount=entry.tasks.filter(t=>t.done).length;const label=entry.key==="手動作成"?"📝 手動作成":"📅 "+toJSTDate(entry.minute.created_at)+" "+new Date(entry.minute.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+(entry.minute.title?" - "+entry.minute.title:"");const confirmLabel=entry.key==="手動作成"?"手動作成":toJSTDate(entry.minute.created_at)+" "+new Date(entry.minute.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+"の議事録";
return(<div key={entry.key} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:6,border:selMatrixDate===entry.key?"2px solid #0d9488":"1px solid #e5e7eb",background:selMatrixDate===entry.key?"#f0fdfa":"#fff",cursor:"pointer"}} onClick={()=>setSelMatrixDate(selMatrixDate===entry.key?null:entry.key)}>
<span style={{fontSize:12,fontWeight:600,color:"#0d9488",flex:1}}>{label}</span>
<span style={{fontSize:10,color:"#6b7280"}}>{doneCount}/{entry.tasks.length}完了</span>
<button onClick={e=>{e.stopPropagation();if(window.confirm(confirmLabel+"のタスク("+entry.tasks.length+"件)を全て削除しますか？")){Promise.all(entry.tasks.map(t=>supabase.from("tasks").delete().eq("id",t.id))).then(()=>{loadTasks();loadTodos();sSt("✓ タスクを削除しました")})}}} style={{fontSize:9,color:"#ef4444",background:"none",border:"1px solid #fca5a5",borderRadius:4,padding:"1px 6px",cursor:"pointer"}}>🗑 削除</button>
</div>)})})()}
</div>}
</div>
<div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
<span style={{fontSize:12,fontWeight:700,color:"#374151"}}>役職:</span>
{Object.entries(ROLE_COLORS).map(([key,rc])=>(<label key={key} style={{display:"flex",alignItems:"center",gap:3,padding:"3px 8px",borderRadius:6,border:selRoles.includes(key)?"2px solid "+rc.border:"1px solid #e5e7eb",background:selRoles.includes(key)?rc.bg:"#fff",fontSize:11,fontWeight:600,color:rc.text,cursor:"pointer"}}>
<input type="checkbox" checked={selRoles.includes(key)} onChange={()=>setSelRoles(p=>p.includes(key)?p.filter(r=>r!==key):[...p,key])} style={{cursor:"pointer"}}/>
{rc.label}
</label>))}
<button onClick={()=>setSelRoles(["director","manager","leader","staff"])} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #e5e7eb",background:"#fff",fontSize:10,color:"#6b7280",cursor:"pointer",fontFamily:"inherit"}}>全選択</button>
</div>
{(()=>{const QUADS=[{key:"uimp",label:"🔴 緊急×重要",filter:t=>t.urgency>=3&&t.importance>=3,bg:"#fef2f2",border:"#fca5a5"},{key:"nimp",label:"🟡 非緊急×重要",filter:t=>t.urgency<3&&t.importance>=3,bg:"#fffbeb",border:"#fcd34d"},{key:"unot",label:"🟠 緊急×非重要",filter:t=>t.urgency>=3&&t.importance<3,bg:"#fff7ed",border:"#fdba74"},{key:"nnot",label:"🟢 非緊急×非重要",filter:t=>t.urgency<3&&t.importance<3,bg:"#f0fdf4",border:"#86efac"}];
const filterBase=t=>selRoles.includes(t.role_level||"staff")&&(!selMatrixDate||(selMatrixDate==="手動作成"?(!t.minute_id||!minHist.find(h=>h.id===t.minute_id)):t.minute_id===selMatrixDate));
const renderTask=(t,fs)=>{const rc=ROLE_COLORS[t.role_level]||ROLE_COLORS.staff;const isOpen=openTaskIds.has(t.id);const taskTodos=todos.filter(td=>td.task_id===t.id);const doneCount=taskTodos.filter(td=>td.done).length;return(<div key={t.id} style={{padding:6,borderRadius:8,background:"#fff",marginBottom:4,fontSize:fs||11,border:"2px solid "+rc.border,cursor:"pointer"}} onClick={()=>setOpenTaskIds(prev=>{const n=new Set(prev);if(n.has(t.id))n.delete(t.id);else n.add(t.id);return n})}>
<div style={{display:"flex",alignItems:"center",gap:4}}>
<input type="checkbox" checked={selTaskIds.has(t.id)} onChange={e=>{e.stopPropagation();setSelTaskIds(prev=>{const n=new Set(prev);if(n.has(t.id))n.delete(t.id);else n.add(t.id);return n})}} style={{cursor:"pointer",accentColor:C.p}}/>
<input type="checkbox" checked={t.done} onChange={e=>{e.stopPropagation();toggleTask(t.id,t.done)}} style={{cursor:"pointer"}}/>
<span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:rc.bg,color:rc.text,fontWeight:700}}>{rc.label.split(" ")[1]}</span>
<span style={{textDecoration:t.done?"line-through":"none",flex:1,fontWeight:600}}>{t.title}</span>
<button onClick={e=>{e.stopPropagation();deleteTask(t.id)}} style={{fontSize:9,color:"#ef4444",background:"none",border:"none",cursor:"pointer",padding:"2px"}}>✕</button>
</div>
<div style={{display:"flex",gap:6,marginTop:2,fontSize:10,color:"#6b7280"}}><span>👤 {t.assignee||"未定"}</span><span>📅 {t.due_date||"未定"}</span>{taskTodos.length>0&&<span>📝 {doneCount}/{taskTodos.length}</span>}<span>{isOpen?"▼":"▶"}</span></div>
{isOpen&&<div onClick={e=>e.stopPropagation()} style={{marginTop:6,padding:6,background:"#f9fafb",borderRadius:6,border:"1px solid #e5e7eb"}}>
<div style={{display:"flex",gap:4,marginBottom:4}}><select value={t.assignee||""} onChange={e=>updateTask(t.id,"assignee",e.target.value)} style={{fontSize:9,padding:"1px 4px",borderRadius:4,border:"1px solid #d1d5db"}}><option value="">担当未定</option>{staffList.map(s=>(<option key={s.id} value={s.name}>{s.name}</option>))}</select><input type="date" value={t.due_date||""} onChange={e=>updateTask(t.id,"due_date",e.target.value)} style={{fontSize:9,padding:"1px 4px",borderRadius:4,border:"1px solid #d1d5db"}}/></div>
{taskTodos.length===0?<button onClick={()=>generateTodosForTask(t)} style={{padding:"4px 12px",borderRadius:6,border:"none",background:C.p,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}}>🔄 TODO自動生成</button>
:<div>{taskTodos.map(td=>(<div key={td.id} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 0",borderBottom:"1px solid #f3f4f6"}}><input type="checkbox" checked={td.done} onChange={()=>toggleTodo(td.id,td.done)} style={{cursor:"pointer"}}/><span style={{flex:1,fontSize:11,textDecoration:td.done?"line-through":"none"}}>{td.title}</span><select value={td.assignee||""} onChange={e=>updateTodo(td.id,"assignee",e.target.value)} style={{fontSize:9,padding:"1px 3px",borderRadius:3,border:"1px solid #d1d5db"}}><option value="">担当</option>{staffList.map(s=>(<option key={s.id} value={s.name}>{s.name}</option>))}</select><input type="date" value={td.due_date||""} onChange={e=>updateTodo(td.id,"due_date",e.target.value)} style={{fontSize:9,padding:"1px 3px",borderRadius:3,border:"1px solid #d1d5db",width:90}}/><button onClick={()=>deleteTodo(td.id)} style={{fontSize:9,color:"#ef4444",background:"none",border:"none",cursor:"pointer"}}>✕</button></div>))}</div>}
{todoLd&&openTaskIds.has(t.id)&&<div style={{textAlign:"center",padding:8}}><span style={{fontSize:11,color:"#6b7280"}}>TODO生成中...</span></div>}
</div>}
</div>)};
return<>
<div style={{display:"flex",gap:6,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}>
<button onClick={()=>setMatrixMode(matrixMode==="collapse"?"matrix":"collapse")} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.p}`,background:matrixMode==="matrix"?C.pLL:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>{matrixMode==="matrix"?"📦 収納表示":"📊 マトリクス表示"}</button>
{matrixMode==="collapse"&&<button onClick={()=>{if(selTaskIds.size>0)setMatrixMode("matrix")}} disabled={!selTaskIds.size} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.p}44`,background:!selTaskIds.size?"#e5e7eb":"#eff6ff",fontSize:12,fontWeight:600,color:!selTaskIds.size?C.g400:"#2563eb",fontFamily:"inherit",cursor:!selTaskIds.size?"default":"pointer"}}>📊 選択したタスクをマトリクス表示（{selTaskIds.size}件）</button>}
{selTaskIds.size>0&&<button onClick={()=>setSelTaskIds(new Set())} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>選択解除</button>}
</div>
{matrixMode==="matrix"?<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:8}}>
{QUADS.map(q=>{const qTasks=tasks.filter(t=>q.filter(t)&&filterBase(t)&&(selTaskIds.size===0||selTaskIds.has(t.id)));return<div key={q.key} style={{padding:10,borderRadius:12,border:`2px solid ${q.border}`,background:q.bg,minHeight:120}}>
<div style={{fontSize:13,fontWeight:700,marginBottom:6}}>{q.label}（{qTasks.length}件）</div>
{qTasks.map(t=>renderTask(t,selTaskIds.size>0?15:11))}
</div>})}
</div>:<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:8}}>
{QUADS.map(q=>{const qTasks=tasks.filter(t=>q.filter(t)&&filterBase(t));const isOpen2=openQuadrant===q.key;return<div key={q.key} style={{borderRadius:14,border:"1px solid rgba(160,220,100,0.2)",background:"rgba(255,255,255,0.6)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",overflow:"hidden"}}>
<div onClick={()=>setOpenQuadrant(isOpen2?null:q.key)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",cursor:"pointer",background:q.bg,borderBottom:isOpen2?`1px solid ${q.border}`:"none"}}>
<span style={{fontSize:13,fontWeight:700}}>{q.label}</span>
<div style={{display:"flex",gap:6,alignItems:"center"}}><span style={{fontSize:11,fontWeight:700,background:q.border,color:"#fff",padding:"2px 8px",borderRadius:10}}>{qTasks.length}件</span><span style={{fontSize:12}}>{isOpen2?"▲":"▼"}</span></div>
</div>
{isOpen2&&<div style={{padding:8}}>{qTasks.length===0?<div style={{fontSize:12,color:C.g400,textAlign:"center",padding:12}}>タスクなし</div>:qTasks.map(t=>renderTask(t,11))}</div>}
</div>})}
</div>}
</>})()}
</>)})()}
</div>:taskView==="daily"?<div>
<h3 style={{fontSize:14,fontWeight:700,color:C.pDD,marginBottom:8}}>📅 日別タスク</h3>
{(()=>{const grouped={};tasks.forEach(t=>{const m=minHist.find(x=>x.id===t.minute_id);const dateKey=m?toJSTDate(m.created_at):"日付なし";if(!grouped[dateKey])grouped[dateKey]=[];grouped[dateKey].push(t)});return Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([date,tks])=>(<div key={date} style={{marginBottom:12}}>
<div style={{fontSize:13,fontWeight:700,color:C.pD,marginBottom:6,padding:"4px 10px",borderRadius:8,background:C.pLL,display:"inline-block"}}>📅 {date}（{tks.length}件）</div>
{tks.map(t=>(<div key={t.id} style={{padding:6,borderRadius:8,background:C.w,marginBottom:4,fontSize:11,border:`1px solid ${C.g200}`}}>
<div style={{display:"flex",alignItems:"center",gap:4}}>
<input type="checkbox" checked={t.done} onChange={()=>toggleTask(t.id,t.done)} style={{cursor:"pointer"}}/>
<span style={{textDecoration:t.done?"line-through":"none",flex:1,fontWeight:600}}>{t.title}</span>
<span style={{fontSize:9,color:C.g400}}>👤 {t.assignee||"未定"}</span></div>
</div>))}
</div>))})()}
</div>:taskView==="timeline"?<div>
<h3 style={{fontSize:14,fontWeight:700,color:C.pDD,marginBottom:8}}>📊 タイムライン</h3>
{(()=>{const sorted=[...tasks].sort((a,b)=>{if(!a.due_date&&!b.due_date)return 0;if(!a.due_date)return 1;if(!b.due_date)return -1;return a.due_date.localeCompare(b.due_date)});const today=new Date().toISOString().split("T")[0];return sorted.map(t=>{const overdue=t.due_date&&t.due_date<today&&!t.done;const done=t.done;return(<div key={t.id} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:8}}>
<div style={{width:3,minHeight:40,borderRadius:2,background:done?"#22c55e":overdue?"#ef4444":C.g200,flexShrink:0,marginTop:4}}/>
<div style={{flex:1,padding:8,borderRadius:10,border:`1px solid ${done?"#bbf7d0":overdue?"#fecaca":C.g200}`,background:done?"#f0fdf4":overdue?"#fef2f2":C.w}}>
<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:2}}>
<input type="checkbox" checked={t.done} onChange={()=>toggleTask(t.id,t.done)} style={{cursor:"pointer"}}/>
<span style={{fontSize:12,fontWeight:600,textDecoration:done?"line-through":"none",color:done?C.g400:C.g700}}>{t.title}</span></div>
<div style={{display:"flex",gap:8,fontSize:10,color:C.g400}}>
<span>👤 {t.assignee||"未定"}</span>
<span style={{color:overdue?"#ef4444":C.g400,fontWeight:overdue?700:400}}>📅 {t.due_date||"期限なし"}{overdue?" ⚠️ 期限超過":""}</span>
<span style={{padding:"0 4px",borderRadius:4,background:({operations:"#dbeafe",medical:"#dcfce7",hr:"#fef3c7",finance:"#f3e8ff"})[t.category]||"#f3f4f6",fontSize:9}}>{({operations:"運営",medical:"医療",hr:"人事",finance:"経理"})[t.category]||t.category}</span>
</div></div></div>)})})()}
</div>:<div>
<h3 style={{fontSize:14,fontWeight:700,color:C.pDD,marginBottom:8}}>👥 スタッフ登録</h3>
<div style={{display:"flex",gap:6,marginBottom:12}}>
<input id="staff-name" placeholder="名前" style={{flex:1,padding:"6px 10px",borderRadius:8,border:`1.5px solid ${C.g200}`,fontSize:13,fontFamily:"inherit"}}/>
<input id="staff-role" placeholder="役職（例：医師、看護師、事務）" style={{flex:1,padding:"6px 10px",borderRadius:8,border:`1.5px solid ${C.g200}`,fontSize:13,fontFamily:"inherit"}}/><button onClick={async()=>{const n=document.getElementById("staff-name").value.trim();const r=document.getElementById("staff-role").value.trim();if(!n||!supabase)return;await supabase.from("staff").insert({name:n,role:r});document.getElementById("staff-name").value="";document.getElementById("staff-role").value="";loadStaff()}} style={{padding:"6px 16px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>追加</button>
</div>{staffList.map(s=>(<div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,border:`1px solid ${C.g200}`,marginBottom:4}}>
<span style={{fontSize:13}}><strong>{s.name}</strong> <span style={{color:C.g400,fontSize:11}}>({s.role||"役職なし"})</span></span>
<button onClick={async()=>{if(!supabase)return;await supabase.from("staff").delete().eq("id",s.id);loadStaff()}} style={{padding:"2px 8px",borderRadius:6,border:"none",background:C.err,color:C.w,fontSize:10,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>削除</button>
</div>))}
</div>}
</div>);

// === SETTINGS ===
if(page==="settings")return(<div style={{maxWidth:900,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>⚙️ 設定</h2>
<div style={{display:"flex",gap:8,alignItems:"center"}}>
{savedMsg&&<span style={{fontSize:12,color:C.rG,fontWeight:600}}>{savedMsg}</span>}
<button onClick={()=>{try{localStorage.setItem("mk_logo",logoUrl);localStorage.setItem("mk_logoSize",String(logoSize));localStorage.setItem("mk_dict",JSON.stringify(dict));localStorage.setItem("mk_snippets",JSON.stringify(snippets));localStorage.setItem("mk_pipSnippets",JSON.stringify(pipSnippets));localStorage.setItem("mk_audioSave",audioSave?"1":"0");localStorage.setItem("mk_dictEnabled",dictEnabled?"1":"0");localStorage.setItem("mk_shortcuts",JSON.stringify(shortcuts));if(tplOrder)localStorage.setItem("mk_tplOrder",JSON.stringify(tplOrder));if(tplVisible)localStorage.setItem("mk_tplVisible",JSON.stringify(tplVisible));setSavedMsg("✓ 保存しました");setTimeout(()=>setSavedMsg(""),3000)}catch(e){setSavedMsg("保存エラー")}}} style={{padding:"8px 20px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:`0 2px 8px rgba(0,0,0,.1)`}}>💾 保存</button>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div></div>
<p style={{fontSize:11,color:C.g400,marginBottom:12}}>💾 録音中の書き起こしは約10秒ごとに端末内へ自動保存されます。電源断の場合、直前の最大10秒程度は失われることがあります。</p>
{/* モデル稼働チェック */}
<div style={{...card,marginBottom:16}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:8}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,margin:0}}>🩺 モデル稼働チェック</h3>
<button onClick={()=>runModelCheck(true)} disabled={modelChecking} style={{padding:"6px 14px",borderRadius:10,border:"none",background:modelChecking?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:modelChecking?"default":"pointer"}}>{modelChecking?"⏳ 確認中...":"🔄 今すぐ確認"}</button>
</div>
<p style={{fontSize:11,color:C.g400,marginBottom:8}}>2週間に1回、起動時に自動でGoogleのモデル一覧（ListModels）と照合し、使用中モデルの廃番・新版を検知します。自動でモデルは切り替えません（誤検知防止）。廃番疑いが出たら gemini-models.js を更新してください。</p>
{!modelCheck&&<p style={{fontSize:12,color:C.g500,margin:0}}>まだ確認していません。「🔄 今すぐ確認」を押してください。</p>}
{modelCheck&&modelCheck.ok===false&&<p style={{fontSize:12,color:C.err,margin:0}}>⚠️ チェックに失敗しました（{modelCheck.error||"原因不明"}）。本体機能には影響しません。</p>}
{modelCheck&&modelCheck.ok&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
{(modelCheck.missing&&modelCheck.missing.length>0)?
<div style={{padding:8,borderRadius:8,background:"#fef2f2",border:"1px solid #fecaca",fontSize:12,color:"#991b1b",lineHeight:1.6}}>⚠️ <b>廃番の可能性</b>: <b>{modelCheck.missing.join("・")}</b> が利用可能一覧にありません。要約・資料作成・ジャーニーマップ・セミナー要約・校正などに影響する可能性があります。gemini-models.js のモデル更新をご検討ください。</div>
:<div style={{padding:8,borderRadius:8,background:"#f0fdf4",border:"1px solid #bbf7d0",fontSize:12,color:"#166534"}}>✓ 使用中のモデルはすべて利用可能です。</div>}
{modelCheck.missingPreview&&modelCheck.missingPreview.length>0&&<div style={{padding:8,borderRadius:8,background:"#fffbeb",border:"1px solid #fde68a",fontSize:12,color:"#92400e",lineHeight:1.6}}>ℹ️ プレビュー版 {modelCheck.missingPreview.join("・")} は現在一覧にありません（プレビューは提供が流動的です）。</div>}
{modelCheck.known_new&&modelCheck.known_new.length>0&&<div style={{padding:8,borderRadius:8,background:"#eff6ff",border:"1px solid #bfdbfe",fontSize:12,color:"#1e40af",lineHeight:1.6}}>ℹ️ <b>新版あり</b>: {modelCheck.known_new.join("・")} が利用可能になりました。必要に応じて gemini-models.js への追加をご検討ください。</div>}
<span style={{fontSize:11,color:C.g400}}>最終確認: {modelCheck.checkedAt?new Date(modelCheck.checkedAt).toLocaleString("ja-JP"):"—"}（利用可能 {Array.isArray(modelCheck.available)?modelCheck.available.length:0} モデル）</span>
</div>}
</div>
{/* Logo */}
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🏥 過去カルテ情報（{pastCount}件保存済み）</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:8}}>電子カルテの過去記録をインポートすると、要約・説明資料・テンプレート提案の精度が向上します。</p>
<div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
<input value={pastDisease} onChange={e=>setPastDisease(e.target.value)} placeholder="疾患名（任意：絞り込み用）" style={{...ib,width:160}}/>
<input value={pastSource} onChange={e=>setPastSource(e.target.value)} placeholder="出典（例：ORCA、メディコム）" style={{...ib,width:160}}/>
<div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)importPastFile(f)}} onClick={()=>{const i=document.createElement("input");i.type="file";i.accept=".txt,.csv,.tsv,.text";i.onchange=e=>{const f=e.target.files[0];if(f)importPastFile(f)};i.click()}} style={{padding:"6px 14px",borderRadius:10,border:`2px dashed ${C.g200}`,background:C.g50,fontSize:11,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>📁 ファイル読込</div></div>
<textarea value={pastInput} onChange={e=>setPastInput(e.target.value)} placeholder={"電子カルテの内容をペースト（複数件は空行で区切る）\n\n例：\nS: 2週間前から顔面に紅斑、痒み\nO: 両頬に紅斑、丘疹散在\nA: アトピー性皮膚炎の増悪\nP: アンテベート軟膏 f/u 2w\n\n（空行）\n\nS: 足底のイボ、増大傾向\nO: 右足底に疣贅 5mm\nA: 尋常性疣贅\nP: 液体窒素凍結 f/u 2w"} style={{width:"100%",height:120,padding:10,borderRadius:10,border:`1px solid ${C.g200}`,fontSize:12,color:C.g700,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box",marginBottom:8}}/>
<div style={{display:"flex",gap:8,alignItems:"center"}}>
<button onClick={savePastRecords} disabled={pastLd||!pastInput.trim()} style={{padding:"8px 20px",borderRadius:10,border:"none",background:pastLd?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!pastInput.trim()?.45:1}}>{pastLd?"⏳ 保存中...":"💾 カルテ保存"}</button>
{pastMsg&&<span style={{fontSize:12,color:pastMsg.includes("✓")?C.rG:C.err,fontWeight:600}}>{pastMsg}</span>}
</div></div>
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🎙️ 書き起こしエンジン</h3>
<div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
<button onClick={()=>{setAsrEngine("whisper");localStorage.setItem("mk_asrEngine","whisper")}} style={{flex:1,padding:"8px",borderRadius:10,border:asrEngine==="whisper"?`2px solid ${C.pD}`:`1px solid ${C.g200}`,background:asrEngine==="whisper"?C.pLL:C.w,fontSize:12,fontWeight:asrEngine==="whisper"?700:500,color:asrEngine==="whisper"?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>
🤖 Whisper<br/><span style={{fontSize:10,fontWeight:400}}>OpenAI（現在の標準）</span>
</button>
<div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
<button disabled style={{width:"100%",padding:"8px",borderRadius:10,border:`1px solid ${C.g200}`,background:"#f3f4f6",fontSize:12,fontWeight:500,color:C.g400,fontFamily:"inherit",cursor:"not-allowed",opacity:0.6}}>
⚡ Qwen3-ASR<br/><span style={{fontSize:10,fontWeight:400}}>Alibaba（現在利用不可）</span>
</button>
<details style={{fontSize:11,color:C.g500}}>
<summary style={{cursor:"pointer",userSelect:"none",padding:"2px 4px",borderRadius:4,color:C.g400}}>⚠️ 使用できない理由</summary>
<div style={{marginTop:6,padding:8,borderRadius:8,background:"#fef9c3",border:"1px solid #fde68a",fontSize:11,color:"#92400e",lineHeight:1.7}}>
<b>Qwen3-ASRがこのアプリで動作しない技術的理由：</b><br/>
<br/>
① <b>OpenAI互換エンドポイント</b><br/>
　`/compatible-mode/v1/audio/transcriptions` はパブリックURLのみ対応。<br/>
　ブラウザから直接録音した音声ファイル（ローカルファイル）は送信不可。<br/>
<br/>
② <b>multimodal-generationエンドポイント</b><br/>
　base64形式での音声送信を試みたが404エラーが発生。<br/>
　DashScope Singapore リージョンでこの形式は非対応。<br/>
<br/>
③ <b>WebSocket方式（リアルタイム版）</b><br/>
　Vercelはサーバーレス環境のため長時間のWebSocket接続が維持できない。<br/>
<br/>
<b>将来的な解決策：</b><br/>
　・Alibaba CloudのFunction Computeに独自サーバーを立てる<br/>
　・Qwen3-ASR-Toolkitを使った音声をSupabase経由で渡す仕組みを構築する<br/>
　・DashScopeのAPI仕様が更新され直接ファイル送信に対応した場合
</div>
</details>
</div>
<button onClick={()=>{setAsrEngine("gemini");localStorage.setItem("mk_asrEngine","gemini")}} style={{flex:1,padding:"8px",borderRadius:10,border:asrEngine==="gemini"?`2px solid #1d4ed8`:`1px solid ${C.g200}`,background:asrEngine==="gemini"?"#eff6ff":C.w,fontSize:12,fontWeight:asrEngine==="gemini"?700:500,color:asrEngine==="gemini"?"#1d4ed8":C.g500,fontFamily:"inherit",cursor:"pointer"}}>
🔷 Gemini 3.1<br/><span style={{fontSize:10,fontWeight:400}}>Google（追加設定不要）</span>
</button>
<button onClick={()=>{setAsrEngine("avalon");localStorage.setItem("mk_asrEngine","avalon")}} style={{flex:1,minWidth:120,padding:"8px",borderRadius:10,border:asrEngine==="avalon"?`2px solid #7c3aed`:`1px solid ${C.g200}`,background:asrEngine==="avalon"?"#f5f3ff":C.w,fontSize:12,fontWeight:asrEngine==="avalon"?700:500,color:asrEngine==="avalon"?"#7c3aed":C.g500,fontFamily:"inherit",cursor:"pointer"}}>
🌊 Avalon<br/><span style={{fontSize:10,fontWeight:400}}>Aqua Voice（要AQUAキー）</span>
</button>
<button onClick={()=>{setAsrEngine("both");localStorage.setItem("mk_asrEngine","both")}} style={{flex:1,minWidth:120,padding:"8px",borderRadius:10,border:asrEngine==="both"?`2px solid #be123c`:`1px solid ${C.g200}`,background:asrEngine==="both"?"#fff1f2":C.w,fontSize:12,fontWeight:asrEngine==="both"?700:500,color:asrEngine==="both"?"#be123c":C.g500,fontFamily:"inherit",cursor:"pointer"}}>
⚖️ 両方比較<br/><span style={{fontSize:10,fontWeight:400}}>A/B検証（議事録で並列表示）</span>
</button>
</div>
<p style={{fontSize:11,color:C.g400,margin:0}}>
{asrEngine==="whisper"?"✓ Whisper（OpenAI）で書き起こし中":asrEngine==="qwen"?"✓ Qwen3-ASR（Alibaba Cloud）で書き起こし中":asrEngine==="gemini"?"✓ Gemini 3.1 Flash-Lite（Google）で書き起こし中":asrEngine==="avalon"?"✓ Avalon（Aqua Voice）で書き起こし中。キー未設定/失敗時はWhisperに自動フォールバック":"⚖️ 両方比較（A/B検証）: 議事録の録音で Whisper と Avalon の結果を並べて表示します"}
</p>
{isIOSDevice&&<p style={{fontSize:11,color:"#1d4ed8",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"6px 10px",margin:"8px 0 0"}}>※ iPhone・iPad では Avalon は使用できないため、選択しても <b>Whisper で書き起こします</b>（音声形式の制約）。Avalon の比較は PC でご利用ください。</p>}
</div>
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🔇 無音チャンクのスキップ</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:10}}>沈黙・雑音だけの区間をエンジンに送らず、ハルシネーション（捏造文）を根本から減らします。しきい値が高いほど多くスキップします。聞き取れない声が捨てられる場合は下げてください。</p>
<div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
<input type="range" min={0} max={0.05} step={0.002} value={silenceThreshold} onChange={e=>{const v=parseFloat(e.target.value);setSilenceThreshold(v);try{localStorage.setItem("mk_silenceThreshold",String(v))}catch{}}} style={{flex:"1 1 200px",minWidth:160}}/>
<span style={{fontSize:13,fontWeight:700,color:C.pD,minWidth:64,fontVariantNumeric:"tabular-nums"}}>{silenceThreshold.toFixed(3)}</span>
<button type="button" onClick={()=>{setSilenceThreshold(0.01);try{localStorage.setItem("mk_silenceThreshold","0.01")}catch{}}} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>既定(0.010)</button>
</div>
<p style={{fontSize:11,color:C.g400,margin:"8px 0 0"}}>{silenceThreshold===0?"スキップ無効（全チャンク送信）":silenceThreshold<=0.012?"控えめ（安全側・取りこぼし少）":silenceThreshold<=0.03?"標準":"強め（無音を積極スキップ・小声が消える恐れ）"}　※判定できない時は安全のため送信します。</p>
<div style={{marginTop:12,padding:"10px 12px",borderRadius:10,border:disableSilenceSkip?"2px solid #dc2626":`1px solid ${C.g200}`,background:disableSilenceSkip?"#fef2f2":C.w}}>
<label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
<input type="checkbox" checked={disableSilenceSkip} onChange={e=>{const v=e.target.checked;setDisableSilenceSkip(v);try{localStorage.setItem("mk_disableSilenceSkip",v?"1":"0")}catch{}}} style={{width:18,height:18,cursor:"pointer"}}/>
<span style={{fontSize:13,fontWeight:700,color:disableSilenceSkip?"#dc2626":C.g600}}>🚨 無音スキップを無効化（トラブル時のみON）</span>
</label>
<p style={{fontSize:11,color:C.g400,margin:"6px 0 0 28px"}}>書き起こしが全く出ない場合にONにしてください。電池消費は増えます。</p>
</div>
</div>
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🎤 音声コマンド</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:10}}>「次へ」「要約して」「録音」などの音声で操作できます（Chrome専用）</p>
<div style={{display:"flex",alignItems:"center",gap:12}}>
<button onClick={()=>setVoiceCmd(v=>!v)} style={{padding:"8px 18px",borderRadius:10,border:`2px solid ${voiceCmd?C.pD:C.g200}`,background:voiceCmd?C.pLL:C.g50,fontSize:13,fontWeight:700,color:voiceCmd?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>
{voiceCmd?"🎤 ON（タップで停止）":"🎤 OFF（タップで起動）"}
</button>
{vcStatus&&<span style={{fontSize:12,color:C.pD,fontWeight:600}}>{vcStatus}</span>}
</div>
<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:C.g50,border:`1px solid ${C.g200}`}}>
<div style={{fontSize:11,color:C.g500,lineHeight:1.8}}>
<div>📋 対応コマンド一覧：</div>
<div>「<b>次へ</b>」「<b>次の患者</b>」「<b>クリア</b>」→ 次の患者へ</div>
<div>「<b>要約</b>」「<b>まとめ</b>」「<b>カルテ</b>」→ 要約開始</div>
<div>「<b>録音</b>」「<b>開始</b>」→ 録音スタート</div>
<div>「<b>停止</b>」「<b>ストップ</b>」→ 録音停止</div>
<div>「<b>一時停止</b>」「<b>再開</b>」→ 一時停止/再開</div>
<div>「<b>コピー</b>」→ 要約をコピー</div>
</div>
</div>
</div>
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🔊 音声保存</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:8}}>ONにすると診察の音声をSupabase Storageに保存します。カウンセリング分析やトークスクリプト改善に活用できます。</p>
<div style={{display:"flex",alignItems:"center",gap:12}}>
<button onClick={()=>setAudioSave(!audioSave)} style={{padding:"6px 20px",borderRadius:10,border:"none",background:audioSave?C.rG:C.g200,color:audioSave?C.w:C.g500,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>{audioSave?"ON":"OFF"}</button>
<span style={{fontSize:12,color:audioSave?C.rG:C.g400}}>{audioSave?"録音停止時に自動保存されます":"音声は保存されません"}</span>
</div></div>

{/* 📊 API使用料 */}
<div style={{...card,marginBottom:16}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8,flexWrap:"wrap"}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,margin:0}}>📊 API使用料</h3>
<div style={{display:"flex",gap:6,alignItems:"center"}}>
<select value={apiUsageMonth} onChange={e=>setApiUsageMonth(e.target.value)} style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.g200}`,fontSize:12,fontFamily:"inherit",background:C.w,outline:"none",cursor:"pointer"}}>
{generateMonthOptions(12).map(o=>(<option key={o.ym} value={o.ym}>{o.label}</option>))}
</select>
<button onClick={loadApiUsageStats} disabled={apiUsageLoading} style={{padding:"5px 12px",borderRadius:8,border:"none",background:apiUsageLoading?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:apiUsageLoading?"wait":"pointer"}}>{apiUsageLoading?"⏳":"🔄 更新"}</button>
<span style={{width:1,height:20,background:C.g200,margin:"0 4px"}}/>
<select value={csvPeriod} onChange={e=>setCsvPeriod(e.target.value)} disabled={csvExporting} style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.g200}`,fontSize:12,fontFamily:"inherit",background:C.w,outline:"none",cursor:csvExporting?"wait":"pointer"}}>
  <option value="current_month">今月</option>
  <option value="last_month">先月</option>
  <option value="last_3_months">過去3ヶ月</option>
  <option value="all_time">全期間</option>
</select>
<button onClick={exportApiUsageCsv} disabled={csvExporting} style={{padding:"5px 12px",borderRadius:8,border:"none",background:csvExporting?C.g200:"linear-gradient(135deg,#0891b2,#06b6d4)",color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:csvExporting?"wait":"pointer"}}>{csvExporting?"⏳ 出力中...":"📥 CSV出力"}</button>
</div>
</div>
<p style={{fontSize:11,color:C.g400,marginBottom:10}}>各AIモデル・APIルートの月次使用料を集計表示します。データは api_usage_logs テーブルに蓄積されます。</p>

{apiUsageSummary&&<div style={{padding:14,background:"linear-gradient(135deg,#faf8ff,#f0ebff)",borderRadius:10,marginBottom:14,border:"1px solid #d4cce8"}}>
  <div style={{fontSize:26,fontWeight:800,color:"#7c3aed",lineHeight:1}}>¥{apiUsageSummary.totalJpy.toLocaleString()}</div>
  <div style={{fontSize:11,color:"#94a3b8",marginTop:4,marginBottom:8}}>合計 ／ {apiUsageSummary.totalCount.toLocaleString()} 件 ／ {apiUsageSummary.totalTokens.toLocaleString()} tokens</div>
  {Object.keys(apiUsageSummary.byFamily).length>0&&<div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:11,color:"#475569"}}>
    {Object.entries(apiUsageSummary.byFamily).sort((a,b)=>b[1]-a[1]).map(([f,j])=>(<span key={f} style={{padding:"3px 8px",background:C.w,borderRadius:6,border:"1px solid #e9e6ff"}}><strong style={{color:"#6b5fd1"}}>{f}</strong> ¥{Number(j).toLocaleString()}</span>))}
  </div>}
</div>}

<div style={{marginBottom:14}}>
<h4 style={{margin:"0 0 6px",fontSize:13,color:C.g600,fontWeight:700}}>📈 月別推移（過去6ヶ月）</h4>
{apiUsageMonthly.length>0?<UsageBarChart data={apiUsageMonthly}/>:<div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",color:C.g400,fontSize:12,background:C.g50,borderRadius:8}}>データを取得中...</div>}
</div>

<div style={{marginBottom:14}}>
<h4 style={{margin:"0 0 6px",fontSize:13,color:C.g600,fontWeight:700}}>📅 日別推移（{apiUsageMonth.replace("-","年")}月）</h4>
{apiUsageDaily.length>0?<UsageDailyChart data={apiUsageDaily}/>:<div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",color:C.g400,fontSize:12,background:C.g50,borderRadius:8}}>データを取得中...</div>}
</div>

<div>
<h4 style={{margin:"0 0 6px",fontSize:13,color:C.g600,fontWeight:700}}>🏆 Top10 ルート別使用料（選択月）</h4>
<div style={{overflowX:"auto"}}>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
<thead><tr style={{background:"#f5f3ff",color:"#5a4f9c"}}>
<th style={{padding:"7px 10px",textAlign:"left",fontWeight:700,borderBottom:"1px solid #d4cce8"}}>#</th>
<th style={{padding:"7px 10px",textAlign:"left",fontWeight:700,borderBottom:"1px solid #d4cce8"}}>ルート</th>
<th style={{padding:"7px 10px",textAlign:"right",fontWeight:700,borderBottom:"1px solid #d4cce8"}}>件数</th>
<th style={{padding:"7px 10px",textAlign:"right",fontWeight:700,borderBottom:"1px solid #d4cce8"}}>料金</th>
</tr></thead>
<tbody>
{apiUsageTop10.map((r,i)=>(<tr key={r.route} style={{borderBottom:"1px solid #f1f1f5"}}>
  <td style={{padding:"6px 10px",color:C.g500}}>{i+1}</td>
  <td style={{padding:"6px 10px",fontFamily:"ui-monospace,SFMono-Regular,monospace",fontSize:11,color:C.g700,wordBreak:"break-all"}}>{r.route}</td>
  <td style={{padding:"6px 10px",textAlign:"right",color:C.g500}}>{r.count.toLocaleString()}</td>
  <td style={{padding:"6px 10px",textAlign:"right",fontWeight:700,color:"#7c3aed"}}>¥{r.jpy.toLocaleString()}</td>
</tr>))}
{apiUsageTop10.length===0&&(<tr><td colSpan={4} style={{padding:24,textAlign:"center",color:C.g400,fontSize:12}}>データがありません</td></tr>)}
</tbody>
</table>
</div>
</div>

<div style={{marginTop:18,padding:14,background:"#fff8f0",borderRadius:10,border:"1px solid #fcd9b6"}}>
<h4 style={{margin:"0 0 8px",fontSize:13,color:"#92400e",fontWeight:700}}>💰 月予算アラート設定</h4>
<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
<span style={{fontSize:12,color:"#78350f"}}>月予算:</span>
<input type="number" value={budgetJpy||""} onChange={e=>{const v=Number(e.target.value)||0;setBudgetJpy(v);try{localStorage.setItem("mk_apiBudgetJpy",String(v))}catch{}}} placeholder="例: 5000（0で無効）" style={{padding:"6px 10px",borderRadius:8,border:"1px solid #fcd9b6",width:140,fontSize:13,fontFamily:"inherit",outline:"none",background:C.w}}/>
<span style={{fontSize:12,color:"#78350f"}}>円</span>
<span style={{fontSize:11,color:"#a8a29e"}}>{budgetJpy>0?"（超過時に画面上部にバナー表示）":"（0でアラート無効）"}</span>
{budgetJpy>0&&<span style={{fontSize:11,color:currentMonthJpy>budgetJpy?"#dc2626":"#16a34a",fontWeight:600,marginLeft:"auto"}}>今月: ¥{currentMonthJpy.toLocaleString()} / ¥{budgetJpy.toLocaleString()}</span>}
</div>
</div>
</div>

<div style={{...card,marginBottom:16}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,margin:0}}>🎙 録音音声管理</h3>
<div style={{display:"flex",gap:8,alignItems:"center"}}>
{audioListMsg&&<span style={{fontSize:11,color:audioListMsg.startsWith("✓")?C.rG:C.err,fontWeight:600}}>{audioListMsg}</span>}
<button onClick={fetchAudioList} disabled={audioListLoading} style={{padding:"6px 14px",borderRadius:10,border:"none",background:audioListLoading?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:audioListLoading?"wait":"pointer"}}>{audioListLoading?"⏳ 取得中...":"🔄 一覧を取得"}</button>
</div>
</div>
<p style={{fontSize:11,color:C.g400,marginBottom:10}}>過去に保存した診察・議事録の音声を一覧から再生・ダウンロードできます。要約を実行していない録音も「🎙 音声のみ」として表示されます。最新150件まで表示。</p>
{audioList.length>0&&<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:10,padding:"6px 10px",borderRadius:10,background:"#fff7ed",border:"1px solid #fdba74"}}>
<button onClick={selectAllAudios} disabled={audioDeleting} style={{padding:"5px 12px",borderRadius:8,border:"1px solid "+C.p+"66",background:C.w,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:audioDeleting?"not-allowed":"pointer"}}>✓ 全選択</button>
<button onClick={deselectAllAudios} disabled={audioDeleting} style={{padding:"5px 12px",borderRadius:8,border:"1px solid "+C.g200,background:C.w,fontSize:11,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:audioDeleting?"not-allowed":"pointer"}}>⬜ 全解除</button>
<button onClick={deleteSelectedAudios} disabled={audioDeleting||selectedAudios.size===0} style={{padding:"5px 14px",borderRadius:8,border:"none",background:selectedAudios.size===0||audioDeleting?C.g200:"linear-gradient(135deg,#dc2626,#991b1b)",color:selectedAudios.size===0||audioDeleting?C.g500:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:selectedAudios.size===0||audioDeleting?"not-allowed":"pointer"}}>{audioDeleting?"⏳ 削除中...":`🗑 選択した${selectedAudios.size}件を削除`}</button>
<span style={{fontSize:10,color:"#9a3412",fontWeight:500}}>※削除にはパスワードが必要です</span>
</div>}
{audioList.length===0?(
<div style={{padding:"20px",textAlign:"center",color:C.g400,fontSize:12,background:C.g50,borderRadius:8}}>
{audioListLoading?"読み込み中...":"「🔄 一覧を取得」ボタンを押してください"}
</div>
):(
<div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:500,overflowY:"auto"}}>
{audioList.map(item=>{
const paths=(item.audio_path||"").split(",").map(p=>p.trim()).filter(Boolean);
const dateLabel=new Date(item.created_at).toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
const typeLabel=item.type==="record"?"🩺 診察":item.type==="minute"?"📝 議事録":"🎙 音声のみ";
const typeBg=item.type==="record"?"#dbeafe":item.type==="minute"?"#fef3c7":"#f3e8ff";
const typeColor=item.type==="record"?"#1d4ed8":item.type==="minute"?"#92400e":"#7c3aed";
const subtitle=item.type==="record"?`${item.room||"-"}${item.patient_id?" / 患者ID:"+item.patient_id:""}${item.patient_name?" / "+item.patient_name:""}`:item.type==="minute"?(item.title||"無題"):`${item.room||"-"}${item.patient_id?" / 患者ID:"+item.patient_id:""}（要約未実行・音声のみ）`;
const k=audioKey(item);
const checked=selectedAudios.has(k);
const hasAudio=paths.length>0;
return(<div key={k} style={{padding:10,borderRadius:10,border:checked?`2px solid #dc2626`:`1px solid ${C.g200}`,background:checked?"#fef2f2":C.w,display:"flex",flexDirection:"column",gap:6}}>
<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
<input type="checkbox" checked={checked} disabled={!hasAudio||audioDeleting} onChange={()=>toggleAudioSelected(item)} style={{width:16,height:16,cursor:hasAudio&&!audioDeleting?"pointer":"not-allowed",accentColor:"#dc2626",flexShrink:0}}/>
<span style={{padding:"2px 8px",borderRadius:6,background:typeBg,color:typeColor,fontSize:11,fontWeight:700}}>{typeLabel}</span>
<span style={{fontSize:11,color:C.g500,fontWeight:600}}>{dateLabel}</span>
<span style={{fontSize:11,color:C.g400}}>{item.type==="storage"?((item.audio_path.match(/_part(\d+)/)||[])[1]?`part${item.audio_path.match(/_part(\d+)/)[1]}`:"単体"):`part${paths.length===1?"1のみ":`1〜${paths.length}`}`}</span>
</div>
<div style={{fontSize:12,color:C.g700,fontWeight:500}}>{subtitle}</div>
{paths.map((p,idx)=>(<div key={p} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 8px",borderRadius:8,background:C.g50,flexWrap:"wrap"}}>
<span style={{fontSize:10,color:C.g400,fontWeight:700,minWidth:42}}>part{idx+1}</span>
{audioSignedUrls[p]?(<audio controls preload="none" src={audioSignedUrls[p]} style={{height:32,flex:"1 1 240px",minWidth:200}}/>):(<button onClick={()=>loadAudioSignedUrl(p)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer",flex:"1 1 200px"}}>▶ 再生URL取得</button>)}
<button onClick={()=>downloadAudio(p)} style={{padding:"4px 10px",borderRadius:6,border:"none",background:C.pLL,color:C.pD,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>⬇ DL</button>
<button onClick={()=>convertAndDownloadMp3(p)} disabled={!!mp3Converting[p]} title="mp3に変換してダウンロード" style={{padding:"4px 10px",borderRadius:6,border:"none",background:mp3Converting[p]?C.g200:"#fef3c7",color:mp3Converting[p]?C.g500:"#92400e",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:mp3Converting[p]?"wait":"pointer"}}>{mp3Converting[p]==="loading"?"⏳ 初期化中...":mp3Converting[p]==="converting"?"⏳ 変換中...":"📥 mp3"}</button>
<span style={{fontSize:10,color:C.g400,wordBreak:"break-all",flex:"1 1 100%"}}>{p}</span>
</div>))}
</div>);
})}
</div>
)}
</div>
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🤖 要約AIモデル</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:10}}>要約に使用するAIモデルを選択できます。設定は自動保存されます。</p>
<div style={{display:"flex",gap:12}}>
{[{v:"gemini",label:"Gemini 3.5 Flash ✨",desc:"最新・超高速（4倍速）"},{v:"gemini-pro",label:"Gemini 2.5 Pro",desc:"高精度・推論強化"},{v:"claude",label:"Claude Sonnet 4.6",desc:"高精度・日本語に強い"}].map(m=>(
<label key={m.v} onClick={()=>{setSummaryModel(m.v);try{localStorage.setItem("mk_summaryModel",m.v)}catch{}}} style={{flex:1,padding:"10px 14px",borderRadius:12,border:`2px solid ${summaryModel===m.v?C.p:C.g200}`,background:summaryModel===m.v?C.pLL:C.w,cursor:"pointer",transition:"all 0.15s"}}>
<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
<div style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${summaryModel===m.v?C.pD:C.g300}`,display:"flex",alignItems:"center",justifyContent:"center"}}>{summaryModel===m.v&&<div style={{width:8,height:8,borderRadius:"50%",background:C.pD}}/>}</div>
<span style={{fontSize:13,fontWeight:summaryModel===m.v?700:500,color:summaryModel===m.v?C.pD:C.g600}}>{m.label}</span>
</div>
<span style={{fontSize:11,color:C.g400,marginLeft:24}}>{m.desc}</span>
</label>))}
</div>
</div>
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🎨 カラーテーマ</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:10}}>画面のカラーテーマを切り替えられます。</p>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
{Object.entries(THEMES).map(([key,t])=>(<button key={key} onClick={()=>applyTheme(key)} style={{padding:"10px 12px",borderRadius:12,border:themeName===key?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:themeName===key?C.pLL:C.g50,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.15s"}}>
<div style={{display:"flex",alignItems:"center",gap:8}}>
<div style={{width:20,height:20,borderRadius:6,background:t.swatch||t.p,border:"1px solid rgba(0,0,0,0.1)",flexShrink:0}}/>
<span style={{fontSize:13,fontWeight:themeName===key?700:500,color:themeName===key?C.pD:C.g600}}>{t.name}</span>
</div></button>))}
</div></div>
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:mob?14:15,fontWeight:700,color:C.pDD,marginBottom:8}}>⌨️ ショートカットキー設定</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:10}}>各機能のキー割り当てを変更できます。⭐=トップ画面＋小窓に表示</p>
<div style={{display:"flex",flexDirection:"column",gap:4}}>
{shortcuts.map((sc,i)=>(<div key={sc.id} style={{display:"flex",gap:6,alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${C.g100}`}}>
<button onClick={()=>{const u=[...shortcuts];u[i]={...u[i],showOnTop:!u[i].showOnTop};setShortcuts(u)}} style={{padding:"2px 5px",borderRadius:6,border:sc.showOnTop?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:sc.showOnTop?C.pLL:C.w,fontSize:9,color:sc.showOnTop?C.pD:C.g400,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>{sc.showOnTop?"⭐":"☆"}</button>
<span style={{width:mob?100:140,fontSize:12,fontWeight:600,color:C.g700,flexShrink:0}}>{sc.label}</span>
<input value={sc.key} readOnly onKeyDown={e=>{e.preventDefault();let k="";if(e.ctrlKey)k+="Ctrl+";if(e.altKey)k+="Alt+";if(e.shiftKey)k+="Shift+";if(e.metaKey)k+="Cmd+";const key=e.key;if(!["Control","Alt","Shift","Meta"].includes(key)){k+=key.length===1?key.toUpperCase():key;const u=[...shortcuts];u[i]={...u[i],key:k};setShortcuts(u)}}} style={{width:80,padding:"3px 8px",borderRadius:8,border:`1.5px solid ${C.p}`,fontSize:12,fontFamily:"monospace",fontWeight:700,color:C.pD,background:C.pLL,textAlign:"center",outline:"none",cursor:"pointer"}} placeholder="キーを押す"/>
<button onClick={()=>{const u=[...shortcuts];u[i]={...u[i],enabled:!u[i].enabled};setShortcuts(u)}} style={{padding:"3px 10px",borderRadius:6,border:"none",background:sc.enabled?C.rG:C.g200,color:sc.enabled?C.w:C.g500,fontSize:10,fontWeight:700,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>{sc.enabled?"ON":"OFF"}</button>
</div>))}
<div style={{display:"flex",gap:6,alignItems:"center",padding:"6px 0",borderTop:`1.5px solid ${C.g200}`,marginTop:4}}>
<span style={{padding:"2px 5px",borderRadius:6,border:`1px solid ${C.g300}`,background:C.g100,fontSize:9,color:C.g500,flexShrink:0}}>🔒</span>
<span style={{width:mob?100:140,fontSize:12,fontWeight:600,color:C.g700,flexShrink:0}}>✕ 閉じる</span>
<span style={{width:80,padding:"3px 8px",borderRadius:8,border:`1.5px solid ${C.g300}`,fontSize:12,fontFamily:"monospace",fontWeight:700,color:C.g500,background:C.g100,textAlign:"center"}}>Escape</span>
<span style={{fontSize:10,color:C.g400}}>固定（モーダル・ページを閉じる）</span>
</div>
</div>
<div style={{display:"flex",gap:8,marginTop:8}}>
<button onClick={()=>setShortcuts(DEFAULT_SHORTCUTS)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>初期値に戻す</button>
</div>
<div style={{marginTop:12}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>📋 テンプレート並び順</span>
<p style={{fontSize:11,color:C.g500,margin:"4px 0 8px"}}>トップ画面のテンプレートボタンはドラッグで並び替えできます</p>
<button onClick={()=>{setTplOrder(null);try{localStorage.removeItem("mk_tplOrder")}catch{};sSt("テンプレート順序をリセットしました")}} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>🔄 デフォルトに戻す</button>
</div>
<div style={{marginTop:16}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>📋 トップ画面に表示するテンプレート</span>
<p style={{fontSize:11,color:C.g500,margin:"4px 0 8px"}}>チェックしたテンプレートがトップ画面に表示されます</p>
<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
{T.map(t=>{const vis=tplVisible||DEFAULT_VISIBLE_TPLS;const isVis=vis.includes(t.id);return(
<button key={t.id} onClick={()=>{const vis2=tplVisible||[...DEFAULT_VISIBLE_TPLS];let newVis;if(vis2.includes(t.id)){newVis=vis2.filter(x=>x!==t.id);if(newVis.length===0)newVis=[t.id]}else{newVis=[...vis2,t.id]}setTplVisible(newVis);try{localStorage.setItem("mk_tplVisible",JSON.stringify(newVis))}catch{}}} style={{padding:"4px 12px",borderRadius:8,border:isVis?`2px solid ${C.p}`:`1.5px solid ${C.g200}`,background:isVis?C.pLL:C.w,fontSize:12,fontWeight:isVis?700:400,color:isVis?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>
{isVis?"✅":"☐"} {t.name}
</button>)})}
</div>
<button onClick={()=>{setTplVisible(null);try{localStorage.removeItem("mk_tplVisible")}catch{};sSt("テンプレート表示をリセットしました")}} style={{marginTop:8,padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>🔄 デフォルトに戻す（標準・簡潔・カウンセリングのみ）</button>
</div>
<div style={{marginTop:16}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>🧩 トップメニューの表示</span>
<p style={{fontSize:11,color:C.g500,margin:"4px 0 8px"}}>チェックした機能ボタンがトップに常時表示され、残りは「⋯その他」に折りたたまれます（⚙️設定は常に表示）</p>
<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
{TOP_MENU.map(m=>{const visArr=topMenuVisible||DEFAULT_TOP_MENU_VISIBLE;const locked=m.p==="settings";const isVis=locked||visArr.includes(m.p);return(
<button key={m.p} disabled={locked} onClick={()=>{const cur=topMenuVisible||[...DEFAULT_TOP_MENU_VISIBLE];const newVis=cur.includes(m.p)?cur.filter(x=>x!==m.p):[...cur,m.p];setTopMenuVisible(newVis);try{localStorage.setItem("mk_topMenuVisible",JSON.stringify(newVis))}catch{}}} style={{padding:"4px 12px",borderRadius:8,border:isVis?`2px solid ${C.p}`:`1.5px solid ${C.g200}`,background:isVis?C.pLL:C.w,fontSize:12,fontWeight:isVis?700:400,color:isVis?C.pD:C.g500,fontFamily:"inherit",cursor:locked?"not-allowed":"pointer",opacity:locked?0.7:1}}>
{isVis?"✅":"☐"} {m.i} {m.t}{locked?"（常時表示）":""}
</button>)})}
</div>
<button onClick={()=>{setTopMenuVisible(null);try{localStorage.removeItem("mk_topMenuVisible")}catch{};sSt("トップメニュー表示をリセットしました")}} style={{marginTop:8,padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>🔄 デフォルトに戻す（履歴・設定・議事録・タスク）</button>
</div>
<div style={{marginTop:16}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>📋 デフォルトテンプレート</span>
<p style={{fontSize:11,color:C.g500,margin:"4px 0 8px"}}>アプリ起動時・次へ押下時に選択されるテンプレート</p>
<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
{T.map(t=>{const isDef=tid===t.id;return(
<button key={t.id} onClick={()=>{sTid(t.id);try{localStorage.setItem("mk_defaultTpl",t.id)}catch{};sSt("デフォルトを「"+t.name+"」に設定")}} style={{padding:"4px 12px",borderRadius:8,border:isDef?`2px solid ${C.p}`:`1.5px solid ${C.g200}`,background:isDef?C.pLL:C.w,fontSize:12,fontWeight:isDef?700:400,color:isDef?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>
{isDef?"✅":"○"} {t.name}
</button>)})}
</div>
</div>
</div>
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🖼 ロゴ設定</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:8}}>画像をドロップまたはクリックしてアップロード</p>
<div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:8}}>
<div onDragOver={e=>{e.preventDefault()}} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f&&f.type.startsWith("image/")){const r=new FileReader();r.onload=ev=>setLogoUrl(ev.target.result);r.readAsDataURL(f)}}} onClick={()=>{const i=document.createElement("input");i.type="file";i.accept="image/*";i.onchange=e=>{const f=e.target.files[0];if(f){const r=new FileReader();r.onload=ev=>setLogoUrl(ev.target.result);r.readAsDataURL(f)}};i.click()}} style={{width:80,height:80,borderRadius:12,border:"2px dashed "+C.g200,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",overflow:"hidden",flexShrink:0}}>
{logoUrl?<img src={logoUrl} alt="logo" style={{width:"100%",height:"100%",objectFit:"contain"}}/>:<span style={{fontSize:11,color:C.g400,textAlign:"center"}}>クリック<br/>or<br/>ドロップ</span>}
</div>
<div>{logoUrl&&<button onClick={()=>setLogoUrl("")} style={{padding:"4px 12px",borderRadius:8,border:"1px solid "+C.g200,background:C.w,fontSize:12,color:C.err,fontFamily:"inherit",cursor:"pointer",marginBottom:6,display:"block"}}>ロゴ削除</button>}
<div style={{display:"flex",gap:6,alignItems:"center"}}>
<span style={{fontSize:11,color:C.g500}}>サイズ:</span>
{[24,32,40,48].map(s=>(<button key={s} onClick={()=>setLogoSize(s)} style={{padding:"3px 10px",borderRadius:6,border:logoSize===s?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:logoSize===s?C.pLL:C.w,fontSize:11,fontWeight:logoSize===s?700:400,color:logoSize===s?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{s}px</button>))}
</div></div></div></div>
{/* Snippets */}
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>📌 追記テンプレート（{snippets.length}件）</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:10}}>⭐=常時表示＋小窓 / 他はカテゴリ別アコーディオン</p>
<div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
<button onClick={suggestSnippets} disabled={suggestLd} style={{padding:"6px 16px",borderRadius:10,border:"none",background:suggestLd?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>{suggestLd?"⏳ 分析中...":"🤖 AIが履歴から提案"}</button>
<span style={{fontSize:11,color:C.g400}}>過去の要約からよく使うフレーズを自動抽出</span></div>
{suggestedSnippets.length>0&&<div style={{marginBottom:12,padding:10,borderRadius:10,border:`1.5px solid ${C.p}44`,background:C.pLL}}>
<div style={{fontSize:12,fontWeight:700,color:C.pD,marginBottom:6}}>🤖 AI提案テンプレート（クリックで追加）</div>
<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{suggestedSnippets.map((s,i)=>(<button key={i} onClick={()=>{if(s.title!=="エラー"&&s.title!=="履歴不足"&&s.title!=="解析エラー"){setSnippets(prev=>[...prev,{title:s.title,text:s.text,cat:s.cat||"その他"}]);setSuggestedSnippets(prev=>prev.filter((_,j)=>j!==i))}}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.p}`,background:C.w,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}} title={s.text}>{s.cat?`[${s.cat}] `:""}{s.title}</button>))}</div>
<button onClick={()=>setSuggestedSnippets([])} style={{marginTop:6,padding:"2px 10px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.w,fontSize:10,color:C.g400,fontFamily:"inherit",cursor:"pointer"}}>閉じる</button>
</div>}
<div style={{display:"flex",gap:4,marginBottom:6,flexWrap:"wrap"}}>
<input value={newSnTitle} onChange={e=>setNewSnTitle(e.target.value)} placeholder="タイトル" style={{...ib,width:100}}/>
<input id="newSnCat" placeholder="カテゴリ" style={{...ib,width:80}}/>
<input value={newSnText} onChange={e=>setNewSnText(e.target.value)} placeholder="追記テキスト内容" style={{...ib,flex:1}}/>
<button onClick={()=>{if(newSnTitle.trim()&&newSnText.trim()){const catEl=document.getElementById("newSnCat");setSnippets([...snippets,{title:newSnTitle.trim(),text:newSnText.trim(),cat:catEl?.value?.trim()||"その他"}]);setNewSnTitle("");setNewSnText("");if(catEl)catEl.value=""}}} style={btn(C.p,"#fff",{padding:"6px 14px",fontSize:13})}>追加</button></div>
<div style={{maxHeight:400,overflow:"auto"}}>
{snippets.map((sn,i)=>(<div key={i} style={{display:"flex",gap:3,alignItems:"flex-start",padding:"4px 0",borderBottom:"1px solid "+C.g100}}>
<button onClick={()=>{if(pipSnippets.includes(i)){setPipSnippets(pipSnippets.filter(x=>x!==i))}else{setPipSnippets([...pipSnippets,i])}}} style={{padding:"3px 5px",borderRadius:6,border:pipSnippets.includes(i)?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:pipSnippets.includes(i)?C.pLL:C.w,fontSize:9,color:pipSnippets.includes(i)?C.pD:C.g400,fontFamily:"inherit",cursor:"pointer",flexShrink:0}} title="常時表示+小窓">{pipSnippets.includes(i)?"⭐":"☆"}</button>
<input value={sn.cat||""} onChange={e=>{const u=[...snippets];u[i]={...u[i],cat:e.target.value};setSnippets(u)}} style={{...ib,width:60,padding:"3px 5px",fontSize:10,color:C.g500}} title="カテゴリ"/>
<input value={sn.title} onChange={e=>{const u=[...snippets];u[i]={...u[i],title:e.target.value};setSnippets(u)}} style={{...ib,width:80,padding:"3px 5px",fontSize:11,fontWeight:700,color:C.pD}}/>
<textarea value={sn.text} onChange={e=>{const u=[...snippets];u[i]={...u[i],text:e.target.value};setSnippets(u)}} rows={1} onFocus={e=>{e.target.rows=Math.max(2,e.target.value.split("\n").length)}} onBlur={e=>{e.target.rows=1}} style={{...ib,flex:1,padding:"3px 5px",fontSize:10,color:C.g700,resize:"vertical",lineHeight:1.5}}/>
<button onClick={()=>{setSnippets(snippets.filter((_,j)=>j!==i));setPipSnippets(pipSnippets.filter(x=>x!==i).map(x=>x>i?x-1:x))}} style={{padding:"3px 6px",borderRadius:6,border:"1px solid #fecaca",background:C.w,fontSize:9,color:C.err,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>✕</button></div>))}</div></div>
{/* Dict */}
<div style={{...card,marginBottom:16}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,margin:0}}>📖 誤字脱字修正辞書（{dict.length}件）</h3>
<button onClick={()=>setDictEnabled(!dictEnabled)} style={{padding:"4px 14px",borderRadius:10,border:"none",background:dictEnabled?C.rG:C.g200,color:dictEnabled?C.w:C.g500,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>{dictEnabled?"ON":"OFF"}</button></div>
<p style={{fontSize:12,color:C.g400,marginBottom:12}}>書き起こし結果に自動適用。左の文字列を右に置換します。</p>
<div style={{display:"flex",gap:6,marginBottom:12}}>
<input value={newFrom} onChange={e=>setNewFrom(e.target.value)} placeholder="変換前" style={{...ib,flex:1}}/>
<span style={{alignSelf:"center",color:C.g400}}>→</span>
<input value={newTo} onChange={e=>setNewTo(e.target.value)} placeholder="変換後" style={{...ib,flex:1}}/>
<button onClick={()=>{if(newFrom.trim()&&newTo.trim()){dictAddEntry(newFrom.trim(),newTo.trim());setNewFrom("");setNewTo("")}}} style={btn(C.p,C.pDD,{padding:"6px 14px",fontSize:13})}>追加</button></div>
<div style={{maxHeight:400,overflow:"auto"}}>
{dict.map((d,i)=>(<div key={i} style={{display:"flex",gap:6,alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${C.g100}`}}>
<span style={{flex:1,fontSize:12,color:C.g500}}>{d[0]}</span>
<span style={{color:C.g400,fontSize:11}}>→</span>
<span style={{flex:1,fontSize:12,color:C.g900,fontWeight:600}}>{d[1]}</span>
<button onClick={()=>dictDelEntry(i)} style={{padding:"2px 8px",borderRadius:6,border:"1px solid #fecaca",background:C.w,fontSize:10,color:C.err,fontFamily:"inherit",cursor:"pointer"}}>✕</button></div>))}</div></div>

{/* ノイズフィルター管理 */}
<div style={{marginTop:24,padding:16,borderRadius:14,border:`1px solid ${C.g200}`,background:C.g50}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
    <h3 style={{fontSize:15,fontWeight:700,color:C.pDD,margin:0}}>🚫 書き起こしノイズフィルター（{noisePatterns.length}件）</h3>
    <button onClick={runNoiseScan} disabled={noiseScanLd} style={{padding:"6px 14px",borderRadius:10,border:`1px solid ${C.p}`,background:noiseScanLd?C.g200:C.pLL,fontSize:12,fontWeight:600,color:noiseScanLd?C.g400:C.pD,fontFamily:"inherit",cursor:noiseScanLd?"wait":"pointer"}}>
      {noiseScanLd?"🔍 分析中...":"🔍 AIノイズ候補をピックアップ"}
    </button>
  </div>
  <p style={{fontSize:12,color:C.g500,marginBottom:12}}>登録したフレーズは書き起こし時に自動除去されます。AIが候補を自動検出することもできます。</p>

  {/* 手動追加 */}
  <div style={{display:"flex",gap:6,marginBottom:12}}>
    <input
      type="text"
      value={newNoiseInput}
      onChange={e=>setNewNoiseInput(e.target.value)}
      onKeyDown={e=>{if(e.key==="Enter"&&newNoiseInput.trim()){addNoisePattern(newNoiseInput);setNewNoiseInput("")}}}
      placeholder="除去したいフレーズを入力（例：次の映像でお会いしましょう）"
      style={{flex:1,padding:"8px 12px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:13,fontFamily:"inherit",outline:"none"}}
    />
    <button onClick={()=>{addNoisePattern(newNoiseInput);setNewNoiseInput("")}} disabled={!newNoiseInput.trim()} style={{padding:"8px 14px",borderRadius:10,border:"none",background:newNoiseInput.trim()?C.p:C.g200,color:newNoiseInput.trim()?C.w:C.g400,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:newNoiseInput.trim()?"pointer":"default"}}>＋ 追加</button>
  </div>

  {/* 登録済みパターン一覧（スクロール式リスト） */}
  {noisePatterns.length>0?(
    <div style={{maxHeight:280,overflowY:"auto",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w}}>
      {noisePatterns.map((p,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:i<noisePatterns.length-1?`1px solid ${C.g200}`:"none",background:i%2===0?C.g50:C.w}}>
          <span style={{fontSize:12,color:"#dc2626",flexShrink:0}}>🚫</span>
          <span style={{fontSize:12,color:C.text,flex:1,wordBreak:"break-all",lineHeight:1.5}}>{p}</span>
          <button onClick={()=>removeNoisePattern(i)} style={{padding:"2px 8px",borderRadius:6,border:`1px solid #fca5a5`,background:"#fff1f2",color:"#dc2626",fontSize:11,fontWeight:600,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>削除</button>
        </div>
      ))}
    </div>
  ):(
    <p style={{fontSize:12,color:C.g400,margin:0}}>登録済みのパターンはありません。AIピックアップまたは手動で追加してください。</p>
  )}
</div>

{noiseModalEl}

<div style={{...card,marginTop:12}}>
<h3 style={{fontSize:mob?14:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🔤 フォント選択</h3>
<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
{[["Zen Maru Gothic","丸ゴシック"],["M PLUS Rounded 1c","M+ 丸"],["BIZ UDGothic","BIZ UD"],["Noto Sans JP","Noto Sans"],["Shippori Mincho","明朝体"]].map(([f,label])=><button key={f} onClick={()=>setFontFamily(f)} style={{padding:"6px 12px",borderRadius:8,border:"none",background:fontFamily===f?"#22c55e":"#d1d5db",color:fontFamily===f?"#fff":"#57534e",fontSize:12,fontWeight:700,fontFamily:`'${f}', sans-serif`,cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.1)",transition:"all 0.15s"}}>{label}<br/><span style={{fontSize:11,fontWeight:400}}>あいうABC</span></button>)}
</div>
</div>
<div style={{...card,marginTop:12}}>
<h3 style={{fontSize:mob?14:15,fontWeight:700,color:C.pDD,marginBottom:8}}>📱 スマホ・タブレット表示設定</h3>
<p style={{fontSize:12,color:C.g500,marginBottom:12}}>スマホ・タブレット表示時に非表示にする項目を選択してください</p>
<div style={{display:"flex",flexDirection:"column",gap:6}}>
{[["pip","小窓（PiP）ボタン"],["shortcuts","ショートカットキー表示"],["fontsize","文字サイズ切替ボタン"],["tabs_minutes","議事録タブ"],["tabs_tasks","タスク管理タブ"],["tabs_sns","SNSタブ"],["tabs_analysis","分析タブ"],["tabs_roleplay","ロールプレイタブ"],["tabs_caselibrary","症例ライブラリタブ"],["tabs_knowledge","育成・知識タブ"]].map(([k,label])=>(
<label key={k} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:C.g700,cursor:"pointer"}}>
<input type="checkbox" checked={mobileHideItems[k]} onChange={e=>{const next={...mobileHideItems,[k]:e.target.checked};setMobileHideItems(next);try{localStorage.setItem("mk_mobileHide",JSON.stringify(next))}catch{}}} style={{width:16,height:16,accentColor:C.p}}/>
{label}
</label>))}
</div>
</div>
</div>);

// === MAIN ===
return(<div style={{maxWidth:"100%",margin:"0 auto",padding:mob?"10px 8px":"20px 32px",minHeight:"100vh",fontFamily:"'Zen Maru Gothic', sans-serif",background:theme.bodyBg}}>
{budgetJpy>0&&currentMonthJpy>budgetJpy&&<div style={{position:"sticky",top:0,zIndex:1000,background:"#fef2f2",border:"2px solid #dc2626",color:"#991b1b",padding:"8px 16px",fontSize:13,fontWeight:700,textAlign:"center",boxShadow:"0 2px 4px rgba(0,0,0,0.1)",borderRadius:8,marginBottom:8}}>⚠️ 今月のAPI使用料 ¥{currentMonthJpy.toLocaleString()} が予算 ¥{budgetJpy.toLocaleString()} を超えています</div>}
{modelCheck&&modelCheck.ok&&Array.isArray(modelCheck.missing)&&modelCheck.missing.length>0&&<div onClick={()=>setPage("settings")} style={{position:"sticky",top:0,zIndex:1000,background:"#fef2f2",border:"2px solid #dc2626",color:"#991b1b",padding:"8px 16px",fontSize:13,fontWeight:700,textAlign:"center",boxShadow:"0 2px 4px rgba(0,0,0,0.1)",borderRadius:8,marginBottom:8,cursor:"pointer"}}>⚠️ 使用中のモデル {modelCheck.missing.join("・")} が利用できない可能性があります。要約等に影響する場合があります（クリックで設定→モデル稼働チェックへ）</div>}
{tooltip.visible&&<div style={{position:"fixed",left:tooltip.x,top:tooltip.y,transform:"translate(-50%, -100%)",background:"rgba(42,58,32,0.92)",color:"#e8f5d8",padding:"4px 10px",borderRadius:8,fontSize:12,fontWeight:600,fontFamily:"'Zen Maru Gothic', sans-serif",pointerEvents:"none",zIndex:99999,whiteSpace:"nowrap",boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>{tooltip.text}</div>}
<header style={{background:theme.headerBg,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderBottom:`1px solid ${theme.cardBorder}`,padding:mob?"12px 16px":"14px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:0}}>
<div style={{display:"flex",alignItems:"center",gap:8}}>{logoUrl?<img src={logoUrl} alt="logo" style={{width:logoSize,height:logoSize,borderRadius:6,objectFit:"contain"}}/>:<span style={{fontSize:18}}>🩺</span>}<span style={{fontWeight:700,fontSize:mob?14:17,color:"#2a5018",letterSpacing:"0.5px"}}>南草津皮フ科AIカルテ要約</span></div>
<div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:10,color:"#3a6820",fontWeight:600,background:"rgba(160,220,100,0.25)",padding:"2px 8px",borderRadius:8}}>{geminiModel||"Gemini 3.5 Flash"}</span>{pc>0&&<span style={{fontSize:12,color:C.warn,fontWeight:600}}>⏳</span>}<span style={{fontSize:11,color:st.includes("✓")?"#3a6820":"#5a8838",fontWeight:st.includes("✓")?600:400}}>{st}</span>{voiceCmd&&<span style={{fontSize:11,color:C.pD,fontWeight:600,background:C.pLL,padding:"2px 8px",borderRadius:6}}>🎤 {vcStatus||"音声待機中"}</span>}</div></header>
<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:mob?"nowrap":"wrap",overflowX:mob?"auto":"visible",WebkitOverflowScrolling:"touch",paddingBottom:mob?4:0}}>
{(()=>{
// よく使うものだけ常時表示、残りは「⋯その他」で展開（既定は折りたたみ）。設定(settings)は常時表示固定
const menuActions={hist:()=>{loadHist();setPage("hist")},caselib:()=>{loadFavorites();setPage("caselib")},tasks:()=>{loadTasks();loadStaff();loadMinHist();loadTodos();setPage("tasks")},manual:()=>window.open('/manual.pdf','_blank')};
const avail=TOP_MENU.filter(m=>!m.mh||!(mob&&mobileHideItems[m.mh]));
const vis=new Set([...(topMenuVisible||DEFAULT_TOP_MENU_VISIBLE),"settings"]);
const shown=avail.filter(m=>vis.has(m.p)),hidden=avail.filter(m=>!vis.has(m.p));
const mBtn=(m)=>(<button key={m.p} onClick={menuActions[m.p]||(()=>setPage(m.p))} style={{padding:mob?"6px 10px":"7px 12px",borderRadius:12,border:"1px solid #e7e5e4",background:"#ffffff",fontSize:mob?10:11,fontWeight:600,fontFamily:"inherit",cursor:"pointer",color:"#65a30d",display:"flex",alignItems:"center",gap:4,transition:"all 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,.08)",flexShrink:0,whiteSpace:"nowrap"}}><span style={{fontSize:14}}>{m.i}</span>{m.t}</button>);
return(<>{shown.map(mBtn)}
{hidden.length>0&&<button key="_more" onClick={()=>setMenuMore(v=>!v)} title={menuMore?"折りたたむ":"残りのメニューを表示"} style={{padding:mob?"6px 10px":"7px 12px",borderRadius:12,border:`1px solid ${menuMore?"#65a30d":"#e7e5e4"}`,background:menuMore?"#f7fee7":"#ffffff",fontSize:mob?10:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",color:"#65a30d",display:"flex",alignItems:"center",gap:4,boxShadow:"0 1px 4px rgba(0,0,0,.08)",flexShrink:0,whiteSpace:"nowrap"}}>{menuMore?"✕ 閉じる":`⋯ その他(${hidden.length})`}</button>}
{menuMore&&hidden.map(mBtn)}</>);
})()}</div>
<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:mob?"nowrap":"wrap",overflowX:mob?"auto":"visible",WebkitOverflowScrolling:"touch",paddingBottom:mob?4:0}}>{R.map(rm=>{const rc=ROOM_COLORS[rm.id]||{bg:"#f3f4f6",text:"#374151",border:"#d1d5db",accent:"#6b7280"};const isSel=rid===rm.id;return(<button key={rm.id} onClick={()=>sRid(rm.id)} style={{padding:"4px 10px",borderRadius:8,border:`2px solid ${isSel?rc.accent:rc.border}`,background:isSel?rc.bg:"#fff",color:isSel?rc.text:"#6b7280",fontSize:mob?11:12,fontWeight:isSel?700:500,fontFamily:"inherit",cursor:"pointer",transition:"all 0.15s",boxShadow:isSel?`0 0 0 2px ${rc.accent}33`:"none",whiteSpace:"nowrap",flexShrink:0}}>{rm.i} {rm.l}</button>)})}</div>
<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
<span style={{fontSize:10,color:C.g400}}>🎙</span>
<span style={{fontSize:10,fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}>入力:</span>
<select value={selectedMic} onChange={e=>{const id=e.target.value;setSelectedMic(id);/* 選択を記憶（id+label）。次回起動時に復元 */try{const dev=micDevices.find(m=>m.deviceId===id);localStorage.setItem("mk_preferredMicId",id);if(dev&&dev.label)localStorage.setItem("mk_preferredMicLabel",dev.label)}catch{}}} style={{flex:"0 1 180px",padding:"3px 6px",borderRadius:6,border:`1px solid ${C.g200}`,fontSize:9,color:C.g500,fontFamily:"inherit",background:C.w,maxWidth:200}}>
{micDevices.length===0?<option value="">マイク未検出（許可が必要）</option>:micDevices.map((d,i)=>(<option key={d.deviceId} value={d.deviceId}>{d.label||`マイク ${i+1}`}</option>))}
</select>
<button onClick={loadMics} title="マイク一覧を更新" style={{padding:"2px 5px",borderRadius:5,border:`1px solid ${C.g200}`,background:C.w,fontSize:9,cursor:"pointer"}}>🔄</button>
{(rs==="inactive"||micTesting)&&(()=>{const bl=micTesting?micTestLv:0;return(<div title="入力レベル（テスト中に反応）" style={{flex:"1 1 110px",minWidth:90,height:10,borderRadius:6,background:"#e7efe0",overflow:"hidden",border:`1px solid ${C.g200}`}}><div style={{width:`${bl}%`,height:"100%",borderRadius:6,background:bl>=45?"#ef4444":bl>=6?"#84cc16":"#cbd5e1",transition:"width 0.08s"}}/></div>);})()}
<button onClick={micTesting?stopMicTest:startMicTest} disabled={rs!=="inactive"} title={rs!=="inactive"?"録音中はテストできません":"マイクに音が届くか数秒テスト"} style={{padding:"3px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:rs!=="inactive"?"#f1f5f9":(micTesting?"#fef2f2":C.w),fontSize:10,fontWeight:700,color:rs!=="inactive"?C.g400:C.pD,fontFamily:"inherit",cursor:rs!=="inactive"?"not-allowed":"pointer",whiteSpace:"nowrap",opacity:rs!=="inactive"?0.5:1}}>{micTesting?"⏹ 停止":"🎤 マイクテスト"}</button>
</div>
{micTestMsg&&<div style={{margin:"0 0 6px",fontSize:11,fontWeight:600,color:micTestMsg.startsWith("✅")?"#15803d":micTestMsg.startsWith("⚠️")?"#b45309":C.g500}}>{micTestMsg}</div>}
{todayStats&&<div style={{margin:"0 0 10px",padding:"8px 12px",borderRadius:10,background:C.pLL,border:`1px solid ${C.g200}`,cursor:"pointer"}} onClick={()=>setStatsOpen(v=>!v)}>
<div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
<span style={{fontSize:12,fontWeight:700,color:C.pD}}>📊 本日の診察</span>
<span style={{fontSize:20,fontWeight:700,color:C.pD}}>{todayStats.count}<span style={{fontSize:11,fontWeight:400,color:C.g500}}>件</span></span>
{todayStats.diseases.slice(0,3).map(([d,n])=>(
<span key={d} style={{fontSize:10,padding:"2px 7px",borderRadius:6,background:"#d1fae5",color:"#065f46",fontWeight:600}}>{d} {n}</span>
))}
<span style={{fontSize:10,color:C.g400,marginLeft:"auto"}}>{statsOpen?"▲":"▼"}</span>
</div>
{statsOpen&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.g200}`,display:"flex",gap:16,flexWrap:"wrap"}}>
<div>
<div style={{fontSize:11,color:C.g500,marginBottom:4}}>疾患ランキング</div>
{todayStats.diseases.map(([d,n],i)=>(
<div key={d} style={{fontSize:12,color:C.g700,display:"flex",gap:6,alignItems:"center"}}>
<span style={{fontSize:10,color:C.g400}}>{i+1}.</span><span>{d}</span><span style={{fontSize:10,color:C.pD,fontWeight:600}}>{n}件</span>
</div>
))}
</div>
<div>
<div style={{fontSize:11,color:C.g500,marginBottom:4}}>診察室別</div>
{Object.entries(todayStats.rooms).map(([r,n])=>{
const rc=ROOM_COLORS[r]||{bg:"#f3f4f6",text:"#6b7280",border:"#e5e7eb"};
const roomInfo=R.find(rm=>rm.id===r);
return(
<div key={r} style={{display:"flex",alignItems:"center",gap:4,fontSize:12}}>
<span style={{padding:"1px 6px",borderRadius:4,background:rc.bg,color:rc.text,border:`1px solid ${rc.border}`,fontSize:10,fontWeight:700}}>{roomInfo?.i}{roomInfo?.l||r}</span>
<span style={{color:C.g700,fontWeight:600}}>{n}件</span>
</div>
)})}
</div>
</div>}
</div>}
{autoTplMsg&&<div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:8,background:"#f0fdf4",border:"1px solid #86efac",fontSize:11,fontWeight:600,color:"#16a34a",marginBottom:4,animation:"fadeIn 0.3s ease"}}>
<span>{autoTplMsg}</span>
<button onClick={()=>setAutoTplMsg("")} style={{marginLeft:"auto",background:"none",border:"none",fontSize:10,color:"#16a34a",cursor:"pointer",padding:"0 2px"}}>✕</button>
</div>}
<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{(()=>{const vis=tplVisible||DEFAULT_VISIBLE_TPLS;const ordered=tplOrder?tplOrder.map(id=>T.find(t=>t.id===id)).filter(Boolean):T;return ordered.filter(t=>vis.includes(t.id))})().map((t,idx)=>(<button key={t.id}
draggable
onDragStart={e=>{setDragTpl(idx);e.dataTransfer.effectAllowed="move"}}
onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move"}}
onDrop={e=>{e.preventDefault();if(dragTpl===null||dragTpl===idx)return;const order=tplOrder?[...tplOrder]:T.map(x=>x.id);const[item]=order.splice(dragTpl,1);order.splice(idx,0,item);setTplOrder(order);setDragTpl(null);try{localStorage.setItem("mk_tplOrder",JSON.stringify(order))}catch{}}}
onDragEnd={()=>setDragTpl(null)}
onClick={()=>{sTid(t.id);autoTplRef.current=true;setAutoTplMsg("")}}
style={{padding:mob?"4px 8px":"5px 12px",borderRadius:10,border:tid===t.id?`2px solid ${C.p}`:`1.5px solid ${C.g200}`,background:tid===t.id?C.pLL:C.w,fontSize:mob?11:12,fontWeight:tid===t.id?700:500,color:tid===t.id?C.pD:C.g600,fontFamily:"inherit",cursor:"grab",boxShadow:dragTpl===idx?"0 4px 12px rgba(0,0,0,.3)":"0 1px 4px rgba(0,0,0,.1)",opacity:dragTpl===idx?0.5:1,transition:"all 0.15s ease",transform:dragTpl===idx?"scale(1.05)":"scale(1)",whiteSpace:"nowrap"}}>{t.name}</button>))}</div>
{shortcuts.some(s=>s.showOnTop&&s.enabled)&&!(mob&&mobileHideItems.shortcuts)&&<div style={{display:"flex",gap:4,marginBottom:10,flexWrap:mob?"nowrap":"wrap",padding:"8px 12px",borderRadius:14,background:"linear-gradient(135deg,#f7fee7,#ecfccb)",border:"1px solid #ecfccb",overflowX:mob?"auto":"visible"}}>
<span style={{fontSize:10,color:C.pD,fontWeight:600,alignSelf:"center",marginRight:4}}>⌨️</span>
{shortcuts.filter(s=>s.showOnTop&&s.enabled).map(sc=>(<button key={sc.id} onClick={()=>{
const actions={rec:()=>{if(rsRef.current==="recording"){stop()}else{go()}},sum:()=>sum(),clear:()=>{saveUndo();sInp("");sOut("");sSt("クリアしました")},next:()=>clr(),copy:()=>{if(out)cp(out)},pip:()=>{pipActive?closePip():openPip()},doc:()=>setPage("doc"),counsel:()=>setPage("counsel"),undo:()=>undo(),room1:()=>sRid("r1"),room2:()=>sRid("r2"),room3:()=>sRid("r3"),room4:()=>sRid("r4"),room5:()=>sRid("r5"),room6:()=>sRid("r6"),room7:()=>sRid("r7")};
const fn=actions[sc.id];if(fn)fn();
}} style={{padding:"3px 8px",borderRadius:8,border:`1px solid ${C.p}55`,background:C.w,fontSize:mob?10:11,fontWeight:700,color:"#1a3a10",fontFamily:"inherit",cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
<span style={{fontSize:9,color:"#1a3a10",fontWeight:700}}>{sc.label.replace(/^[^\s]+\s/,"")}</span>
<span style={{fontSize:9,padding:"1px 4px",borderRadius:4,background:C.pD,color:C.w,fontFamily:"monospace",fontWeight:700}}>{sc.key}</span>
</button>))}
</div>}
<div style={{...card,position:"relative"}}>
{!(mob&&mobileHideItems.pip)&&<button onClick={pipActive?closePip:openPip} title="フローティング小窓を開く（PiPモード）" onMouseEnter={e=>showTip(e,"フローティング小窓（PiP）")} onMouseLeave={hideTip} style={{position:"absolute",top:16,right:16,width:60,height:60,borderRadius:"50%",border:"none",background:pipActive?"#22c55e":"linear-gradient(135deg,#3f6212,#65a30d)",color:"#fff",fontSize:15,fontWeight:700,fontFamily:"inherit",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,boxShadow:pipActive?"0 0 0 3px rgba(16,185,129,.25)":"0 2px 10px rgba(20,184,166,.2)",transition:"all 0.2s"}}>
<span style={{fontSize:18}}>🌟</span><span style={{fontSize:9}}>{pipActive?"OFF":"小窓"}</span></button>}
<div style={{display:"flex",alignItems:"center",gap:mob?4:8,marginBottom:8,paddingRight:70}}>
<span style={{fontSize:13}}>🔢</span>
<input value={pId} onChange={e=>{sPId(e.target.value);pIdRef.current=e.target.value;clearTimeout(window._visitTimer);window._visitTimer=setTimeout(()=>checkVisitType(e.target.value),500)}} placeholder="患者ID" style={{width:mob?60:80,padding:"6px 8px",borderRadius:8,border:`1.5px solid ${C.g200}`,fontSize:mob?12:13,fontFamily:"inherit",textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}} maxLength={6}/>
{visitType==="first"&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:5,background:"#dcfce7",color:"#166534",fontWeight:700}}>🔰 初診</span>}
{visitType==="revisit"&&prevRecord&&<span onClick={()=>setHistPopup(prevRecord)} style={{fontSize:10,padding:"2px 7px",borderRadius:5,background:"#dbeafe",color:"#1e40af",fontWeight:700,cursor:"pointer"}}>🔄 再診（前回:{toJSTDate(prevRecord.created_at).substring(5)}）</span>}
<button onClick={()=>{loadHist();setPage("hist")}} title="診療履歴を表示" onMouseEnter={e=>showTip(e,"診療履歴を表示")} onMouseLeave={hideTip} style={{padding:mob?"4px 8px":"6px 12px",borderRadius:8,border:`1.5px solid ${C.g200}`,background:C.w,fontSize:mob?11:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>📂 履歴</button>
<button onClick={()=>setDictModal(true)} title="誤字脱字辞書を管理" onMouseEnter={e=>showTip(e,"誤字脱字辞書を管理")} onMouseLeave={hideTip} style={{padding:mob?"4px 8px":"6px 12px",borderRadius:8,border:`1.5px solid ${C.g200}`,background:C.w,fontSize:mob?11:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.06)",whiteSpace:"nowrap"}}>📖辞書</button>
<button onClick={()=>{loadFavorites();setPage("favs")}} title="お気に入りを表示" onMouseEnter={e=>showTip(e,"お気に入りを表示")} onMouseLeave={hideTip} style={{padding:mob?"4px 8px":"6px 12px",borderRadius:8,border:`1.5px solid ${C.g200}`,background:C.w,fontSize:mob?11:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.06)",whiteSpace:"nowrap"}}>⭐お気に入り</button>
{!(mob&&mobileHideItems.fontsize)&&<div style={{display:"flex",gap:3,marginLeft:"auto"}}>
{[["small","小"],["medium","中"],["large","大"]].map(([v,l])=><button key={v} onClick={()=>setFontSize(v)} title={`文字サイズ: ${l}`} onMouseEnter={e=>showTip(e,`文字サイズ: ${l}`)} onMouseLeave={hideTip} style={{padding:"2px 8px",borderRadius:7,border:"none",background:fontSize===v?"#22c55e":"#d1d5db",color:fontSize===v?"#fff":"#57534e",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.1)",transition:"all 0.15s"}}>{l}</button>)}
</div>}
</div>
{visitType==="revisit"&&prevRecord?.output_text&&<div style={{marginBottom:4,padding:"6px 10px",borderRadius:7,background:"#eff6ff",border:"1px solid #bfdbfe",display:"flex",alignItems:"center",gap:8}}>
<span style={{fontSize:11,color:"#1e40af"}}>📋 前回の要約を参照しますか？</span>
<button onClick={()=>{sInp(p=>p+(p?"\n\n":"")+"【前回参照】\n"+(prevRecord.output_text||"").substring(0,300));sSt("✓ 前回要約を追加しました")}} style={{padding:"2px 8px",borderRadius:5,border:"none",background:"#1e40af",color:"#fff",fontSize:10,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>追加</button>
</div>}
<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,marginBottom:8}}>
<RecoveryBanner mode="exam"/>
<DiagRow active={rs!=="inactive"}/>
{(autosaveAt||{}).exam?<span style={{fontSize:10,color:C.g400}}>💾 自動保存: {new Date(autosaveAt.exam).toLocaleTimeString("ja-JP")}</span>:null}
{rs!=="inactive"&&<span style={{fontSize:28,fontWeight:700,color:rs==="recording"?C.rG:C.warn,fontVariantNumeric:"tabular-nums"}}>{fm(el)}</span>}
{rs==="recording"&&<div style={{width:"60%",height:6,borderRadius:3,background:C.g200,overflow:"hidden"}}><div style={{width:`${lv}%`,height:"100%",background:`linear-gradient(90deg,${C.rG},${C.p})`,borderRadius:3,transition:"width 0.1s"}}/></div>}
<div style={{display:"flex",gap:10,alignItems:"center",justifyContent:"center",minHeight:mob?64:68,flexWrap:"wrap"}}>
{rs==="inactive"?(<button onClick={go} title="録音開始 / 停止" onMouseEnter={e=>showTip(e,"録音開始 / 停止")} onMouseLeave={hideTip} style={{...rb,width:mob?64:68,height:mob?64:68,background:theme.btnRecBg,color:theme.btnRecColor,boxShadow:"0 4px 15px rgba(61,90,30,.3), 0 2px 4px rgba(0,0,0,.1)"}}><span style={{fontSize:mob?20:22}}>🎙</span><span style={{fontSize:10}}>録音開始</span></button>):(<>
{rs==="recording"?(<button onClick={pause} title="録音開始 / 停止" onMouseEnter={e=>showTip(e,"録音開始 / 停止")} onMouseLeave={hideTip} style={{...rb,width:60,height:60,background:C.warn,color:"#78350f"}}><span style={{fontSize:22}}>⏸</span></button>):(<button onClick={resume} title="録音開始 / 停止" onMouseEnter={e=>showTip(e,"録音開始 / 停止")} onMouseLeave={hideTip} style={{...rb,width:60,height:60,background:C.rG,color:C.w}}><span style={{fontSize:22}}>▶</span></button>)}
<button onClick={stopSum} title="AIで要約する" onMouseEnter={e=>showTip(e,"AIで要約する")} onMouseLeave={hideTip} style={{...rb,width:50,height:50,background:"linear-gradient(135deg, rgba(140,210,80,0.8), rgba(160,220,100,0.75))",color:"#1a3a10",boxShadow:"0 4px 14px rgba(101,163,13,.25)"}}><span style={{fontSize:14,fontWeight:700}}>✓</span><span style={{fontSize:9,fontWeight:700,color:"#1a3a10"}}>要約</span></button>
<button onClick={stop} title="録音開始 / 停止" onMouseEnter={e=>showTip(e,"録音開始 / 停止")} onMouseLeave={hideTip} style={{...rb,width:60,height:60,background:C.err,color:C.w}}><span style={{fontSize:22}}>⏹</span></button></>)}
<button onClick={()=>setSessionAudioSave(v=>{const next=v===null?!audioSave:!v;return next})} title="録音音声をSupabaseに保存する" onMouseEnter={e=>showTip(e,"録音音声を保存する")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${(sessionAudioSave!==null?sessionAudioSave:audioSave)?C.p:C.g200}`,background:(sessionAudioSave!==null?sessionAudioSave:audioSave)?"#f0fdf4":C.g50,fontSize:11,fontWeight:600,color:(sessionAudioSave!==null?sessionAudioSave:audioSave)?"#2a4a18":C.g400,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>🎙️音声保存 {(sessionAudioSave!==null?sessionAudioSave:audioSave)?"ON":"OFF"}</button>
</div>
{rs==="recording"&&<div style={{fontSize:11,color:C.g400}}>🎙 5秒ごとに自動書き起こし</div>}
{audioSaveNote&&<div style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:8,background:audioSaveNote.t==="err"?"#fef2f2":"#f0fdf4",border:`1px solid ${audioSaveNote.t==="err"?"#fecaca":"#bbf7d0"}`,color:audioSaveNote.t==="err"?"#b91c1c":"#15803d",whiteSpace:"nowrap"}}>{audioSaveNote.m}</div>}
</div>
<div style={{display:"flex",gap:mob?4:8,marginBottom:14,flexWrap:mob?"wrap":"nowrap"}}>
<button onClick={()=>sum()} disabled={ld||!inp.trim()} title="AIで要約する" onMouseEnter={e=>showTip(e,"AIで要約する")} onMouseLeave={hideTip} style={{flex:1,padding:"4px 16px",borderRadius:10,border:"none",background:ld?"rgba(160,220,100,0.2)":"linear-gradient(135deg, rgba(140,210,80,0.8), rgba(180,230,100,0.75), rgba(200,240,120,0.7))",color:"#1a3a10",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!inp.trim()?0.4:1,boxShadow:!ld&&inp.trim()?"0 4px 15px rgba(61,90,30,.3), 0 2px 4px rgba(0,0,0,.1)":"none",transition:"all 0.2s",minWidth:60,whiteSpace:"nowrap",height:mob?44:undefined}}>{ld?"⏳ 処理中...":"⚡ 要約"}</button>
{inp.trim()&&<button onClick={()=>manualClean(inp,(c)=>{sInp(c);iR.current=c},"inp")} disabled={cleaningTx} title="書き起こしを補正（捏造除去・用語補正）" onMouseEnter={e=>showTip(e,"書き起こしを補正（捏造除去・用語補正）")} onMouseLeave={hideTip} style={{padding:"10px 14px",borderRadius:14,border:"1px solid #ddd6fe",background:"#f5f3ff",fontSize:14,fontWeight:600,color:"#7c3aed",fontFamily:"inherit",cursor:cleaningTx?"wait":"pointer",whiteSpace:"nowrap",height:mob?44:undefined}}>{cleaningTx?(cleanProg&&cleanProg.total>1?`⏳${cleanProg.cur}/${cleanProg.total}`:"⏳"):"✨補正"}</button>}{undoCleanBtn("inp")}
<button onClick={()=>{saveUndo();sInp("");sOut("");sSt("クリアしました")}} title="書き起こし・要約をクリア" onMouseEnter={e=>showTip(e,"書き起こし・要約をクリア")} onMouseLeave={hideTip} style={{padding:"10px 16px",borderRadius:14,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer",minWidth:44,whiteSpace:"nowrap",height:mob?44:undefined}}>🗑</button>
<button onClick={undo} title="要約を元に戻す" onMouseEnter={e=>showTip(e,"要約を元に戻す")} onMouseLeave={hideTip} style={{padding:"10px 14px",borderRadius:14,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer",opacity:undoRef.current?1:.35,minWidth:44,whiteSpace:"nowrap",height:mob?44:undefined}}>↩</button>
<button onClick={()=>{clr();setTimeout(pipBtnUpdate,300)}} title="次の患者へ" onMouseEnter={e=>showTip(e,"次の患者へ")} onMouseLeave={hideTip} style={{padding:"10px 20px",borderRadius:14,border:`2px solid ${C.p}`,background:C.w,fontSize:14,fontWeight:700,color:C.pD,fontFamily:"inherit",cursor:"pointer",minWidth:80,whiteSpace:"nowrap",boxShadow:"0 3px 10px rgba(0,0,0,.15), 0 1px 3px rgba(0,0,0,.1)",height:mob?44:undefined}}>次へ ▶</button></div>
{ld&&<div style={{width:"100%",height:6,borderRadius:3,background:"rgba(160,220,100,0.2)",marginTop:8,marginBottom:8,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#8ac060)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={{display:"flex",gap:12,marginBottom:12,flexDirection:mob?"column":"row"}}>
{/* 左カラム: 書き起こし */}
<div style={{flex:1,minWidth:0}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,gap:6,flexWrap:"wrap"}}>
<span style={{fontSize:13,fontWeight:700,color:C.pDD,whiteSpace:"nowrap",flexShrink:0}}>📝 書き起こし</span>
<div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:10,color:C.g400,fontWeight:600,whiteSpace:"nowrap"}}>高さ:</span>{[[1,"小"],[2,"中"],[4,"大"]].map(([f,label])=><button key={f} type="button" onClick={()=>{setConsultTaSize(f);try{localStorage.setItem("mk_consultTextareaHeight",String(f))}catch{}}} style={{padding:"2px 7px",borderRadius:6,border:consultTaSize===f?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:consultTaSize===f?C.pLL:C.w,fontSize:10,fontWeight:consultTaSize===f?700:500,color:consultTaSize===f?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>{label}</button>)}<button onClick={runTypoCheck} disabled={typoLd} title="AIが書き起こしの医療用語誤字を検出" onMouseEnter={e=>showTip(e,"AIが医療用語の誤字を検出")} onMouseLeave={hideTip} style={{padding:"2px 6px",borderRadius:8,border:`1px solid ${C.p}44`,background:typoLd?"#e5e7eb":"#fffbeb",fontSize:11,fontWeight:600,color:typoLd?C.g400:"#92400e",fontFamily:"inherit",cursor:typoLd?"wait":"pointer"}}>{typoLd?"🔬...":"🔬"}</button>{!mob&&<span style={{fontSize:11,color:C.g400}}>{(iR.current||"").length}文字</span>}{rs==="recording"&&<span style={{fontSize:10,color:C.g400,marginLeft:8}}>{inp.length}文字{el>0&&<span style={{marginLeft:6,color:C.g400}}>/ 録音{Math.floor(el/60)>0?Math.floor(el/60)+"分":""}{el%60}秒</span>}{el>10&&inp.length>0&&<span style={{marginLeft:6,color:lv>50?"#22c55e":lv>20?"#f59e0b":"#ef4444"}}>{lv>50?"🎤 明瞭":lv>20?"🎤 普通":"🎤 小さい"}</span>}</span>}</div>
</div>
<textarea value={inp} onChange={e=>{sInp(e.target.value)}} placeholder="録音ボタンで音声を書き起こし、または直接入力..." style={{width:"100%",height:(mob?150:200)*consultTaSize,padding:10,borderRadius:12,border:`1.5px solid ${C.g200}`,background:C.g50,fontSize:15,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/>
</div>
{/* 右カラム: 要約結果 */}
<div style={{flex:1,minWidth:0}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,gap:6}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}>{summaryModel==="claude"?"Claude":"Gemini"} 要約結果{out&&modelBadge(geminiModel)}</span>
{out&&<div style={{display:"flex",gap:3,whiteSpace:"nowrap",flexWrap:"wrap"}}><button onClick={runTypoCheckOut} disabled={typoLdOut} style={{padding:"2px 6px",borderRadius:8,border:`1px solid ${C.p}44`,background:typoLdOut?"#e5e7eb":"#fffbeb",fontSize:11,fontWeight:600,color:typoLdOut?C.g400:"#92400e",fontFamily:"inherit",cursor:typoLdOut?"wait":"pointer"}}>{typoLdOut?"🔬...":"🔬"}</button><button onClick={()=>cp(out)} title="要約をコピー" onMouseEnter={e=>showTip(e,"要約をコピー")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>{setFavSaveModal({title:new Date().toLocaleDateString("ja-JP")+(pId?" | "+pId:""),input_text:inp||"",output_text:out||"",recordId:""})}} title="お気に入りに保存" style={{padding:"2px 6px",borderRadius:8,border:"1px solid #f59e0b44",background:"#fffbeb",fontSize:11,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐</button>
{out&&<button onClick={()=>setHlMode(v=>!v)} style={{fontSize:10,padding:"2px 7px",borderRadius:5,border:`1px solid ${C.g200}`,background:hlMode?"#dbeafe":"#fff",color:hlMode?"#0369a1":C.g500,fontFamily:"inherit",cursor:"pointer"}}>{hlMode?"🎨 HL ON":"🎨 HL"}</button>}
</div>}
</div>
<textarea value={out} onChange={e=>sOut(e.target.value)} placeholder="要約結果がここに表示されます..." style={{width:"100%",height:(mob?150:200)*consultTaSize,padding:10,borderRadius:12,border:`1.5px solid ${C.g200}`,background:out?"linear-gradient(135deg,#f7fee7,#ecfccb)":C.g50,fontSize:15,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box",display:hlMode?"none":undefined}}/>
{out&&hlMode&&<div style={{width:"100%",minHeight:120,padding:10,borderRadius:10,border:`1px solid ${C.g200}`,background:"#fafafa",fontSize:13,lineHeight:1.8,whiteSpace:"pre-wrap",wordBreak:"break-word",fontFamily:"inherit",overflowY:"auto",maxHeight:400}} dangerouslySetInnerHTML={{__html:highlightSummary(out)}}/>}
{out&&lastRecordId&&<div style={{marginTop:6,display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:C.g50,border:`1px solid ${C.g200}`}}>
<span style={{fontSize:11,color:C.g500}}>この要約は：</span>
<button onClick={()=>saveFeedback("good")} disabled={feedbackSaving} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${feedback==="good"?"#16a34a":C.g200}`,background:feedback==="good"?"#dcfce7":"#fff",fontSize:11,fontWeight:600,color:feedback==="good"?"#16a34a":C.g500,fontFamily:"inherit",cursor:"pointer"}}>👍 良い</button>
<button onClick={()=>saveFeedback("needs_fix")} disabled={feedbackSaving} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${feedback==="needs_fix"?"#dc2626":C.g200}`,background:feedback==="needs_fix"?"#fee2e2":"#fff",fontSize:11,fontWeight:600,color:feedback==="needs_fix"?"#dc2626":C.g500,fontFamily:"inherit",cursor:"pointer"}}>👎 要修正</button>
{feedback&&<span style={{fontSize:10,color:C.g400}}>✓ 記録済み</span>}
</div>}
{rxItems.length>0&&<div style={{marginTop:8,padding:10,borderRadius:10,border:"1px solid #a78bfa",background:"#f5f3ff"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
<span style={{fontSize:12,fontWeight:700,color:"#6d28d9"}}>💊 処方チェックリスト（{rxItems.length}件）</span>
<button onClick={()=>{setRxOpen(v=>!v)}} style={{fontSize:10,color:"#6d28d9",background:"none",border:"none",cursor:"pointer"}}>{rxOpen?"▲ 閉じる":"▼ 開く"}</button>
</div>
{rxOpen&&<div style={{display:"flex",flexDirection:"column",gap:4}}>
{rxItems.map((item,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 8px",borderRadius:8,background:"rgba(255,255,255,0.7)",border:"1px solid #c4b5fd"}}>
<input type="checkbox" style={{marginTop:2,accentColor:"#7c3aed",cursor:"pointer",flexShrink:0}}/>
<div style={{flex:1}}>
<div style={{fontSize:12,fontWeight:700,color:"#4c1d95"}}>{item.name}</div>
<div style={{fontSize:11,color:"#6d28d9"}}>{item.usage}{item.duration?" / "+item.duration:""}</div>
</div>
<span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:item.type==="外用"?"#dbeafe":item.type==="内服"?"#dcfce7":"#fef9c3",color:item.type==="外用"?"#1e40af":item.type==="内服"?"#166534":"#854d0e",flexShrink:0}}>{item.type}</span>
</div>)}
<div style={{display:"flex",gap:6,marginTop:4}}>
<button onClick={()=>{const t=rxItems.map(it=>`☐ ${it.name}（${it.usage}${it.duration?" / "+it.duration:""}）`).join("\n");navigator.clipboard.writeText(t);sSt("💊 処方リストをコピーしました")}} style={{padding:"4px 10px",borderRadius:7,border:"1px solid #a78bfa",background:"#fff",fontSize:11,fontWeight:600,color:"#6d28d9",fontFamily:"inherit",cursor:"pointer"}}>📋 リストをコピー</button>
<button onClick={generateUsageGuide} style={{padding:"4px 10px",borderRadius:7,border:"1px solid #7c3aed",background:"#f5f3ff",fontSize:11,fontWeight:600,color:"#6d28d9",fontFamily:"inherit",cursor:"pointer"}}>📖 塗り方説明書を生成</button>
</div>
</div>}
</div>}
{rxLd&&<div style={{marginTop:6,fontSize:11,color:"#6d28d9",textAlign:"center"}}>💊 処方リスト抽出中...</div>}
</div>
</div>
{snippets.length>0&&<div style={{marginTop:8}}>
<div style={{display:"flex",gap:3,alignItems:"center",marginBottom:4}}><span style={{fontSize:10,color:C.g400,fontWeight:600}}>文字:</span>{[[12,"小"],[14,"中"],[16,"大"],[18,"特大"]].map(([v,l])=><button key={v} onClick={()=>{setSnippetFontSize(v);try{localStorage.setItem("mk_snippetFontSize",String(v))}catch{}}} style={{padding:"2px 8px",borderRadius:7,border:"none",background:snippetFontSize===v?"#22c55e":"#d1d5db",color:snippetFontSize===v?"#fff":"#57534e",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",transition:"all 0.15s"}}>{l}</button>)}</div>
{mob?(()=>{const cats=[...new Set(snippets.map(s=>s.cat||"その他"))];return<div style={{display:"flex",flexDirection:"column",gap:4,padding:"6px 0"}}>{cats.map((cat,ci)=>{const isOpen=snCatOpen===null?ci===0:snCatOpen===cat;return<div key={cat}><button onClick={()=>setSnCatOpen(isOpen&&snCatOpen!==null?null:cat)} style={{width:"100%",padding:"6px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:"#f7fee7",fontSize:snippetFontSize-2,fontWeight:700,color:C.pD,fontFamily:"inherit",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{cat}</span><span style={{fontSize:snippetFontSize-4}}>{isOpen?"▲":"▼"}</span></button>{isOpen&&<div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"6px 4px"}}>{snippets.filter(s=>(s.cat||"その他")===cat).map((sn,j)=><button key={j} onClick={()=>{sOut(o=>o+(o?"\n":"")+sn.text);navigator.clipboard.writeText(sn.text).catch(()=>{});sSt("📋 "+sn.title+" をコピー")}} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.w,fontSize:snippetFontSize,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>{sn.title}</button>)}</div>}</div>})}</div>})():<div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"6px 0"}}>
{[...new Set(snippets.map(s=>s.cat||"その他"))].map(cat=>(
<div key={cat} style={{display:"flex",flexWrap:"wrap",gap:3,alignItems:"center"}}>
<span style={{fontSize:snippetFontSize-2,color:C.g400,fontWeight:600,padding:"0 2px"}}>{cat}:</span>
{snippets.filter(s=>(s.cat||"その他")===cat).map((sn,j)=>(
<button key={j} onClick={()=>{sOut(o=>o+(o?"\n":"")+sn.text);navigator.clipboard.writeText(sn.text).catch(()=>{});sSt("📋 "+sn.title+" をコピー")}} style={{padding:"2px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.w,fontSize:snippetFontSize,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>{sn.title}</button>
))}
</div>
))}
</div>}
</div>}
{ld&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが要約を作成中...</span></div>}
{/* トップ画面用お気に入りグループ選択モーダル */}
{favSaveModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFavSaveModal(null)}>
<div style={{background:"rgba(255,255,255,0.85)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderRadius:14,padding:20,maxWidth:320,width:"100%",border:"1px solid rgba(160,220,100,0.2)"}} onClick={e=>e.stopPropagation()}>
<div style={{fontSize:14,fontWeight:700,color:"#2a5018",marginBottom:4}}>⭐ お気に入りに保存</div>
{favSaveModal.title&&<div style={{fontSize:11,color:C.g400,marginBottom:10}}>{favSaveModal.title}</div>}
{FAV_GROUPS.map(g=><button key={g} onClick={()=>{saveFavoriteSplit(g,favSaveModal.title,favSaveModal.input_text,favSaveModal.output_text,favSaveModal.recordId);setFavSaveModal(null)}} style={{display:"block",width:"100%",padding:"10px 14px",marginBottom:6,borderRadius:10,border:"1px solid rgba(160,220,100,0.2)",background:"rgba(255,255,255,0.7)",fontSize:14,fontWeight:600,color:"#2a5018",fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>{g}</button>)}
<button onClick={()=>setFavSaveModal(null)} style={{width:"100%",padding:"8px",borderRadius:10,border:"1px solid rgba(160,220,100,0.2)",background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer",marginTop:4}}>キャンセル</button>
</div></div>}
{/* お気に入り保存トースト */}
{favToast&&<div style={{position:"fixed",bottom:30,left:"50%",transform:"translateX(-50%)",background:"#92400e",color:"#fff",padding:"8px 20px",borderRadius:12,fontSize:13,fontWeight:700,zIndex:10001,boxShadow:"0 4px 16px rgba(0,0,0,.3)"}}>{favToast}</div>}
{/* 辞書管理モーダル */}
{dictModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setDictModal(false)}>
<div style={{background:"#ffffff",borderRadius:16,padding:20,maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:15,fontWeight:700,color:C.pDD}}>📖 誤字脱字辞書（{dict.length}件）</span>
<button onClick={()=>setDictEnabled(!dictEnabled)} style={{padding:"3px 10px",borderRadius:8,border:"none",background:dictEnabled?C.rG:C.g200,color:dictEnabled?C.w:C.g500,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>{dictEnabled?"ON":"OFF"}</button></div>
<button onClick={()=>setDictModal(false)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button>
</div>
<p style={{fontSize:11,color:C.g400,marginBottom:10}}>書き起こし結果に自動適用。左の文字列を右に置換します。</p>
<div style={{display:"flex",gap:6,marginBottom:12}}>
<input value={newFrom} onChange={e=>setNewFrom(e.target.value)} placeholder="変換前" style={{...ib,flex:1,padding:"6px 8px",fontSize:12}}/>
<span style={{alignSelf:"center",color:C.g400,fontSize:12}}>→</span>
<input value={newTo} onChange={e=>setNewTo(e.target.value)} placeholder="変換後" style={{...ib,flex:1,padding:"6px 8px",fontSize:12}}/>
<button onClick={()=>{if(newFrom.trim()&&newTo.trim()){dictAddEntry(newFrom.trim(),newTo.trim());setNewFrom("");setNewTo("")}}} style={{padding:"6px 12px",borderRadius:8,border:"none",background:C.p,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>追加</button>
</div>
<div style={{maxHeight:340,overflow:"auto"}}>
{dict.length===0&&<p style={{fontSize:12,color:C.g400,textAlign:"center",padding:20}}>辞書エントリがありません</p>}
{dict.map((d,i)=>(<div key={i} style={{display:"flex",gap:6,alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${C.g100}`}}>
<span style={{flex:1,fontSize:12,color:C.g500}}>{d[0]}</span>
<span style={{color:C.g400,fontSize:11}}>→</span>
<span style={{flex:1,fontSize:12,color:C.g900,fontWeight:600}}>{d[1]}</span>
<button onClick={()=>dictDelEntry(i)} style={{padding:"2px 8px",borderRadius:6,border:"1px solid #fecaca",background:C.w,fontSize:10,color:C.err,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>))}
</div>
<button onClick={()=>setDictModal(false)} style={{width:"100%",padding:"8px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer",marginTop:10}}>閉じる</button>
</div></div>}
{patientModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPatientModal(null)}>
<div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:700,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{padding:"12px 16px",borderBottom:`1px solid ${C.g200}`,borderRadius:"16px 16px 0 0",background:C.pLL,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<div>
  <span style={{fontSize:15,fontWeight:700,color:C.pD}}>👤 患者ID: {patientModal.pid}</span>
  <span style={{fontSize:12,color:C.g500,marginLeft:8}}>計{patientModal.records.length}件の診察記録</span>
</div>
<button onClick={()=>setPatientModal(null)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:"#fff",fontSize:12,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16,display:"flex",flexDirection:"column",gap:10}}>
{patientModal.records.map((r,i)=>{
  const date=r.created_at?new Date(r.created_at).toLocaleDateString("ja-JP",{year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";
  return(<div key={r.id||i} style={{padding:12,borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50}}>
    <div style={{fontSize:11,color:C.g400,marginBottom:4}}>{date} — {r.room||""} {r.template||""}</div>
    <pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit"}}>{r.output_text||"（要約なし）"}</pre>
    {r.input_text&&<div style={{marginTop:6,display:"flex",alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
      <details style={{flex:"1 1 60%",minWidth:0}}><summary style={{fontSize:11,color:C.g400,cursor:"pointer"}}>📝 書き起こしを表示</summary><pre style={{fontSize:11,color:C.g500,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:"4px 0 0",lineHeight:1.6,fontFamily:"inherit",padding:8,background:"#fff",borderRadius:6,border:`1px solid ${C.g200}`}}>{r.input_text}</pre></details>
      <button onClick={(e)=>{e.stopPropagation();copyTextToClipboard(r.input_text,"書き起こし")}} title="書き起こしをクリップボードにコピー" style={{padding:"4px 10px",borderRadius:6,border:"1px solid #d4cce8",background:"#fff",color:"#7c3aed",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap",fontFamily:"inherit"}}>📋 コピー</button>
    </div>}
  </div>)
})}
</div>
</div>
</div>}
{monthlyModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setMonthlyModal(false)}>
<div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:740,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{padding:"12px 16px",borderBottom:"1px solid #e0f2fe",background:"#e0f2fe",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<span style={{fontSize:15,fontWeight:700,color:"#0369a1"}}>📊 {monthlyTarget} 月次診療レポート</span>
<button onClick={()=>setMonthlyModal(false)} style={{padding:"4px 12px",borderRadius:8,border:"1px solid #bae6fd",background:"#fff",fontSize:12,fontWeight:600,color:"#0369a1",fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
{monthlyLd?<div style={{textAlign:"center",padding:40}}><div style={{width:32,height:32,border:"3px solid #e0f2fe",borderTop:"3px solid #0369a1",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/><span style={{color:"#0369a1",fontSize:13}}>AIが今月のデータを分析中...</span></div>:<pre style={{fontSize:13,color:"#374151",whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.9,fontFamily:"inherit"}}>{monthlyResult}</pre>}
</div>
{monthlyResult&&!monthlyLd&&<div style={{padding:"10px 16px",borderTop:"1px solid #e5e7eb",display:"flex",gap:8}}>
<button onClick={()=>{navigator.clipboard.writeText(monthlyResult);sSt("📋 月次レポートをコピーしました")}} style={{padding:"6px 14px",borderRadius:8,border:"none",background:"#0369a1",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>{saveFavorite("月次レポート",monthlyTarget,monthlyResult,"");setMonthlyModal(false)}} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:700,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐ 保存</button>
</div>}
</div>
</div>}
{/* 問診票生成モーダル */}
{qModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setQModal(false)}>
<div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:640,maxHeight:"90vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
<div style={{padding:"12px 16px",borderBottom:`1px solid ${C.g200}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<span style={{fontSize:15,fontWeight:700,color:C.pD}}>📄 AI問診票生成</span>
<button onClick={()=>setQModal(false)} style={{padding:"3px 10px",borderRadius:7,border:`1px solid ${C.g200}`,background:"#fff",fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{padding:16,flex:1,overflow:"auto"}}>
<div style={{marginBottom:12}}>
<label style={{fontSize:12,color:C.g600,display:"block",marginBottom:4}}>疾患名・症状</label>
<input value={qDisease} onChange={e=>setQDisease(e.target.value)} placeholder="例：アトピー性皮膚炎、ニキビ、水虫..." style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.g200}`,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
</div>
<div style={{display:"flex",gap:8,marginBottom:12}}>
<button onClick={()=>setQFirstVisit(true)} style={{flex:1,padding:"6px",borderRadius:8,border:`2px solid ${qFirstVisit?C.pD:C.g200}`,background:qFirstVisit?C.pLL:"#fff",fontSize:12,fontWeight:600,color:qFirstVisit?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>🔰 初診</button>
<button onClick={()=>setQFirstVisit(false)} style={{flex:1,padding:"6px",borderRadius:8,border:`2px solid ${!qFirstVisit?C.pD:C.g200}`,background:!qFirstVisit?C.pLL:"#fff",fontSize:12,fontWeight:600,color:!qFirstVisit?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>🔄 再診</button>
</div>
<button onClick={generateQuestionnaire} disabled={qLd||!qDisease.trim()} style={{width:"100%",padding:"8px",borderRadius:8,border:"none",background:C.pD,color:"#fff",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer",marginBottom:12,boxSizing:"border-box"}}>{qLd?"⏳ 生成中...":"✨ 問診票を生成"}</button>
{qResult&&<div>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.8,padding:12,background:C.g50,borderRadius:8,border:`1px solid ${C.g200}`}}>{qResult}</pre>
<div style={{display:"flex",gap:8,marginTop:8}}>
<button onClick={()=>navigator.clipboard.writeText(qResult).then(()=>sSt("📋 問診票をコピーしました"))} style={{flex:1,padding:"6px",borderRadius:7,border:"none",background:C.pD,color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>{window.print()}} style={{flex:1,padding:"6px",borderRadius:7,border:`1px solid ${C.g200}`,background:"#fff",fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>🖨️ 印刷</button>
</div>
</div>}
</div>
</div>
</div>}
{/* 塗り方説明書モーダル */}
{usageGuideModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setUsageGuideModal(false)}>
<div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"90vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
<div style={{padding:"12px 16px",borderBottom:`1px solid ${C.g200}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#f5f3ff",borderRadius:"16px 16px 0 0"}}>
<span style={{fontSize:15,fontWeight:700,color:"#6d28d9"}}>📖 塗り方説明書</span>
<button onClick={()=>setUsageGuideModal(false)} style={{padding:"3px 10px",borderRadius:7,border:"1px solid #c4b5fd",background:"#fff",fontSize:12,color:"#6d28d9",fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
{usageGuideLd?<div style={{textAlign:"center",padding:32,color:"#6d28d9"}}>⏳ 説明書を生成中...</div>:
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.9,fontFamily:"inherit"}}>{usageGuide}</pre>}
</div>
{usageGuide&&!usageGuideLd&&<div style={{padding:"10px 16px",borderTop:`1px solid ${C.g200}`,display:"flex",gap:8}}>
<button onClick={()=>navigator.clipboard.writeText(usageGuide).then(()=>sSt("📋 説明書をコピーしました"))} style={{flex:1,padding:"6px",borderRadius:7,border:"none",background:"#6d28d9",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>window.print()} style={{flex:1,padding:"6px",borderRadius:7,border:"1px solid #c4b5fd",background:"#f5f3ff",fontSize:12,fontWeight:700,color:"#6d28d9",fontFamily:"inherit",cursor:"pointer"}}>🖨️ 印刷</button>
</div>}
</div>
</div>}
{/* AI誤字スキャンモーダル */}
{typoModalEl}
{/* 議事録：未保存確認モーダル */}
{unsavedMinModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>!minSavingNext&&setUnsavedMinModal(false)}>
<div style={{background:"#ffffff",borderRadius:16,padding:24,maxWidth:420,width:"100%",boxShadow:"0 8px 32px rgba(0,0,0,.18)"}} onClick={e=>e.stopPropagation()}>
<div style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>⚠️ 未保存のデータがあります</div>
<div style={{fontSize:13,color:C.g600,marginBottom:18,lineHeight:1.6}}>保存していない書き起こしまたは要約があります。どうしますか？</div>
<div style={{display:"flex",flexDirection:"column",gap:8}}>
<button onClick={minNextSaveAndProceed} disabled={minSavingNext} style={{padding:"10px 16px",borderRadius:10,border:"none",background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:minSavingNext?"wait":"pointer"}}>{minSavingNext?"💾 保存中...":"💾 保存して次へ"}</button>
<button onClick={minNextDiscardAndProceed} disabled={minSavingNext} style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${C.g300}`,background:"#fff",color:"#dc2626",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:minSavingNext?"not-allowed":"pointer"}}>🗑 保存せず次へ（データ破棄）</button>
<button onClick={()=>setUnsavedMinModal(false)} disabled={minSavingNext} style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50,color:C.g500,fontSize:13,fontWeight:600,fontFamily:"inherit",cursor:minSavingNext?"not-allowed":"pointer"}}>キャンセル</button>
</div>
</div>
</div>}
</div></div>);}