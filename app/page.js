"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";

// === RESPONSIVE HOOK ===
function useResponsive(){
const[w,setW]=useState(1024);
useEffect(()=>{setW(window.innerWidth);const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h)},[]);
return{isMobile:w<640,isTablet:w>=640&&w<1024,w};
}

// === COLOR THEME (Pearl Breeze) ===
const C={p:"#5a9040",pD:"#3a6820",pDD:"#2a5018",pL:"rgba(160,220,100,0.25)",pLL:"rgba(200,240,160,0.15)",w:"rgba(255,255,255,0.7)",g50:"rgba(255,255,255,0.5)",g100:"rgba(240,252,228,0.6)",g200:"rgba(160,220,100,0.2)",g300:"#d6d3d1",g400:"#a8a29e",g500:"#5a8838",g600:"#57534e",g700:"#44403c",g800:"#292524",g900:"#1c1917",err:"#f43f5e",warn:"#f59e0b",rG:"#5a9040",pLL2:"rgba(200,240,160,0.15)"};

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

// === TEMPLATES ===
const DEFAULT_VISIBLE_TPLS=["soap-std","soap-min"];
const T=[
{id:"soap",name:"📋 詳細",prompt:`あなたは皮膚科専門の医療秘書です。以下の書き起こしテキストをカルテ形式で要約してください。

【話者分離ルール】
- 「です」「ます」「ください」等の丁寧語・指示語は医師/医療従事者の発言と判断
- 「痛い」「かゆい」「気になる」「〜してほしい」等の訴え・希望は患者の発言と判断
- 「塗ってください」「飲んでください」は医師の指示
- 「塗っています」「飲んでいます」は患者の報告
- 診断名・処方の決定は医師、症状の訴えは患者として分離

【複数疾患への対応】
- 会話中に複数の疾患・症状が話題になった場合、疾患ごとにASOPをまとめる
- 各疾患ブロックを --- で区切る

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
P）計画内容
患者情報）背景やイベント情報

【複数疾患の場合の例】
# かぶれ（接触性皮膚炎）
S）両前腕の痒み
O）紅斑性丘疹を散在性に認める
P）リンデロン-VG軟膏 1日2回
---
# 水虫（足白癬）
S）足指の間がジュクジュクする
O）第3-4趾間に浸軟・鱗屑
P）ルリコン液 1日1回

【フォーマットの厳密なルール】
- # の後に半角スペース1つ、その後に「平易な表現（医学用語）」形式で疾患名を記載
- S）O）P）患者情報）の直後に内容を続ける（改行しない）
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
- 不要な項目は出力しない
- # の後は「平易な表現（医学用語）」形式で記載（例: 水虫（足白癬）、ニキビ（尋常性ざ瘡）、イボ（尋常性疣贅）、かぶれ（接触性皮膚炎）、じんましん（蕁麻疹）、ヘルペス（単純疱疹）、とびひ（伝染性膿痂疹）、あせも（汗疹）、シミ（肝斑）、ホクロ（色素性母斑）、アトピー（アトピー性皮膚炎）、手荒れ（手湿疹）、乾燥肌の湿疹（皮脂欠乏性湿疹）、粉瘤（表皮嚢腫）、赤ら顔（酒さ））
- 医師が病名を言った場合はそれを優先、なければ所見から推定

【出力フォーマット（厳守）】
# 疾患名
S）主訴（1文）
O）所見（簡潔に）
P）処方・指示

【例】
# アトピー（アトピー性皮膚炎）
S）手足の痒み、夜間増悪
O）四肢に紅斑・丘疹、顔面に赤み
P）ステロイド外用 1日2回、2週後再診
---
# イボ（尋常性疣贅）
S）手の疣贅
O）手背に多発
P）冷凍凝固療法`},
{id:"soap-min",name:"📋 簡潔",prompt:`皮膚科の医療秘書として最小限にカルテ要約。

【ルール】
- 1疾患あたり最大3行で完結
- 修飾語・詳細な説明は全て省く
- 薬剤名と用法のみ
- 複数疾患は --- で区切る
- 推測しない
- # の後は「平易な表現（医学用語）」形式（例: 水虫（足白癬）、ニキビ（尋常性ざ瘡）等）

【出力フォーマット（厳守）】
# 疾患名
S）一言
O）一言
P）処方名のみ

【例】
# かぶれ（接触性皮膚炎）
S）両前腕の痒み
O）紅斑性丘疹
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
["ただ","ただれ（びらん）"],["びらん","びらん"],
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
["たこ","胼胝"],["うおのめ","鶏眼"],["べんち","胼胝"],["けいがん","鶏眼"],
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

// === MAIN COMPONENT ===
export default function Home(){
const{isMobile:mob,isTablet:tab,w:winW}=useResponsive();
const btn=(bg,c,extra)=>({padding:mob?"5px 10px":"6px 14px",borderRadius:12,border:"1px solid rgba(140,210,80,0.4)",background:bg,color:c,fontSize:mob?15:16,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 3px 12px rgba(140,210,80,0.25)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",transition:"all 0.15s ease",transform:"translateY(0)",...extra});
const ib={padding:mob?"7px 10px":"8px 12px",borderRadius:mob?10:12,border:`1.5px solid ${C.g200}`,fontSize:15,fontFamily:"inherit",outline:"none",background:C.w,color:C.g900,transition:"border-color 0.2s",WebkitAppearance:"none"};
const card={borderRadius:14,border:"1px solid rgba(160,220,100,0.2)",padding:mob?14:20,background:"rgba(255,255,255,0.7)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",marginBottom:mob?12:16,boxShadow:"0 1px 4px rgba(0,0,0,.03)"};
const rb={borderRadius:"50%",border:"none",fontFamily:"inherit",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s ease",boxShadow:"0 2px 8px rgba(0,0,0,.08)"};
const[page,setPage]=useState("main"); // main|room|hist|settings|help|about
const[rs,sRS]=useState("inactive"),[inp,sInp]=useState(""),[out,sOut]=useState(""),[st,sSt]=useState("待機中"),[el,sEl]=useState(0),[ld,sLd]=useState(false),[prog,setProg]=useState(0),[lv,sLv]=useState(0),[md,sMd]=useState("gemini"),[geminiModel,setGeminiModel]=useState(""),[summaryModel,setSummaryModel]=useState("gemini"),[pc,sPC]=useState(0),[tid,sTid]=useState("soap-std"),[rid,sRid]=useState("r1");
const[tplOrder,setTplOrder]=useState(null);
const[tplVisible,setTplVisible]=useState(null);
const[dragTpl,setDragTpl]=useState(null);
const[hist,sHist]=useState([]),[search,setSearch]=useState(""),[pName,sPName]=useState(""),[pId,sPId]=useState(""),[histTab,setHistTab]=useState({});
const[histPopup,setHistPopup]=useState(null);
const[selectedHistIds,setSelectedHistIds]=useState(new Set());
const[histTypoLd,setHistTypoLd]=useState(false);
const[bulkMenu,setBulkMenu]=useState(false);
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
useEffect(()=>{try{const l=localStorage.getItem("mk_logo");if(l)setLogoUrl(l);const s=localStorage.getItem("mk_logoSize");if(s)setLogoSize(parseInt(s));const d=localStorage.getItem("mk_dict");if(d)setDict(JSON.parse(d));const sn=localStorage.getItem("mk_snippets");if(sn)setSnippets(JSON.parse(sn));const ps=localStorage.getItem("mk_pipSnippets");if(ps)setPipSnippets(JSON.parse(ps));const as=localStorage.getItem("mk_audioSave");if(as)setAudioSave(as==="1");const de=localStorage.getItem("mk_dictEnabled");if(de)setDictEnabled(de==="1");const sc=localStorage.getItem("mk_shortcuts");if(sc)setShortcuts(JSON.parse(sc));const o=localStorage.getItem("mk_tplOrder");if(o)setTplOrder(JSON.parse(o));const tv=localStorage.getItem("mk_tplVisible");if(tv)setTplVisible(JSON.parse(tv));const dt=localStorage.getItem("mk_defaultTpl");if(dt)sTid(dt);const sm=localStorage.getItem("mk_summaryModel");if(sm)setSummaryModel(sm);const rph=localStorage.getItem("mk_rpHistory");if(rph)setRpHistory(JSON.parse(rph));const snsh=localStorage.getItem("mk_snsHistory");if(snsh)setSnsHistory(JSON.parse(snsh));const fs=localStorage.getItem("mk_fontSize");if(fs)setFontSize(fs);const ff=localStorage.getItem("mk_fontFamily");if(ff)setFontFamily(ff);const mh=localStorage.getItem("mk_mobileHide");if(mh)setMobileHideItems(JSON.parse(mh));const sfs=localStorage.getItem("mk_snippetFontSize");if(sfs)setSnippetFontSize(parseInt(sfs))}catch{}},[]);
useEffect(()=>{if(!supabase)return;(async()=>{try{const{data}=await supabase.from("dictionary").select("from_text,to_text").order("created_at",{ascending:false});if(data&&data.length>0){setDict(prev=>{const sbEntries=data.map(r=>[r.from_text,r.to_text]);const localOnly=prev.filter(([f])=>!sbEntries.some(([sf])=>sf===f));const merged=[...sbEntries,...localOnly];try{localStorage.setItem("mk_dict",JSON.stringify(merged))}catch{}return merged})}}catch(e){console.error("dict load from supabase error:",e)}})()},[]);
useEffect(()=>{const sizes={small:"12px",medium:"14px",large:"16px"};document.documentElement.style.fontSize=sizes[fontSize]||"14px";const zooms={small:"0.85",medium:"1",large:"1.2"};document.documentElement.style.zoom=zooms[fontSize]||"1";localStorage.setItem("mk_fontSize",fontSize)},[fontSize]);
useEffect(()=>{document.documentElement.style.fontFamily=`'${fontFamily}', sans-serif`;document.body.style.fontFamily=`'${fontFamily}', sans-serif`;localStorage.setItem("mk_fontFamily",fontFamily)},[fontFamily]);
const[micDevices,setMicDevices]=useState([]),[selectedMic,setSelectedMic]=useState("");
const loadMics=async()=>{try{await navigator.mediaDevices.getUserMedia({audio:true}).then(s=>s.getTracks().forEach(t=>t.stop()));const devs=await navigator.mediaDevices.enumerateDevices();const mics=devs.filter(d=>d.kind==="audioinput");setMicDevices(mics);if(!selectedMic&&mics.length>0)setSelectedMic(mics[0].deviceId)}catch(e){console.error("Mic enumeration error:",e)}};
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
const[tasks,setTasks]=useState([]);
const[staffList,setStaffList]=useState([]);
const[selMinutes,setSelMinutes]=useState([]);
const[taskView,setTaskView]=useState("matrix");
const[taskAnalysis,setTaskAnalysis]=useState("");
const[taskAnalLd,setTaskAnalLd]=useState(false);
const[openMinId,setOpenMinId]=useState(null);
const[manualMinText,setManualMinText]=useState("");
const[manualMinTitle,setManualMinTitle]=useState("");
const[manualMinMode,setManualMinMode]=useState("text");
const[mergeLd,setMergeLd]=useState(false);
const[openTaskId,setOpenTaskId]=useState(null);
const[selRoles,setSelRoles]=useState(["director","manager","leader","staff"]);
const[matrixHistOpen,setMatrixHistOpen]=useState(true);
const[selMatrixDate,setSelMatrixDate]=useState(null);
const[selTaskIds,setSelTaskIds]=useState(new Set());
const[matrixMode,setMatrixMode]=useState("collapse");
const[openQuadrant,setOpenQuadrant]=useState(null);
const[todos,setTodos]=useState([]);
const[todoLd,setTodoLd]=useState(false);
const[minRS,setMinRS]=useState("inactive"),[minInp,setMinInp]=useState(""),[minOut,setMinOut]=useState(""),[minLd,setMinLd]=useState(false),[minEl,setMinEl]=useState(0),[minPrompt,setMinPrompt]=useState("");
const[audioSave,setAudioSave]=useState(false),[audioChunks,setAudioChunks]=useState([]),[savedMsg,setSavedMsg]=useState("");
const[sessionAudioSave,setSessionAudioSave]=useState(null);
const[favorites,setFavorites]=useState([]),[favGroup,setFavGroup]=useState("保険"),[favModal,setFavModal]=useState(null),[favToast,setFavToast]=useState(""),[favDetailModal,setFavDetailModal]=useState(null),[favMoveModal,setFavMoveModal]=useState(null);
const[favSaveModal,setFavSaveModal]=useState(null);
const[selectedFavIds,setSelectedFavIds]=useState(new Set());
const[tooltip,setTooltip]=useState({text:"",x:0,y:0,visible:false});
const[favEditModal,setFavEditModal]=useState(null),[favEditTitle,setFavEditTitle]=useState(""),[favEditGroup,setFavEditGroup]=useState(""),[favEditContent,setFavEditContent]=useState("");
const[favGenModal,setFavGenModal]=useState(null),[favGenPurpose,setFavGenPurpose]=useState("患者向け説明文"),[favGenResult,setFavGenResult]=useState(""),[favGenLoading,setFavGenLoading]=useState(false);
const[caseSearch,setCaseSearch]=useState(""),[caseStudyModal,setCaseStudyModal]=useState(null),[caseStudyResult,setCaseStudyResult]=useState(""),[caseStudyLoading,setCaseStudyLoading]=useState(false);
const[qcModal,setQcModal]=useState(null),[qcResult,setQcResult]=useState(""),[qcLoading,setQcLoading]=useState(false);
const[rpInput,setRpInput]=useState(""),[rpResult,setRpResult]=useState(""),[rpLoading,setRpLoading]=useState(false),[rpHistory,setRpHistory]=useState([]);
const[faqResult,setFaqResult]=useState(""),[faqLoading,setFaqLoading]=useState(false),[faqModal,setFaqModal]=useState(false);
const[menuResult,setMenuResult]=useState(""),[menuLoading,setMenuLoading]=useState(false),[menuModal,setMenuModal]=useState(false);
const[snsInput,setSnsInput]=useState(""),[snsPlatform,setSnsPlatform]=useState("Instagram"),[snsResult,setSnsResult]=useState(""),[snsLoading,setSnsLoading]=useState(false),[snsHistory,setSnsHistory]=useState([]);
const[satResult,setSatResult]=useState(""),[satLoading,setSatLoading]=useState(false);
const[kbResult,setKbResult]=useState(""),[kbLoading,setKbLoading]=useState(false),[kbMode,setKbMode]=useState(""),[kbFavGroup,setKbFavGroup]=useState("その他"),[kbModal,setKbModal]=useState(false);
const[calResult,setCalResult]=useState(""),[calLoading,setCalLoading]=useState(false),[calModal,setCalModal]=useState(false),[calFavGroup,setCalFavGroup]=useState("その他");
const[hpResult,setHpResult]=useState(""),[hpLoading,setHpLoading]=useState(false),[hpModal,setHpModal]=useState(false),[hpType,setHpType]=useState(""),[hpFavGroup,setHpFavGroup]=useState("その他");
const[trResult,setTrResult]=useState(""),[trLoading,setTrLoading]=useState(false),[trModal,setTrModal]=useState(false),[trType,setTrType]=useState(""),[trFavGroup,setTrFavGroup]=useState("その他"),[trCount,setTrCount]=useState(0);
const[pxResult,setPxResult]=useState(""),[pxLoading,setPxLoading]=useState(false),[pxModal,setPxModal]=useState(false),[pxType,setPxType]=useState(""),[pxFavGroup,setPxFavGroup]=useState("その他");
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
const generateFaq=async(group,favs)=>{setFaqLoading(true);setFaqResult("");setFaqModal(true);try{const content=favs.map(f=>`【${f.title||"無題"}】\n${f.content||""}`).join("\n---\n");const res=await fetch("/api/generate-faq",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});const data=await res.json();if(data.error)throw new Error(data.error);setFaqResult(data.result||"")}catch(e){setFaqResult("エラー: "+e.message)}finally{setFaqLoading(false)}};
const generateMenu=async(favs)=>{setMenuLoading(true);setMenuResult("");setMenuModal(true);try{const content=favs.map(f=>`【${f.title||"無題"}】\n${f.content||""}`).join("\n---\n");const res=await fetch("/api/generate-menu",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});const data=await res.json();if(data.error)throw new Error(data.error);setMenuResult(data.result||"")}catch(e){setMenuResult("エラー: "+e.message)}finally{setMenuLoading(false)}};
const generateSns=async()=>{if(!snsInput.trim())return;setSnsLoading(true);setSnsResult("");try{const res=await fetch("/api/generate-sns",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({platform:snsPlatform,theme:snsInput})});const data=await res.json();if(data.error)throw new Error(data.error);setSnsResult(data.result||"");const entry={id:Date.now(),platform:snsPlatform,theme:snsInput,result:data.result||"",date:new Date().toLocaleDateString("ja-JP")};try{const prev=JSON.parse(localStorage.getItem("mk_snsHistory")||"[]");const updated=[entry,...prev].slice(0,10);localStorage.setItem("mk_snsHistory",JSON.stringify(updated));setSnsHistory(updated)}catch{}}catch(e){setSnsResult("エラー: "+e.message)}finally{setSnsLoading(false)}};
const runSatisfactionAnalysis=async()=>{if(!supabase)return;setSatLoading(true);setSatResult("");try{const[{data:records},{data:counseling}]=await Promise.all([supabase.from("records").select("output_text,input_text").order("created_at",{ascending:false}).limit(30),supabase.from("counseling_records").select("transcription,summary").order("created_at",{ascending:false}).limit(30)]);let content="【診療記録】\n";if(records)content+=records.map(r=>r.output_text||r.input_text||"").filter(Boolean).join("\n---\n");content+="\n\n【カウンセリング記録】\n";if(counseling)content+=counseling.map(r=>r.summary||r.transcription||"").filter(Boolean).join("\n---\n");if(content.trim().length<20){setSatResult("分析に必要なデータが不足しています");setSatLoading(false);return}const res=await fetch("/api/satisfaction-analysis",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});const data=await res.json();if(data.error)throw new Error(data.error);setSatResult(data.result||"")}catch(e){setSatResult("エラー: "+e.message)}finally{setSatLoading(false)}};
const runKnowledgeBase=async(mode)=>{if(!supabase)return;setKbMode(mode);setKbLoading(true);setKbResult("");setKbModal(true);try{const{data}=await supabase.from("records").select("input_text,output_text,created_at").order("created_at",{ascending:false}).limit(30);if(!data||data.length<3){setKbResult("データが不足しています（最低3件の履歴が必要です）");setKbLoading(false);return}const endpoint=mode==="report"?"/api/quality-report":"/api/knowledge-base";const body=mode==="report"?{records:data}:{records:data,mode};const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await res.json();if(result.error)throw new Error(result.error);setKbResult(result.result||"")}catch(e){setKbResult("エラー: "+e.message)}finally{setKbLoading(false)}};
const runContentCalendar=async()=>{if(!supabase)return;setCalLoading(true);setCalResult("");setCalModal(true);try{const{data}=await supabase.from("records").select("output_text,created_at").order("created_at",{ascending:false}).limit(50);if(!data||data.length<3){setCalResult("データが不足しています（最低3件の履歴が必要です）");setCalLoading(false);return}const now=new Date();const nextMonth=new Date(now.getFullYear(),now.getMonth()+1,1);const month=`${nextMonth.getFullYear()}年${nextMonth.getMonth()+1}月`;const res=await fetch("/api/content-calendar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,month})});const result=await res.json();if(result.error)throw new Error(result.error);setCalResult(result.result||"")}catch(e){setCalResult("エラー: "+e.message)}finally{setCalLoading(false)}};
const runHomepageContent=async(type)=>{if(!supabase)return;setHpType(type);setHpLoading(true);setHpResult("");setHpModal(true);try{const{data}=await supabase.from("records").select("output_text").order("created_at",{ascending:false}).limit(50);if(!data||data.length<3){setHpResult("データが不足しています（最低3件の履歴が必要です）");setHpLoading(false);return}const res=await fetch("/api/homepage-content",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,type})});const result=await res.json();if(result.error)throw new Error(result.error);setHpResult(result.result||"")}catch(e){setHpResult("エラー: "+e.message)}finally{setHpLoading(false)}};
const runTrendReport=async(type)=>{if(!supabase)return;setTrType(type);setTrLoading(true);setTrResult("");setTrModal(true);setTrCount(0);try{const{data}=await supabase.from("records").select("output_text,created_at").order("created_at",{ascending:false}).limit(100);if(!data||data.length<3){setTrResult("データが不足しています（最低3件の履歴が必要です）");setTrLoading(false);return}setTrCount(data.length);const res=await fetch("/api/trend-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,type})});const result=await res.json();if(result.error)throw new Error(result.error);setTrResult(result.result||"")}catch(e){setTrResult("エラー: "+e.message)}finally{setTrLoading(false)}};
const runPatientExperience=async(type)=>{if(!supabase)return;setPxType(type);setPxLoading(true);setPxResult("");setPxModal(true);try{const{data}=await supabase.from("records").select("output_text,input_text,created_at").order("created_at",{ascending:false}).limit(50);if(!data||data.length<3){setPxResult("データが不足しています（最低3件の履歴が必要です）");setPxLoading(false);return}if(type==="patient"){const res=await fetch("/api/trend-report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,type:"patient"})});const result=await res.json();if(result.error)throw new Error(result.error);setPxResult(result.result||"")}else{const res=await fetch("/api/knowledge-base",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:data,mode:"training"})});const result=await res.json();if(result.error)throw new Error(result.error);setPxResult(result.result||"")}}catch(e){setPxResult("エラー: "+e.message)}finally{setPxLoading(false)}};
const audioSaveRef=useRef(false),allAudioChunks=useRef([]);
useEffect(()=>{const effective=sessionAudioSave!==null?sessionAudioSave:audioSave;audioSaveRef.current=effective},[audioSave,sessionAudioSave]);
const saveAudio=async(blob)=>{if(!supabase||!blob||blob.size<1000)return;try{const ts=new Date().toISOString().replace(/[:.]/g,"-");const path=`audio/${rid}/${ts}_${pIdRef.current||"unknown"}.webm`;const{error}=await supabase.storage.from("audio").upload(path,blob,{contentType:"audio/webm"});if(error)console.error("Audio save error:",error);else console.log("Audio saved:",path)}catch(e){console.error("Audio save error:",e)}};
const mR=useRef(null),msR=useRef(null),acR=useRef(null),anR=useRef(null),laR=useRef(null),tR=useRef(null),cR=useRef(null),iR=useRef(""),oR=useRef(""),sumDoneRef=useRef(false);
const pipRef=useRef(null),elRef=useRef(0),lvRef=useRef(0),rsRef=useRef("inactive"),pNameRef=useRef(""),pIdRef=useRef(""),snippetsRef=useRef(DEFAULT_SNIPPETS),pipSnippetsRef=useRef([0,1,2,3,4]);
const tidRef=useRef("soap-std");
useEffect(()=>{iR.current=inp},[inp]);
useEffect(()=>{oR.current=out},[out]);
useEffect(()=>{elRef.current=el},[el]);
useEffect(()=>{lvRef.current=lv},[lv]);
useEffect(()=>{rsRef.current=rs},[rs]);
useEffect(()=>{tidRef.current=tid},[tid]);
useEffect(()=>{pNameRef.current=pName},[pName]);
useEffect(()=>{pIdRef.current=pId},[pId]);
useEffect(()=>{snippetsRef.current=snippets},[snippets]);
useEffect(()=>{shortcutsRef.current=shortcuts},[shortcuts]);
useEffect(()=>{pipSnippetsRef.current=pipSnippets},[pipSnippets]);
useEffect(()=>{if(rs==="recording"){tR.current=setInterval(()=>sEl(t=>t+1),1000)}else{clearInterval(tR.current);if(rs==="inactive")sEl(0)}return()=>clearInterval(tR.current)},[rs]);
useEffect(()=>{let lastSnHash="";const id=setInterval(()=>{if(!pipRef.current)return;const d=pipRef.current;const t=d.getElementById("pip-timer"),l=d.getElementById("pip-level"),s=d.getElementById("pip-status"),tr=d.getElementById("pip-transcript");if(t){const e=elRef.current;t.textContent=`${String(Math.floor(e/60)).padStart(2,"0")}:${String(e%60).padStart(2,"0")}`}if(l)l.style.width=`${lvRef.current}%`;if(s){const r=rsRef.current;s.textContent=r==="recording"?"録音中":r==="paused"?"一時停止":"停止";s.style.color=r==="recording"?C.rG:r==="paused"?C.warn:C.g400}if(tr){const txt=iR.current;if(txt){const lines=txt.split("\n");tr.textContent=lines[lines.length-1]}else{tr.textContent=""}}const c=d.getElementById("pip-snippets");if(c){const sn=snippetsRef.current;const ids=pipSnippetsRef.current;const hash=ids.join(",")+"|"+sn.length;if(hash!==lastSnHash){lastSnHash=hash;let html="";ids.forEach(idx=>{if(idx<sn.length){html+=`<button data-sn-idx="${idx}" style="padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;cursor:pointer">${sn[idx].title}</button>`}});c.innerHTML=html;c.querySelectorAll("button").forEach(b=>{b.onclick=()=>{const idx=parseInt(b.getAttribute("data-sn-idx"));const t2=snippetsRef.current[idx];if(t2)sOut(o=>o+(o?"\n":"")+t2.text)}})}}const soapB2=d.getElementById("pip-tpl-soap");const stdB2=d.getElementById("pip-tpl-std");const minB2=d.getElementById("pip-tpl-min");if(soapB2&&stdB2&&minB2){const cur=tidRef.current;[{btn:soapB2,id:"soap"},{btn:stdB2,id:"soap-std"},{btn:minB2,id:"soap-min"}].forEach(({btn,id})=>{if(cur===id){btn.style.border="2px solid #22c55e";btn.style.background="rgba(34,197,94,.3)";btn.style.fontWeight="700"}else{btn.style.border="1px solid rgba(255,255,255,.4)";btn.style.background="rgba(255,255,255,.15)";btn.style.fontWeight="600"}})}},500);return()=>clearInterval(id)},[]);

const fm=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const ct=T.find(t=>t.id===tid)||T[0],cr=R.find(r=>r.id===rid);

// Supabase
const saveRecord=async(input,output)=>{if(!supabase)return;try{await supabase.from("records").insert({room:rid,template:tid,ai_model:md,input_text:input,output_text:output,patient_name:pNameRef.current,patient_id:pIdRef.current});if(rid==="r7"){await supabase.from("counseling_records").insert({patient_name:pNameRef.current,patient_id:pIdRef.current,transcription:input,summary:output,room:"r7"})}}catch(e){console.error("Save error:",e)}};
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
setProg(50);
const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:sysPrompt,mode:"gemini",prompt:"以下の指示に従って患者向け説明資料を作成してください。"})});const d=await r.json();if(d.error){setDocOut("エラー: "+d.error)}else{setDocOut(d.summary);setGeminiModel(d.model||"")}}catch(e){setDocOut("エラー: "+e.message)}finally{setDocLd(false);setProg(0)}};

const minMR=useRef(null),minSR=useRef(null),minIR=useRef(null),minTI=useRef(null);minIR.current=minInp;
const minGo=async()=>{const s=await sAM();if(!s)return;const mr=new MediaRecorder(s,{mimeType:"audio/webm;codecs=opus"});minMR.current=mr;let ch=[];mr.ondataavailable=e=>{if(e.data.size>0)ch.push(e.data)};mr.onstop=async()=>{if(ch.length>0){const b=new Blob(ch,{type:"audio/webm"});ch=[];if(b.size<500)return;try{const f=new FormData();f.append("audio",b,"audio.webm");const r=await fetch("/api/transcribe",{method:"POST",body:f}),d=await r.json();if(d.text&&d.text.trim()){setMinInp(p=>p+(p?"\n":"")+d.text.trim())}}catch{}}};mr.start();setMinRS("recording");setMinEl(0);const ti=setInterval(()=>{setMinEl(t=>t+1)},1000);const ci=setInterval(()=>{if(minMR.current&&minMR.current.state==="recording"){minMR.current.stop();setTimeout(()=>{if(minMR.current&&minSR.current!=="inactive"){minMR.current.start()}},200)}},10000);minTI.current={ti,ci}};
const minStop=()=>{if(minTI.current){if(minTI.current.ti)clearInterval(minTI.current.ti);if(minTI.current.ci)clearInterval(minTI.current.ci);minTI.current=null}if(minMR.current&&minMR.current.state==="recording")minMR.current.stop();setMinRS("inactive");minSR.current="inactive";xAM()};
const loadMinHist=async()=>{if(!supabase)return;try{const{data}=await supabase.from("minutes").select("*").order("created_at",{ascending:false}).limit(50);if(data)setMinHist(data)}catch{}};
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
try{
const taskPrompt=`以下の皮膚科・美容皮膚科クリニックの議事録からタスクとTODOを抽出してください。

【判断基準】
- 患者対応・医療安全に関するタスク（重要度:高）
- スタッフ教育・採用・労務管理（重要度:中〜高）
- 売上・集患・マーケティング施策（重要度:中〜高）
- 設備・機器の導入・メンテナンス（重要度:中）
- 院内オペレーション改善（重要度:中）
- 法令遵守・届出・保険請求（重要度:高）
- 患者満足度向上・クレーム対応（重要度:高）
- 美容メニュー開発・価格設定（重要度:中）

必ず以下のJSON配列のみを返してください。説明文やマークダウンは不要です。
[{"title":"タスク名","assignee":"","due_date":null,"urgency":2,"importance":2,"category":"operations","role_level":"staff"}]

categoryは: operations(運営), medical(医療), hr(人事), finance(経理)
urgency: 1=低 2=やや低 3=やや高 4=高
importance: 1=低 2=やや低 3=やや高 4=高
role_levelは: director(院長), manager(マネジャー), leader(リーダー), staff(スタッフ)

議事録:
`+minute.output_text;

setProg(15);
setProg(30);
const tr=await fetch("/api/summarize",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({text:taskPrompt,mode:"gemini",prompt:"JSONの配列のみ返してください。他のテキストは一切不要です。"})
});
const td=await tr.json();
setProg(55);

if(td.error){sSt("タスク生成エラー: "+td.error);return}
if(td.summary){
let jsonStr=td.summary;
jsonStr=jsonStr.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
const startIdx=jsonStr.indexOf("[");
const endIdx=jsonStr.lastIndexOf("]");
if(startIdx!==-1&&endIdx!==-1){
jsonStr=jsonStr.substring(startIdx,endIdx+1);
}
try{
const parsed=JSON.parse(jsonStr);
setProg(70);
if(Array.isArray(parsed)&&parsed.length>0){
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
sSt("");setTimeout(()=>{const ok=window.confirm(count+"件のタスクを生成しました！\n\n四象限マトリクスを表示しますか？");if(ok){loadTasks();setPage("tasks");setTaskView("matrix")}},300);
}else{
sSt("タスクが抽出できませんでした");
}
}catch(e){
console.error("JSON parse error:",e,"Raw:",jsonStr);
sSt("タスク生成エラー: JSON解析失敗");
}
}
}catch(e){
console.error("Task gen error:",e);
sSt("タスク生成エラー: "+e.message);
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
const minSum=async()=>{minStop();if(!minIR.current?.trim()){return}setMinLd(true);setProg(10);
const p=minPrompt.trim()||"以下の会議・ミーティングの書き起こしから議事録を作成してください。";
const prompt=`${p}\n\n【書き起こし内容】\n${minIR.current}\n\n以下の構成で簡潔にまとめてください：\n1. 日時・参加者（わかる場合）\n2. 議題・アジェンダ\n3. 決定事項\n4. 各議題の要点\n5. アクションアイテム（担当者・期限）\n6. 次回予定`;
setProg(50);
try{const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:prompt,mode:"gemini",prompt:"議事録を作成してください。"})});if(!r.ok){const errText=await r.text();setMinOut("エラー: HTTP "+r.status+" - "+(errText||"").substring(0,200));return}const d=await r.json();if(d.error){setMinOut("エラー: "+d.error)}else{setMinOut(d.summary);sSt("議事録作成完了 ✓ → 次へで新規打合せ");setGeminiModel(d.model||"");if(supabase&&d.summary){try{const{data:minData}=await supabase.from("minutes").insert({title:minTitle||new Date().toLocaleDateString("ja-JP")+" "+new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+"の議事録",input_text:minIR.current||"",output_text:d.summary}).select().single();if(minData){const taskPrompt=`以下の皮膚科・美容皮膚科クリニックの議事録からタスクとTODOを抽出してください。

【判断基準】
- 患者対応・医療安全に関するタスク（重要度:高）
- スタッフ教育・採用・労務管理（重要度:中〜高）
- 売上・集患・マーケティング施策（重要度:中〜高）
- 設備・機器の導入・メンテナンス（重要度:中）
- 院内オペレーション改善（重要度:中）
- 法令遵守・届出・保険請求（重要度:高）
- 患者満足度向上・クレーム対応（重要度:高）
- 美容メニュー開発・価格設定（重要度:中）

必ず以下のJSON配列のみを返してください。説明文やマークダウンは不要です。
[{"title":"タスク名","assignee":"","due_date":null,"urgency":2,"importance":2,"category":"operations"}]

categoryは: operations(運営), medical(医療), hr(人事), finance(経理)
urgency: 1=低 2=やや低 3=やや高 4=高
importance: 1=低 2=やや低 3=やや高 4=高

議事録:
`+d.summary;const tr2=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:taskPrompt,mode:"gemini",prompt:"JSONの配列のみ返してください。他のテキストは一切不要です。"})});const td=await tr2.json();if(td.summary){let jsonStr2=td.summary;jsonStr2=jsonStr2.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();const si2=jsonStr2.indexOf("[");const ei2=jsonStr2.lastIndexOf("]");if(si2!==-1&&ei2!==-1)jsonStr2=jsonStr2.substring(si2,ei2+1);try{const parsed=JSON.parse(jsonStr2);if(Array.isArray(parsed)){for(const t of parsed){await supabase.from("tasks").insert({title:t.title||"未定",assignee:t.assignee||"",due_date:t.due_date||null,urgency:Math.min(4,Math.max(1,parseInt(t.urgency)||2)),importance:Math.min(4,Math.max(1,parseInt(t.importance)||2)),category:["operations","medical","hr","finance"].includes(t.category)?t.category:"operations",role_level:["director","manager","leader","staff"].includes(t.role_level)?t.role_level:"staff",minute_id:minData.id,done:false})}}}catch(e){console.error("minSum task parse error:",e)}}}}catch{}}}}catch(e){setMinOut("エラー: "+e.message)}finally{setMinLd(false);setProg(0);loadMinHist()}};
const minNext=()=>{minStop();setMinOut("");if(minIR)minIR.current="";setMinEl(0);setMinTitle("");sSt("次の打合せへ ✓")};
useEffect(()=>{minSR.current=minRS},[minRS]);
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

const analyzeCounseling=async()=>{const tx=csTx.trim()||iR.current;if(!tx){setCsOut("分析するテキストがありません。録音→書き起こし後、または直接テキストを入力してください。");return}setCsLd(true);setProg(10);setCsOut("");
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

setProg(50);
try{const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:modes[csMode],mode:"gemini",prompt:"詳細に分析してください。"})});const d=await r.json();setCsOut(d.error?"エラー: "+d.error:d.summary);if(d.model)setGeminiModel(d.model)}catch(e){setCsOut("エラー: "+e.message)}finally{setCsLd(false);setProg(0)}};

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

const loadHist=async()=>{if(!supabase)return;try{const{data}=await supabase.from("records").select("*").order("created_at",{ascending:false}).limit(500);if(data)sHist(data)}catch(e){console.error("Load error:",e)}};
const searchHist=async(query)=>{if(!supabase||!query.trim())return;try{const q=query.trim();const dateMatch=q.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{2}))?$/);if(dateMatch){const month=parseInt(dateMatch[1]);const day=parseInt(dateMatch[2]);const hour=dateMatch[3]?parseInt(dateMatch[3]):null;const year=new Date().getFullYear();const jstStart=hour!==null?new Date(year,month-1,day,hour,0,0):new Date(year,month-1,day,0,0,0);const jstEnd=hour!==null?new Date(year,month-1,day,hour,59,59):new Date(year,month-1,day,23,59,59);const utcStart=new Date(jstStart.getTime()-9*60*60*1000).toISOString();const utcEnd=new Date(jstEnd.getTime()-9*60*60*1000).toISOString();const{data}=await supabase.from("records").select("*").gte("created_at",utcStart).lte("created_at",utcEnd).order("created_at",{ascending:false}).limit(500);if(data)sHist(data)}else{const{data}=await supabase.from("records").select("*").or(`output_text.ilike.%${q}%,input_text.ilike.%${q}%,patient_id.ilike.%${q}%`).order("created_at",{ascending:false}).limit(500);if(data)sHist(data)}}catch(e){console.error("Search error:",e)}};
const delRecord=async(id)=>{if(!supabase)return;try{await supabase.from("records").delete().eq("id",id);sHist(h=>h.filter(r=>r.id!==id))}catch(e){console.error("Delete error:",e)}};
const filteredHist=search?hist.filter(r=>{const s=search.toLowerCase();const dateMatch=s.match(/^(\d{1,2})\/(\d{1,2})/);if(dateMatch){const dateStr=r.created_at?new Date(r.created_at).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"})+" "+new Date(r.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"";return dateStr.startsWith(s)||dateStr.includes(s)}const dateStr2=r.created_at?new Date(r.created_at).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"})+" "+new Date(r.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"";return dateStr2.includes(s)||(r.output_text||"").toLowerCase().includes(s)||(r.input_text||"").toLowerCase().includes(s)||(r.patient_id||"").toLowerCase().includes(s)}):hist;

// Dict
const toKatakana=(s)=>s.replace(/[\u3041-\u3096]/g,c=>String.fromCharCode(c.charCodeAt(0)+96));
const applyDict=(text)=>{if(!dictEnabled||!text)return text;let r=text;for(const[from,to] of dict){if(!from||!to||from===to)continue;if(from.length>=3){try{const kataFrom=toKatakana(from);const hiraFrom=kataFrom.replace(/[\u30A1-\u30F6]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));const escaped=from.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const kataEsc=kataFrom.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const hiraEsc=hiraFrom.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const patterns=[...new Set([escaped,kataEsc,hiraEsc])];const re=new RegExp(patterns.join("|"),"gi");r=r.replace(re,to)}catch{r=r.split(from).join(to)}}else{r=r.split(from).join(to)}}return r};
const saveDictLocal=(d)=>{try{localStorage.setItem("mk_dict",JSON.stringify(d))}catch{}};
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
const runTypoCheck=async()=>{const t=iR.current;if(!t||!t.trim()){sSt("書き起こしテキストがありません");return}setTypoTarget("inp");setTypoLd(true);sSt("🔍 AI校正中...");try{const r=await fetch("/api/fix-typos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t,dictionary:dict.map(([from,to])=>({from,to}))})});if(!r.ok){const errText=await r.text();console.error("AI校正 fetch error:",r.status,errText);sSt("校正エラー: サーバーエラー("+r.status+")");return}const d=await r.json();if(d.error){console.error("AI校正 API error:",d.error);sSt("校正エラー: "+d.error);return}if(!d.corrections||d.corrections.length===0){sSt("✓ 医療用語の誤りは見つかりませんでした");return}const sel={};d.corrections.forEach((c,i)=>{if(c.candidates&&c.candidates.length>0&&c.candidates.length===1)sel[i]=0});setTypoSelections(sel);setTypoCustomInputs({});setTypoModal(d.corrections);sSt("校正候補が見つかりました")}catch(e){console.error("AI校正 error:",e);sSt("校正エラー: "+e.message)}finally{setTypoLd(false)}};
const runTypoCheckOut=async()=>{const t=out;if(!t||!t.trim()){sSt("要約テキストがありません");return}setTypoTarget("out");setTypoLdOut(true);sSt("🔍 要約AI校正中...");try{const r=await fetch("/api/fix-typos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t,dictionary:dict.map(([from,to])=>({from,to}))})});if(!r.ok){const errText=await r.text();console.error("AI校正 fetch error:",r.status,errText);sSt("校正エラー: サーバーエラー("+r.status+")");return}const d=await r.json();if(d.error){console.error("AI校正 API error:",d.error);sSt("校正エラー: "+d.error);return}if(!d.corrections||d.corrections.length===0){sSt("✓ 要約の医療用語の誤りは見つかりませんでした");return}const sel={};d.corrections.forEach((c,i)=>{if(c.candidates&&c.candidates.length>0&&c.candidates.length===1)sel[i]=0});setTypoSelections(sel);setTypoCustomInputs({});setTypoModal(d.corrections);sSt("校正候補が見つかりました")}catch(e){console.error("AI校正 error:",e);sSt("校正エラー: "+e.message)}finally{setTypoLdOut(false)}};
const applyTypoCorrection=(idx,candidateIdx)=>{try{if(!typoModal||!typoModal[idx])return;const c=typoModal[idx];const candidate=c.candidates?.[candidateIdx];if(!candidate){console.error("applyTypoCorrection: invalid candidate",{idx,candidateIdx,c});return}if(typoTarget==="out"){sOut(prev=>prev.split(c.from).join(candidate.to))}else{sInp(prev=>prev.split(c.from).join(candidate.to))}dictAddEntry(c.from,candidate.to)}catch(e){console.error("applyTypoCorrection error:",e)}};
const applyAllTypos=()=>{try{if(!typoModal)return;let t=typoTarget==="out"?out:iR.current;const applied=[];typoModal.forEach((c,i)=>{if(typoCustomInputs[i]?.trim()){const customTo=typoCustomInputs[i].trim();t=t.split(c.from).join(customTo);applied.push([c.from,customTo])}else if(typoSelections[i]!==undefined){const candidate=c.candidates?.[typoSelections[i]];if(candidate){t=t.split(c.from).join(candidate.to);applied.push([c.from,candidate.to])}}});if(typoTarget==="out"){sOut(t)}else{sInp(t)}if(applied.length>0){const newDict=[...applied,...dict];setDict(newDict);saveDictLocal(newDict);applied.forEach(([f,to])=>dictAddSupabase(f,to))}setTypoModal(null);setTypoCustomInputs({});sSt(`✓ ${applied.length}件の修正を登録しました`)}catch(e){console.error("applyAllTypos error:",e);sSt("登録エラー: "+e.message)}};
const runHistTypoCheck=async()=>{const selected=filteredHist.filter(r=>selectedHistIds.has(r.id));if(!selected.length)return;setHistTypoLd(true);setTypoTarget("hist");sSt(`🔬 スキャン中... (${selected.length}件)`);try{const combined=selected.map(r=>[r.input_text||"",r.output_text||""].filter(Boolean).join("\n")).join("\n---\n");const r=await fetch("/api/fix-typos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:combined,dictionary:dict.map(([from,to])=>({from,to}))})});if(!r.ok){sSt("校正エラー: サーバーエラー("+r.status+")");return}const d=await r.json();if(d.error){sSt("校正エラー: "+d.error);return}if(!d.corrections||d.corrections.length===0){sSt("✓ 医療用語の誤りは見つかりませんでした");return}const sel={};d.corrections.forEach((c,i)=>{if(c.candidates&&c.candidates.length===1)sel[i]=0});setTypoSelections(sel);setTypoCustomInputs({});setTypoModal(d.corrections);sSt("校正候補が見つかりました")}catch(e){sSt("校正エラー: "+e.message)}finally{setHistTypoLd(false)}};
const BULK_MODES=[{id:"treatment",label:"🏥 疾患別治療説明・プランまとめ"},{id:"patient",label:"👤 患者説明文の自動生成"},{id:"protocol",label:"📋 治療プロトコル抽出"},{id:"faq",label:"❓ よくある質問FAQ生成"},{id:"training",label:"📚 スタッフ向け研修資料生成"}];
const runBulkAnalyze=async(mode)=>{const selected=filteredHist.filter(r=>selectedHistIds.has(r.id));if(!selected.length)return;setBulkMenu(false);setBulkLd(true);const modeLabel=BULK_MODES.find(m=>m.id===mode)?.label||mode;sSt(`⏳ 分析中... (${selected.length}件)`);try{const records=selected.map(r=>({input_text:r.input_text||"",output_text:r.output_text||""}));const r=await fetch("/api/bulk-analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records,mode})});if(!r.ok){sSt("分析エラー: サーバーエラー("+r.status+")");return}const d=await r.json();if(d.error){sSt("分析エラー: "+d.error);return}setBulkResult({title:modeLabel,content:d.result||""});sSt("分析完了")}catch(e){sSt("分析エラー: "+e.message)}finally{setBulkLd(false)}};

// Audio
const sAM=async()=>{try{const constraints=selectedMic?{audio:{deviceId:{exact:selectedMic}}}:{audio:true};const s=await navigator.mediaDevices.getUserMedia(constraints);msR.current=s;const c=new(window.AudioContext||window.webkitAudioContext)(),sr=c.createMediaStreamSource(s),a=c.createAnalyser();a.fftSize=256;a.smoothingTimeConstant=0.7;sr.connect(a);acR.current=c;anR.current=a;const d=new Uint8Array(a.frequencyBinCount),tk=()=>{if(!anR.current)return;anR.current.getByteFrequencyData(d);let sm=0;for(let i=0;i<d.length;i++)sm+=d[i];sLv(Math.min(100,Math.round((sm/d.length/128)*100)));laR.current=requestAnimationFrame(tk)};laR.current=requestAnimationFrame(tk);return s}catch(e){console.error("Mic error:",e);sSt("マイク取得失敗：ブラウザの許可設定を確認してください");return null}};
const xAM=()=>{if(laR.current)cancelAnimationFrame(laR.current);laR.current=null;if(acR.current){try{acR.current.close()}catch{}}acR.current=null;if(msR.current){msR.current.getTracks().forEach(t=>t.stop())}msR.current=null;anR.current=null;sLv(0)};
const tc=async(b)=>{if(b.size<500)return;if(audioSaveRef.current)allAudioChunks.current.push(b);sPC(p=>p+1);sSt("🔄 書き起こし中...");try{const f=new FormData();f.append("audio",b,"audio.webm");const r=await fetch("/api/transcribe",{method:"POST",body:f}),d=await r.json();if(d.text&&d.text.trim()){const fixed=applyDict(d.text.trim());sInp(p=>p+(p?"\n":"")+fixed);sSt("録音中 ✓")}else{sSt("録音中")}}catch{sSt("録音中（エラー）")}finally{sPC(p=>Math.max(0,p-1))}};
const cMR=(s)=>{const m=new MediaRecorder(s,{mimeType:MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm"});m.ondataavailable=(e)=>{if(e.data.size>0)tc(e.data)};return m};
const go=async()=>{const s=await sAM();if(!s)return;sRS("recording");sSt("録音中");const m=cMR(s);m.start();mR.current=m;cR.current=setInterval(()=>{if(mR.current&&mR.current.state==="recording"){mR.current.stop();const m2=cMR(s);m2.start();mR.current=m2}},5000)};
const stop=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording")mR.current.stop();mR.current=null;xAM();sRS("inactive");sSt("待機中");if(audioSaveRef.current&&allAudioChunks.current.length>0){const blob=new Blob(allAudioChunks.current,{type:"audio/webm"});saveAudio(blob);allAudioChunks.current=[]}};
const pause=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording")mR.current.stop();sRS("paused");sSt("一時停止")};
const resume=()=>{if(!msR.current)return;sRS("recording");sSt("録音中");const m=cMR(msR.current);m.start();mR.current=m;cR.current=setInterval(()=>{if(mR.current&&mR.current.state==="recording"){mR.current.stop();const m2=cMR(msR.current);m2.start();mR.current=m2}},5000)};
const sum=async(tx)=>{if(!tx&&rsRef.current==="recording"){stopSum();return}const t=tx||iR.current;if(!t.trim()){sSt("テキストを入力してください");return}if(t.trim().length<20){sSt("⚠️ 書き起こしが短すぎます。音声入力を確認してください。");return}if(t.replace(/[\s\n]/g,"").length<15){sSt("⚠️ 会話内容が少なすぎます。マイクの位置や音量を確認してください。");return}sumDoneRef.current=false;sLd(true);setProg(10);sSt(summaryModel==="claude"?"Claude Sonnet 4.6 で要約中...":"Gemini で要約中...");try{
let pastExamples="";if(supabase){try{const{data}=await supabase.from("records").select("output_text,template").order("created_at",{ascending:false}).limit(100);if(data){const sameTpl=data.filter(r=>r.template===tid&&r.output_text).slice(0,5);if(sameTpl.length>0){pastExamples="\n\n【当院の過去の要約例（同テンプレート）- この書式・表現を参考にして統一感を出してください】\n"+sameTpl.map((r,i)=>`例${i+1}:\n${r.output_text}`).join("\n---\n")}}
const{data:pastData}=await supabase.from("past_records").select("content").order("created_at",{ascending:false}).limit(30);if(pastData&&pastData.length>0){pastExamples+="\n\n【当院の過去のカルテ記録（参考）- 当院の用語・薬剤名・表現方法を参考にしてください】\n"+pastData.slice(0,10).map(r=>r.content).join("\n---\n")}
}catch(e){console.error("History fetch error:",e)}}
const enhancedPrompt=ct.prompt+pastExamples;
setProg(40);
const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:iR.current,mode:md,prompt:enhancedPrompt,model_preference:summaryModel})});
const d=await r.json();if(d.error){sOut("エラー: "+d.error)}else{sOut(d.summary);if(d.model)setGeminiModel(d.model);setProg(90);sumDoneRef.current=true;await saveRecord(iR.current,d.summary);try{await navigator.clipboard.writeText(d.summary);sSt(`要約完了 ✓ [${d.model||"gemini"}]`)}catch{sSt(`要約完了 [${d.model||"gemini"}]`)}}}catch{sSt("エラーが発生しました")}finally{sLd(false);setProg(0)}};
const stopSum=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording"){const cr2=mR.current;cr2.ondataavailable=async(e)=>{if(e.data.size>0){const f=new FormData();f.append("audio",e.data,"audio.webm");try{const r=await fetch("/api/transcribe",{method:"POST",body:f}),d=await r.json();if(d.text&&d.text.trim()){const ft=iR.current+(iR.current?"\n":"")+applyDict(d.text.trim());sInp(ft);setTimeout(()=>sum(ft),300)}else{sum()}}catch{sum()}}else{sum()}};cr2.stop()}else{sum()}mR.current=null;xAM();sRS("inactive")};
const saveUndo=()=>{undoRef.current={inp:iR.current||"",out:out,pName:pName,pId:pId}};
const undo=()=>{if(!undoRef.current)return;const u=undoRef.current;sInp(u.inp);sOut(u.out);sPName(u.pName);sPId(u.pId);undoRef.current=null;sSt("↩ 元に戻しました")};
const clr=()=>{saveUndo();sInp("");sOut("");sSt("待機中");sEl(0);sPName("");sPId("");try{const dt=localStorage.getItem("mk_defaultTpl");if(dt)sTid(dt)}catch{}};
const cp=async(t)=>{try{await navigator.clipboard.writeText(t);sSt("コピー済み ✓")}catch{}};

// PiP
const openPip=useCallback(async()=>{try{if(!("documentPictureInPicture" in window)){sSt("Chrome 116以降で利用可能です");return}
const pw=await window.documentPictureInPicture.requestWindow({width:270,height:175});
const rm=R.find(r=>r.id===rid);const rmName=rm?`${rm.i}${rm.l}`:"";
pw.document.body.style.margin="0";pw.document.body.style.overflow="hidden";
pw.document.body.innerHTML=`<div style="font-family:sans-serif;background:linear-gradient(135deg,#3d5a1e,#567d2a);color:#fff;padding:5px 8px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:2px">
<div style="display:flex;align-items:center;gap:4px"><span style="font-size:9px;opacity:.5">${rmName}</span>
<input id="pip-pid" placeholder="患者ID" value="" style="flex:1;padding:1px 5px;border-radius:4px;border:none;font-size:9px;background:rgba(255,255,255,.15);color:#fff;outline:none"/>
<span id="pip-status" style="font-size:9px;font-weight:600;color:#94a3b8">停止</span></div>
<div style="display:flex;align-items:center;gap:6px"><div id="pip-timer" style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums">00:00</div>
<div style="flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden"><div id="pip-level" style="width:0%;height:100%;background:#22c55e;border-radius:2px;transition:width 0.15s"></div></div></div>
<div id="pip-transcript" style="height:18px;overflow:hidden;border-radius:4px;background:rgba(0,0,0,.2);padding:1px 6px;font-size:9px;color:#a0c96a;white-space:nowrap;text-overflow:ellipsis"></div>
<div id="pip-tpl" style="display:flex;gap:3px;justify-content:center;margin-bottom:2px">
<button id="pip-tpl-soap" style="padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;font-size:9px;font-weight:600;cursor:pointer">詳細</button>
<button id="pip-tpl-std" style="padding:2px 8px;border-radius:6px;border:2px solid #22c55e;background:rgba(34,197,94,.3);color:#fff;font-size:9px;font-weight:700;cursor:pointer">標準</button>
<button id="pip-tpl-min" style="padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;font-size:9px;font-weight:600;cursor:pointer">簡潔</button>
</div>
<div style="display:flex;gap:4px;justify-content:center">
<button id="pip-rec" style="padding:2px 14px;border-radius:8px;border:2px solid #fff;background:rgba(255,255,255,.15);color:#fff;font-size:13px;font-weight:700;cursor:pointer">開始</button>
<button id="pip-resume" style="padding:3px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(34,197,94,.3);color:#fff;font-size:10px;font-weight:700;cursor:pointer;display:none">▶再開</button>
<button id="pip-pause" style="padding:2px 10px;border-radius:8px;border:none;background:#fbbf24;color:#78350f;font-size:13px;font-weight:700;cursor:pointer;display:none">一時停止</button>
<button id="pip-sum" style="padding:2px 10px;border-radius:8px;border:none;background:#567d2a;color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:none">要約</button>
<button id="pip-stop" style="padding:2px 10px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:none">停止</button>
<button id="pip-next" style="padding:2px 12px;border-radius:8px;border:2px solid #fff;background:rgba(255,255,255,.15);color:#fff;font-size:12px;font-weight:700;cursor:pointer">次へ▶</button></div>
<div id="pip-shortcuts" style="display:flex;gap:3px;flex-wrap:wrap;overflow:hidden;max-height:24px;margin-top:2px;padding-top:2px;border-top:1px solid rgba(255,255,255,.1)"></div>
<div id="pip-snippets" style="display:flex;gap:4px;flex-wrap:wrap;overflow:hidden;max-height:28px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.15)"></div></div>`;
pw.document.head.innerHTML=`<style>::placeholder{color:rgba(255,255,255,.35)}</style>`;
const pipPiEl=pw.document.getElementById("pip-pid");if(pipPiEl){pipPiEl.value=pId;pipPiEl.addEventListener("input",e=>{sPId(e.target.value)})}
const pipBtnUpdate=()=>{const d=pipRef.current;if(!d)return;const r=rsRef.current;const rb=d.getElementById("pip-rec"),pb=d.getElementById("pip-pause"),sb=d.getElementById("pip-stop"),smb=d.getElementById("pip-sum");if(!rb)return;rb.style.display=r==="inactive"?"inline-block":"none";pb.style.display=r!=="inactive"?"inline-block":"none";if(r==="recording"){pb.textContent="一時停止";pb.style.background="#fbbf24";pb.style.color="#78350f"}else if(r==="paused"){pb.textContent="再開";pb.style.background="#22c55e";pb.style.color="#fff"}sb.style.display=r!=="inactive"?"inline-block":"none";smb.style.display=r!=="inactive"?"inline-block":"none";const resumeBtn=d.getElementById("pip-resume");if(resumeBtn){if(r==="recording"){resumeBtn.style.display="none"}else if(iR.current&&iR.current.trim()){resumeBtn.style.display="inline-block"}else{resumeBtn.style.display="none"}}};
const pipTplUpdate=()=>{const d2=pipRef.current;if(!d2)return;const soapB=d2.getElementById("pip-tpl-soap");const stdB=d2.getElementById("pip-tpl-std");const minB=d2.getElementById("pip-tpl-min");if(!soapB||!stdB||!minB)return;const cur=tidRef.current;[{btn:soapB,id:"soap"},{btn:stdB,id:"soap-std"},{btn:minB,id:"soap-min"}].forEach(({btn,id})=>{if(cur===id){btn.style.border="2px solid #22c55e";btn.style.background="rgba(34,197,94,.3)";btn.style.fontWeight="700"}else{btn.style.border="1px solid rgba(255,255,255,.4)";btn.style.background="rgba(255,255,255,.15)";btn.style.fontWeight="600"}})};
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
pw.addEventListener("pagehide",()=>{clearInterval(btnLoop);pipRef.current=null;setPipWin(null);setPipActive(false)});
}catch(e){console.error("PiP error:",e);sSt("小窓を開けませんでした")}
},[rid,pId,pipSnippets,snippets,shortcuts]);
const closePip=useCallback(()=>{try{if(window.documentPictureInPicture&&window.documentPictureInPicture.window){window.documentPictureInPicture.window.close()}}catch(e){console.error("closePip:",e)}pipRef.current=null;setPipWin(null);setPipActive(false)},[]);
startRef.current=go;stopRef.current=stop;sumRef.current=sum;clrRef.current=clr;undoFnRef.current=undo;pipFnRef.current=pipActive?closePip:openPip;

// Helpers
const fmD=(d)=>{const dt=new Date(d);return `${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2,"0")}`};
const tn=(id)=>{const t=T.find(x=>x.id===id);return t?t.name:id};
const rn=(id)=>{const r=R.find(x=>x.id===id);return r?`${r.i}${r.l}`:id};

const titleRow=()=>(<div style={{display:"flex",alignItems:"center",gap:8}}>{logoUrl&&<img src={logoUrl} alt="logo" style={{width:logoSize,height:logoSize,borderRadius:8,objectFit:"contain"}}/>}<span style={{fontWeight:700,fontSize:15,color:C.w}}>南草津皮フ科AIカルテ要約</span></div>);

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
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>

{/* イントロ */}
<div style={{padding:16,borderRadius:14,background:`linear-gradient(135deg,${C.pLL},#f0fdf4)`,border:`2px solid ${C.pL}`,marginBottom:16}}>
<p style={{fontSize:14,color:C.pDD,margin:0,lineHeight:1.7}}>
<strong>南草津皮フ科AIカルテ要約</strong>は、診察中の会話を録音・書き起こし、AIが自動でカルテ形式に要約するアプリです。<br/>
<span style={{fontSize:12,color:C.g500}}>Gemini 2.5 Flash + Whisper で動作しています。</span>
</p></div>

{/* 基本の流れ */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>🎯 基本の使い方（3ステップ）</h3>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr",gap:10}}>

<div style={{padding:14,borderRadius:12,border:`2px solid ${C.p}`,background:"#fff",textAlign:"center"}}>
<div style={{fontSize:32,marginBottom:6}}>🎙️</div>
<div style={{fontSize:13,fontWeight:700,color:C.pDD,marginBottom:4}}>① 録音開始</div>
<div style={{fontSize:12,color:C.g600,lineHeight:1.5}}>録音ボタンを押すか<br/><kbd style={{padding:"1px 6px",borderRadius:4,border:"1px solid #d1d5db",background:"#f3f4f6",fontSize:11}}>↓</kbd> キーを押す<br/>会話がリアルタイムで書き起こされます</div>
</div>

<div style={{padding:14,borderRadius:12,border:`2px solid ${C.p}`,background:"#fff",textAlign:"center"}}>
<div style={{fontSize:32,marginBottom:6}}>⚡</div>
<div style={{fontSize:13,fontWeight:700,color:C.pDD,marginBottom:4}}>② 要約</div>
<div style={{fontSize:12,color:C.g600,lineHeight:1.5}}>要約ボタンか<br/><kbd style={{padding:"1px 6px",borderRadius:4,border:"1px solid #d1d5db",background:"#f3f4f6",fontSize:11}}>↑</kbd> キーを押す<br/>AIがカルテ形式に要約します</div>
</div>

<div style={{padding:14,borderRadius:12,border:`2px solid ${C.p}`,background:"#fff",textAlign:"center"}}>
<div style={{fontSize:32,marginBottom:6}}>📋</div>
<div style={{fontSize:13,fontWeight:700,color:C.pDD,marginBottom:4}}>③ コピー＆次へ</div>
<div style={{fontSize:12,color:C.g600,lineHeight:1.5}}>要約は自動コピーされます<br/><kbd style={{padding:"1px 6px",borderRadius:4,border:"1px solid #d1d5db",background:"#f3f4f6",fontSize:11}}>→</kbd> で次の患者へ<br/>電カルにペーストするだけ</div>
</div>

</div></div>

{/* テンプレート */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>📋 テンプレート一覧</h3>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:8}}>
{[
{icon:"📋",name:"詳細ASOP",desc:"フル情報のカルテ要約。S)O)P)患者情報を詳細に記載。複数疾患も自動分離"},
{icon:"📋",name:"標準ASOP",desc:"要点のみの簡潔なカルテ要約。冗長な表現を避けたシンプルな記載"},
{icon:"📋",name:"簡潔ASOP",desc:"最小限の記載。1疾患3行以内。忙しい時や軽症例に"},
{icon:"🏥",name:"疾患名",desc:"疾患名・部位・重症度・鑑別診断を抽出。俗称は正式名称に変換"},
{icon:"✨",name:"美容",desc:"美容施術の記録。施術名・部位・パラメータ・注意事項をまとめる"},
{icon:"🔧",name:"処置",desc:"処置記録。麻酔・処置内容・検体提出・術後指示を時系列で整理"},
{icon:"🔄",name:"経過",desc:"経過観察。前回比較・治療効果判定（改善/不変/悪化）を明確に"},
{icon:"📝",name:"フリー",desc:"自由形式。テンプレートに縛られず簡潔に要約"}
].map((t,i)=>(<div key={i} style={{padding:10,borderRadius:10,border:`1.5px solid ${C.g200}`,background:"#fff",display:"flex",gap:8,alignItems:"flex-start"}}>
<span style={{fontSize:20}}>{t.icon}</span>
<div><div style={{fontSize:13,fontWeight:700,color:C.pD}}>{t.name}</div>
<div style={{fontSize:11,color:C.g600,lineHeight:1.5}}>{t.desc}</div></div>
</div>))}
</div></div>

{/* キーボードショートカット */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>⌨️ キーボードショートカット</h3>
<div style={{padding:12,borderRadius:12,border:`1.5px solid ${C.g200}`,background:"#fff"}}>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
<tbody>
{[
["↓ ArrowDown","録音開始 / 停止"],
["↑ ArrowUp","要約実行"],
["→ ArrowRight","次の患者（クリア）"],
["F6","小窓（PiP）on/off"],
["Escape","モーダル・ページを閉じる"],
["設定で追加","カスタムショートカット登録可能"]
].map(([key,desc],i)=>(<tr key={i} style={{borderBottom:i<4?`1px solid ${C.g100}`:"none"}}>
<td style={{padding:"8px 10px",fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}><kbd style={{padding:"2px 8px",borderRadius:5,border:"1px solid #d1d5db",background:"#f9fafb",fontSize:11}}>{key}</kbd></td>
<td style={{padding:"8px 10px",color:C.g600}}>{desc}</td>
</tr>))}
</tbody></table>
</div></div>

{/* 小窓モード */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>⭐ 小窓（PiP）モード</h3>
<div style={{padding:14,borderRadius:12,border:`2px solid #fbbf24`,background:"#fffbeb"}}>
<p style={{fontSize:12,color:"#92400e",margin:"0 0 8px 0",lineHeight:1.6}}>
画面右上の <strong>⭐小窓</strong> ボタンまたは <kbd style={{padding:"1px 5px",borderRadius:4,border:"1px solid #d1d5db",background:"#fff",fontSize:11}}>F6</kbd> で起動。<br/>
電子カルテの上に小さなウィンドウが常に表示され、録音・要約・次の患者への切り替えがすべて小窓から操作できます。
</p>
<div style={{fontSize:11,color:"#78350f",lineHeight:1.6}}>
<strong>小窓でできること:</strong> 録音開始/停止、一時停止/再開、要約（自動コピー）、次の患者へ、スニペット追記、カスタムショートカット実行
</div>
</div></div>

{/* その他の機能 */}
<div style={{marginBottom:20}}>
<h3 style={{fontSize:16,fontWeight:700,color:C.pDD,marginBottom:10}}>🧩 その他の機能</h3>
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:8}}>
{[
{icon:"📂",name:"履歴",desc:"過去の要約を一覧・検索。再利用やコピーが可能"},
{icon:"⚙️",name:"設定",desc:"辞書登録・スニペット・ショートカットのカスタマイズ"},
{icon:"📄",name:"資料作成",desc:"疾患名を入力するとAIが患者説明資料を自動生成"},
{icon:"📝",name:"議事録",desc:"会議を録音→議事録を自動作成。タスク抽出も可能"},
{icon:"🧠",name:"分析",desc:"カウンセリング内容をAIが分析・構造化"},
{icon:"✅",name:"タスク",desc:"議事録から自動抽出したタスクを四象限マトリクスで管理"}
].map((t,i)=>(<div key={i} style={{padding:10,borderRadius:10,border:`1.5px solid ${C.g200}`,background:"#fff",display:"flex",gap:8,alignItems:"flex-start"}}>
<span style={{fontSize:18}}>{t.icon}</span>
<div><div style={{fontSize:13,fontWeight:700,color:C.pD}}>{t.name}</div>
<div style={{fontSize:11,color:C.g600,lineHeight:1.4}}>{t.desc}</div></div>
</div>))}
</div></div>

{/* Tips */}
<div style={{padding:14,borderRadius:12,background:"#f0fdf4",border:`1.5px solid ${C.pL}`,marginBottom:20}}>
<h3 style={{fontSize:14,fontWeight:700,color:C.pDD,margin:"0 0 8px 0"}}>💡 コツ</h3>
<div style={{fontSize:12,color:C.g700,lineHeight:1.8}}>
• マイクは患者と医師の間に置くと認識精度が上がります<br/>
• 複数の疾患がある場合、ASOPテンプレートが自動で分けて要約します<br/>
• スニペット（追記ボタン）を活用すると定型文の追加が素早くできます<br/>
• 辞書登録で薬品名や略語の認識精度を向上できます（設定→辞書）<br/>
• 診察室ごとにタブを切り替えると、患者情報が混ざりません
</div></div>

<div style={{textAlign:"center",padding:"10px 0",fontSize:11,color:C.g400}}>
南草津皮フ科AIカルテ要約 v48 — Gemini 2.5 Flash + Whisper
</div>
</div>);

// === ABOUT PAGE ===
if(page==="about")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>ℹ️ 機能紹介</h2><button onClick={()=>{setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<div style={{fontSize:14,color:C.g700,lineHeight:2}}>
<h3 style={{color:C.pD}}>🎙 リアルタイム音声書き起こし</h3><p>OpenAI Whisper APIによる高精度な日本語音声認識。5秒間隔で自動書き起こし。</p>
<h3 style={{color:C.pD}}>🤖 AI要約</h3><p>Gemini 2.5 Flashでカルテ形式に自動要約。複数疾患の自動分離にも対応。</p>
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
<button onClick={()=>{loadFavorites();setPage("favs")}} style={{height:36,padding:"0 14px",borderRadius:8,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:14,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>⭐ お気に入り</button>
<button onClick={()=>setPage("main")} style={{...btn(C.p,C.pDD),height:36,padding:"0 14px",fontSize:14}}>✕ 閉じる</button>
</div>
<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
<button onClick={()=>{const ids=new Set(filteredHist.map(r=>r.id));setSelectedHistIds(ids)}} style={{padding:"3px 10px",borderRadius:7,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>すべて選択</button>
<button onClick={()=>setSelectedHistIds(new Set())} style={{padding:"3px 10px",borderRadius:7,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>選択解除</button>
<span style={{fontSize:11,color:C.pD,fontWeight:600}}>{selectedHistIds.size}件選択中</span>
<button onClick={runHistTypoCheck} disabled={!selectedHistIds.size||histTypoLd} title="選択した履歴のAI誤字スキャン" style={{padding:"3px 10px",borderRadius:7,border:`1px solid ${C.p}44`,background:!selectedHistIds.size||histTypoLd?"#e5e7eb":"#fffbeb",fontSize:11,fontWeight:600,color:!selectedHistIds.size||histTypoLd?C.g400:"#92400e",fontFamily:"inherit",cursor:!selectedHistIds.size||histTypoLd?"default":"pointer"}}>{histTypoLd?`🔬 スキャン中... (${selectedHistIds.size}件)`:"🔬 AI誤字スキャン"}</button>
<div style={{position:"relative"}}><button onClick={()=>setBulkMenu(v=>!v)} disabled={!selectedHistIds.size||bulkLd} title="選択した履歴を一括AI分析" style={{padding:"3px 10px",borderRadius:7,border:`1px solid ${C.p}44`,background:!selectedHistIds.size||bulkLd?"#e5e7eb":"#eff6ff",fontSize:11,fontWeight:600,color:!selectedHistIds.size||bulkLd?C.g400:"#2563eb",fontFamily:"inherit",cursor:!selectedHistIds.size||bulkLd?"default":"pointer"}}>{bulkLd?`⏳ 分析中... (${selectedHistIds.size}件)`:"📊 一括AI分析▼"}</button>
{bulkMenu&&selectedHistIds.size>0&&<div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:C.w,borderRadius:10,border:`1px solid ${C.g200}`,boxShadow:"0 4px 16px rgba(0,0,0,.15)",zIndex:100,minWidth:220,padding:4}}>
{BULK_MODES.map(m=><button key={m.id} onClick={()=>runBulkAnalyze(m.id)} style={{display:"block",width:"100%",padding:"8px 12px",borderRadius:7,border:"none",background:C.w,fontSize:12,fontWeight:600,color:C.g700,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.target.style.background="#eff6ff"} onMouseLeave={e=>e.target.style.background=C.w}>{m.label}</button>)}
</div>}
</div>
<button onClick={()=>setBulkFavModal(true)} disabled={!selectedHistIds.size} title="選択した履歴をお気に入りに一括登録" style={{padding:"3px 10px",borderRadius:7,border:`1px solid #f59e0b`,background:!selectedHistIds.size?"#e5e7eb":"#fffbeb",fontSize:11,fontWeight:600,color:!selectedHistIds.size?C.g400:"#92400e",fontFamily:"inherit",cursor:!selectedHistIds.size?"default":"pointer"}}>⭐ お気に入り一括登録</button>
</div>
{bulkFavModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setBulkFavModal(false)}>
<div style={{background:C.w,borderRadius:14,padding:20,maxWidth:320,width:"100%"}} onClick={e=>e.stopPropagation()}>
<div style={{fontSize:14,fontWeight:700,color:"#92400e",marginBottom:12}}>⭐ {selectedHistIds.size}件を一括登録</div>
{FAV_GROUPS.map(g=><button key={g} onClick={()=>{bulkSaveFavorites(g);setBulkFavModal(false)}} style={{display:"block",width:"100%",padding:"10px 14px",marginBottom:6,borderRadius:10,border:`1.5px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>{g}</button>)}
<button onClick={()=>setBulkFavModal(false)} style={{width:"100%",padding:"8px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer",marginTop:4}}>キャンセル</button>
</div></div>}
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"repeat(3,1fr)",gap:6}}>
{filteredHist.map((r,i)=>{
const date=r.created_at?new Date(r.created_at).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"})+" "+new Date(r.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"";
const preview=(r.output_text||"").replace(/\n/g," ").substring(0,mob?40:30);
const pid=r.patient_id||"";
const lines20=(r.input_text||"").split("\n").length>=20;
const checked=selectedHistIds.has(r.id);
const toggleSel=()=>{setSelectedHistIds(prev=>{const n=new Set(prev);if(n.has(r.id))n.delete(r.id);else n.add(r.id);return n})};
return(<div key={r.id||i} onClick={e=>{if(e.target.tagName==="INPUT"||e.target.tagName==="BUTTON")return;toggleSel()}} style={{padding:mob?"6px 8px":"5px 7px",borderRadius:8,border:checked?`1.5px solid ${C.p}`:`1px solid ${C.g200}`,background:checked?"#f7fee7":C.w,boxShadow:"0 1px 2px rgba(0,0,0,.05)",position:"relative",cursor:"pointer"}}>
{lines20&&<span style={{position:"absolute",top:2,right:2,background:"#7c3aed",color:"#fff",fontSize:9,fontWeight:700,padding:"1px 4px",borderRadius:4,lineHeight:1.3}}>📄20+</span>}
<div style={{display:"flex",gap:4,alignItems:"center",marginBottom:2}}>
<input type="checkbox" checked={checked} onChange={toggleSel} style={{width:14,height:14,accentColor:C.p,cursor:"pointer",flexShrink:0}}/>
<span style={{fontSize:mob?10:11,color:"#111",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{date}{pid?" | "+pid:""}</span>
</div>
<div style={{fontSize:mob?14:13,color:C.g700,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{preview||"（内容なし）"}</div>
<div style={{display:"flex",gap:3}}>
<button onClick={()=>setHistPopup({title:"📝 書き起こし",content:r.input_text||"（書き起こしなし）",date,pid})} title="書き起こし内容を表示" onMouseEnter={e=>showTip(e,"書き起こし内容を表示")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.g50,fontSize:11,fontWeight:600,color:"#2a4a18",fontFamily:"inherit",cursor:"pointer"}}>📝書起</button>
<button onClick={()=>setHistPopup({title:"📋 要約",content:r.output_text||"（要約なし）",date,pid})} title="要約内容を表示" onMouseEnter={e=>showTip(e,"要約内容を表示")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${C.p}`,background:C.pLL,fontSize:11,fontWeight:600,color:"#2a4a18",fontFamily:"inherit",cursor:"pointer"}}>📋要約</button>
<button onClick={()=>{const fullDate=r.created_at?new Date(r.created_at).toLocaleDateString("ja-JP",{year:"numeric",month:"numeric",day:"numeric"})+" "+new Date(r.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"";setFavModal({title:fullDate+(pid?" | ID:"+pid:""),input_text:r.input_text||"",output_text:r.output_text||"",recordId:r.id})}} title="お気に入りに保存" onMouseEnter={e=>showTip(e,"お気に入りに保存")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:6,border:`1px solid #f59e0b`,background:"#fffbeb",fontSize:11,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐</button>
{r.input_text&&<button onClick={()=>runQualityCheck(r)} title="AI対応品質チェック" onMouseEnter={e=>showTip(e,"AI対応品質チェック")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #93c5fd",background:"#eff6ff",fontSize:11,fontWeight:600,color:"#2563eb",fontFamily:"inherit",cursor:"pointer"}}>🔍品質</button>}
</div>
</div>)})}
</div>
{histPopup&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setHistPopup(null)}>
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
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
{/* 品質チェックモーダル */}
{qcModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{if(!qcLoading)setQcModal(null)}}>
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
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
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
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
{/* 履歴用お気に入りグループ選択モーダル */}
{favModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFavModal(null)}>
<div style={{background:"rgba(255,255,255,0.85)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderRadius:14,padding:20,maxWidth:320,width:"100%",border:"1px solid rgba(160,220,100,0.2)"}} onClick={e=>e.stopPropagation()}>
<div style={{fontSize:14,fontWeight:700,color:"#2a5018",marginBottom:4}}>⭐ お気に入りに保存</div>
{favModal.title&&<div style={{fontSize:11,color:C.g400,marginBottom:10}}>{favModal.title}</div>}
{FAV_GROUPS.map(g=><button key={g} onClick={()=>{saveFavoriteSplit(g,favModal.title,favModal.input_text,favModal.output_text,favModal.recordId);setFavModal(null)}} style={{display:"block",width:"100%",padding:"10px 14px",marginBottom:6,borderRadius:10,border:"1px solid rgba(160,220,100,0.2)",background:"rgba(255,255,255,0.7)",fontSize:14,fontWeight:600,color:"#2a5018",fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>{g}</button>)}
<button onClick={()=>setFavModal(null)} style={{width:"100%",padding:"8px",borderRadius:10,border:"1px solid rgba(160,220,100,0.2)",background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer",marginTop:4}}>キャンセル</button>
</div></div>}
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
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
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
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
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
<div style={{background:C.w,borderRadius:14,padding:20,maxWidth:320,width:"100%"}} onClick={e=>e.stopPropagation()}>
<div style={{fontSize:14,fontWeight:700,color:C.pDD,marginBottom:12}}>📁 グループ移動</div>
{FAV_GROUPS.filter(g=>g!==favMoveModal.group_name).map(g=><button key={g} onClick={()=>moveFavorite(favMoveModal.id,g)} style={{display:"block",width:"100%",padding:"8px 12px",marginBottom:6,borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:13,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>{g}</button>)}
<button onClick={()=>setFavMoveModal(null)} style={{width:"100%",padding:"6px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer",marginTop:4}}>キャンセル</button>
</div></div>}
{/* 編集モーダル */}
{favEditModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFavEditModal(null)}>
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:560,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
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
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:640,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
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
{faqModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{if(!faqLoading)setFaqModal(false)}}>
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:640,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:"#7c3aed"}}>❓ FAQ自動生成（{favGroup}）</span>
<button onClick={()=>{if(!faqLoading)setFaqModal(false)}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
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
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:640,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
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
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:640,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
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
<div style={{background:C.w,borderRadius:16,width:"100%",maxWidth:600,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${C.g200}`}}>
<span style={{fontSize:14,fontWeight:700,color:C.pDD}}>{favDetailModal.title}</span>
<button onClick={()=>setFavDetailModal(null)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:700,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>✕</button>
</div>
<div style={{flex:1,overflow:"auto",padding:16}}>
<pre style={{fontSize:12,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.6,fontFamily:"inherit"}}>{favDetailModal.content}</pre>
</div></div></div>}
</div>)}

// === ROLEPLAY ===
if(page==="roleplay")return(<div style={{maxWidth:800,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#dc2626",margin:0}}>🎭 ロールプレイ練習</h2>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
</div>
<div style={card}>
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>疾患名や状況を入力すると、AIが患者との会話練習シナリオと模範応答を生成します。</p>
<div style={{display:"flex",gap:8,marginBottom:12,flexDirection:mob?"column":"row"}}>
<input value={rpInput} onChange={e=>setRpInput(e.target.value)} placeholder="疾患名または状況を入力（例：アトピーの患者が不安を訴えている）" style={{...ib,flex:1,padding:"10px 14px",fontSize:14}}/>
<button onClick={generateRoleplay} disabled={rpLoading||!rpInput.trim()} style={{padding:"10px 20px",borderRadius:14,border:"none",background:rpLoading?C.g200:"linear-gradient(135deg,#dc2626,#ef4444)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!rpInput.trim()?.45:1}}>{rpLoading?"⏳ 生成中...":"🎭 練習問題を生成"}</button>
</div>
<div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
{["アトピー性皮膚炎の患者が治療に不安","ニキビ治療の効果が出ないと訴える患者","帯状疱疹の痛みを訴える高齢患者","美容施術の費用について質問する患者","待ち時間が長いとクレームする患者","薬の副作用を心配する患者"].map(s=>(<button key={s} onClick={()=>setRpInput(s)} style={{padding:"3px 10px",borderRadius:8,border:"1px solid #fca5a5",background:"#fef2f2",fontSize:11,fontWeight:500,color:"#dc2626",fontFamily:"inherit",cursor:"pointer"}}>{s}</button>))}
</div>
{rpLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #dc2626",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIがシナリオを作成中...</span></div>}
{rpResult&&!rpLoading&&<div style={{marginTop:8}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:"#dc2626"}}>🎭 生成結果</span>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>{navigator.clipboard.writeText(rpResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
<button onClick={()=>{saveFavorite("その他","[ロールプレイ] "+rpInput.substring(0,30),rpResult,"")}} style={{padding:"4px 12px",borderRadius:10,border:"1px solid #f59e0b",background:"#fffbeb",fontSize:12,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>💾 お気に入り保存</button>
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
</div>)

// === SNS PAGE ===
if(page==="sns")return(<div style={{maxWidth:800,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#0891b2",margin:0}}>📣 SNS投稿文生成</h2>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
</div>
<div style={card}>
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>季節や疾患テーマを入力すると、各SNSに最適化された投稿文をAIが生成します。</p>
<div style={{marginBottom:12}}>
<label style={{fontSize:12,fontWeight:600,color:C.g600,display:"block",marginBottom:6}}>投稿先</label>
<div style={{display:"flex",gap:6}}>
{["Instagram","X","LINE"].map(p=><button key={p} onClick={()=>setSnsPlatform(p)} style={{padding:"6px 16px",borderRadius:8,border:`1.5px solid ${snsPlatform===p?"#0891b2":C.g200}`,background:snsPlatform===p?"#ecfeff":C.w,fontSize:12,fontWeight:snsPlatform===p?700:500,color:snsPlatform===p?"#0891b2":C.g500,fontFamily:"inherit",cursor:"pointer"}}>{p}</button>)}
</div>
</div>
<div style={{display:"flex",gap:8,marginBottom:12,flexDirection:mob?"column":"row"}}>
<input value={snsInput} onChange={e=>setSnsInput(e.target.value)} placeholder="季節・疾患テーマを入力（例：夏の紫外線対策）" style={{...ib,flex:1,padding:"10px 14px",fontSize:14}}/>
<button onClick={generateSns} disabled={snsLoading||!snsInput.trim()} style={{padding:"10px 20px",borderRadius:14,border:"none",background:snsLoading?C.g200:"linear-gradient(135deg,#0891b2,#06b6d4)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!snsInput.trim()?.45:1}}>{snsLoading?"⏳ 生成中...":"📣 投稿文を生成"}</button>
</div>
<div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
{["夏の紫外線対策","冬の乾燥肌ケア","花粉症シーズンの肌荒れ","ニキビ予防","シミ・そばかす対策","美容施術のご案内","新メニュー紹介","年末年始の診療案内"].map(s=>(<button key={s} onClick={()=>setSnsInput(s)} style={{padding:"3px 10px",borderRadius:8,border:"1px solid #67e8f9",background:"#ecfeff",fontSize:11,fontWeight:500,color:"#0891b2",fontFamily:"inherit",cursor:"pointer"}}>{s}</button>))}
</div>
{snsLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #0891b2",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>投稿文を作成中...</span></div>}
{snsResult&&!snsLoading&&<div style={{marginTop:8}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:"#0891b2"}}>📣 {snsPlatform} 投稿文</span>
<button onClick={()=>{navigator.clipboard.writeText(snsResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:10,border:"1px solid #67e8f9",background:"#ecfeff",fontSize:12,fontWeight:600,color:"#0891b2",fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
</div>
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{snsResult}</pre>
</div>}
</div>
{snsHistory.length>0&&<div style={{marginTop:16}}>
<h3 style={{fontSize:14,fontWeight:700,color:C.g600,marginBottom:8}}>📝 過去の生成履歴</h3>
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
<div style={card}>
<h3 style={{fontSize:16,fontWeight:700,color:"#0891b2",margin:"0 0 8px"}}>📅 来月のSNS投稿カレンダー生成</h3>
<p style={{fontSize:12,color:C.g500,marginBottom:12}}>直近50件の診療記録からトレンドを分析し、Instagram・X・LINEの投稿カレンダーを自動生成します。</p>
<button onClick={runContentCalendar} disabled={calLoading} style={{width:"100%",padding:"12px",borderRadius:14,border:"none",background:calLoading?C.g200:"linear-gradient(135deg,#0891b2,#06b6d4)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:calLoading?"not-allowed":"pointer"}}>{calLoading?"⏳ カレンダー生成中...":"📅 来月のSNS投稿カレンダーを生成"}</button>
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
if(page==="knowledge"){const KB_MODES=[{id:"report",label:"📊 月次品質レポート生成",desc:"直近30件の履歴を分析し品質レポートを作成",color:"#059669",bg:"linear-gradient(135deg,#059669,#10b981)"},{id:"manual",label:"📖 院内マニュアル生成",desc:"疾患別の外用方法・服薬指導・患者説明をまとめる",color:"#2563eb",bg:"linear-gradient(135deg,#2563eb,#3b82f6)"},{id:"library",label:"📚 説明文ライブラリ生成",desc:"疾患別に標準説明文・治療方針・注意点を作成",color:"#7c3aed",bg:"linear-gradient(135deg,#7c3aed,#8b5cf6)"},{id:"training",label:"👥 対応パターン集生成",desc:"新人向けによくある訴えと対応例をまとめる",color:"#dc2626",bg:"linear-gradient(135deg,#dc2626,#ef4444)"}];return(<div style={{maxWidth:800,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>📚 育成・ナレッジベース</h2>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
</div>
<div style={card}>
<p style={{fontSize:13,color:C.g500,marginBottom:16}}>直近30件の診療記録をAIが分析し、スタッフ育成やナレッジ共有に役立つ資料を自動生成します。</p>
<div style={{display:"grid",gap:10,gridTemplateColumns:mob?"1fr":"1fr 1fr"}}>
{KB_MODES.map(m=><button key={m.id} onClick={()=>runKnowledgeBase(m.id)} disabled={kbLoading} style={{padding:"14px 16px",borderRadius:14,border:"none",background:kbLoading?C.g200:m.bg,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:kbLoading?"not-allowed":"pointer",textAlign:"left",transition:"transform 0.15s",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
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
<h3 style={{fontSize:16,fontWeight:700,color:"#2563eb",margin:"0 0 8px"}}>🌐 ホームページコンテンツ生成</h3>
<p style={{fontSize:12,color:C.g500,marginBottom:12}}>直近50件の診療記録を基に、ホームページ掲載用のコンテンツをAIが自動生成します。</p>
<div style={{display:"grid",gap:10,gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr"}}>
<button onClick={()=>runHomepageContent("faq")} disabled={hpLoading} style={{padding:"14px 16px",borderRadius:14,border:"none",background:hpLoading?C.g200:"linear-gradient(135deg,#7c3aed,#8b5cf6)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:hpLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
<div>❓ FAQ生成</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>患者目線のQ&A 15問</div>
</button>
<button onClick={()=>runHomepageContent("factsheet")} disabled={hpLoading} style={{padding:"14px 16px",borderRadius:14,border:"none",background:hpLoading?C.g200:"linear-gradient(135deg,#059669,#10b981)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:hpLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
<div>📄 疾患ファクトシート生成</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>原因・症状・治療・予防</div>
</button>
<button onClick={()=>runHomepageContent("seasonal")} disabled={hpLoading} style={{padding:"14px 16px",borderRadius:14,border:"none",background:hpLoading?C.g200:"linear-gradient(135deg,#e11d48,#f43f5e)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:hpLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
<div>🌸 季節啓発コンテンツ生成</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>季節性疾患トレンド分析</div>
</button>
</div>
</div>
</div>
{hpModal&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>{if(e.target===e.currentTarget)setHpModal(false)}}>
<div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${C.g200}`}}>
<h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#2563eb"}}>{hpType==="faq"?"❓ FAQ（よくある質問）":hpType==="factsheet"?"📄 疾患ファクトシート":"🌸 季節啓発コンテンツ"}</h3>
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
<h3 style={{fontSize:16,fontWeight:700,color:"#e11d48",margin:"0 0 8px"}}>🤝 患者体験改善</h3>
<p style={{fontSize:12,color:C.g500,marginBottom:12}}>直近50件の診療記録から患者体験の改善ポイントをAIが分析します。</p>
<div style={{display:"grid",gap:10,gridTemplateColumns:mob?"1fr":"1fr 1fr"}}>
<button onClick={()=>runPatientExperience("patient")} disabled={pxLoading} style={{padding:"14px 16px",borderRadius:14,border:"none",background:pxLoading?C.g200:"linear-gradient(135deg,#7c3aed,#8b5cf6)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:pxLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
<div>😊 患者ニーズ・不安分析</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>訴えTOP10と満足度向上提案</div>
</button>
<button onClick={()=>runPatientExperience("training")} disabled={pxLoading} style={{padding:"14px 16px",borderRadius:14,border:"none",background:pxLoading?C.g200:"linear-gradient(135deg,#059669,#10b981)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:pxLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
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
</div>)}

// === SATISFACTION ANALYSIS PAGE ===
if(page==="satisfaction")return(<div style={{maxWidth:800,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#c026d3",margin:0}}>📊 患者満足度分析</h2>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button>
</div>
<div style={card}>
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>診療記録とカウンセリング記録（直近30件ずつ）をAIが分析し、患者の関心・不安・改善ポイントを可視化します。</p>
<button onClick={runSatisfactionAnalysis} disabled={satLoading} style={{width:"100%",padding:"12px",borderRadius:14,border:"none",background:satLoading?C.g200:"linear-gradient(135deg,#c026d3,#d946ef)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:satLoading?"not-allowed":"pointer",marginBottom:12}}>{satLoading?"⏳ 分析中...":"📊 満足度分析を実行"}</button>
{satLoading&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:"3px solid #c026d3",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが記録を分析中...</span></div>}
{satResult&&!satLoading&&<div>
<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
<button onClick={()=>{navigator.clipboard.writeText(satResult);sSt("📋 コピーしました")}} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
</div>
<pre style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0,lineHeight:1.7,fontFamily:"inherit",background:C.g50,padding:14,borderRadius:12}}>{satResult}</pre>
</div>}
</div>
<div style={{marginTop:20}}>
<div style={card}>
<h3 style={{fontSize:16,fontWeight:700,color:"#0891b2",margin:"0 0 8px"}}>📈 トレンド・統計レポート</h3>
<p style={{fontSize:12,color:C.g500,marginBottom:12}}>直近100件の診療記録からデータ分析・統計レポートをAIが自動生成します。</p>
<div style={{display:"grid",gap:10,gridTemplateColumns:mob?"1fr":"1fr 1fr"}}>
<button onClick={()=>runTrendReport("trend")} disabled={trLoading} style={{padding:"14px 16px",borderRadius:14,border:"none",background:trLoading?C.g200:"linear-gradient(135deg,#0891b2,#06b6d4)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:trLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
<div>📅 疾患トレンド分析</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>月別・季節別の疾患傾向と予測</div>
</button>
<button onClick={()=>runTrendReport("drugs")} disabled={trLoading} style={{padding:"14px 16px",borderRadius:14,border:"none",background:trLoading?C.g200:"linear-gradient(135deg,#059669,#10b981)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:trLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
<div>💊 処方・処置ランキング</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>薬品・処置TOP10と在庫参考</div>
</button>
<button onClick={()=>runTrendReport("patient")} disabled={trLoading} style={{padding:"14px 16px",borderRadius:14,border:"none",background:trLoading?C.g200:"linear-gradient(135deg,#7c3aed,#8b5cf6)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:trLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
<div>👥 患者ニーズ分析</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>訴え・不安パターンと改善提案</div>
</button>
<button onClick={()=>runTrendReport("summary")} disabled={trLoading} style={{padding:"14px 16px",borderRadius:14,border:"none",background:trLoading?C.g200:"linear-gradient(135deg,#dc2626,#ef4444)",color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:trLoading?"not-allowed":"pointer",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.12)"}}>
<div>📊 経営サマリー</div>
<div style={{fontSize:11,fontWeight:400,opacity:0.9,marginTop:4}}>疾患構成・治療傾向・改善提案</div>
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
</div>)

// === DOC GENERATION ===
if(page==="doc")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{prog>0&&<div style={{width:"100%",height:5,background:"rgba(160,220,100,0.2)",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#3a6820)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>📄 説明資料の作成</h2><span style={{fontSize:10,color:C.g400,fontWeight:500,marginLeft:8}}>{geminiModel||"Gemini 2.5 Flash"}</span><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>疾患名や施術名を入力すると、当院の診療履歴をAIが参照して患者向け説明資料を自動生成します。</p>
<div style={{display:"flex",gap:8,marginBottom:12,flexDirection:mob?"column":"row"}}>
<input value={docDisease} onChange={e=>setDocDisease(e.target.value)} placeholder="疾患名・施術名を入力（例：アトピー性皮膚炎、ポテンツァ）" style={{...ib,flex:1,padding:"10px 14px",fontSize:14}}/>
<button onClick={generateDoc} disabled={docLd||!docDisease.trim()} style={{padding:"10px 20px",borderRadius:14,border:"none",background:docLd?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!docDisease.trim()?.45:1}}>
{docLd?"⏳ 生成中...":"✨ 生成"}</button></div>
<div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
{["アトピー性皮膚炎","ざ瘡（ニキビ）","蕁麻疹","乾癬","帯状疱疹","尋常性疣贅","脂漏性皮膚炎","円形脱毛症","白斑","酒さ","シミ・肝斑","医療脱毛","ポテンツァ","ノーリス（IPL）","ゼオスキン","ピーリング","外用方法の説明","皮膚腫瘍切除術後の注意点","レーザー施術後の注意点","ピーリング後の注意点"].map(d=>(<button key={d} onClick={()=>{setDocDisease(d)}} style={{padding:"3px 10px",borderRadius:8,border:`1px solid ${C.p}44`,background:C.pLL,fontSize:11,fontWeight:500,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>{d}</button>))}
</div>
<textarea value={docFreePrompt} onChange={e=>setDocFreePrompt(e.target.value)} placeholder="追加指示（任意）：例「小児向けに平易な表現で」「治療費の目安欄も追加して」「英語併記で」" rows={2} style={{...ib,width:"100%",padding:"8px 12px",fontSize:13,marginBottom:12,resize:"vertical",boxSizing:"border-box"}}/>
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
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}><h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>📝 議事録まとめ</h2><span style={{fontSize:10,color:C.g400,fontWeight:500,marginLeft:8}}>{geminiModel||"Gemini 2.5 Flash"}</span><button onClick={()=>{minStop();setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
{st&&st!=="待機中"&&<div style={{fontSize:12,color:st.includes("✓")?"#22c55e":st.includes("エラー")?"#ef4444":"#f59e0b",fontWeight:600,marginBottom:8,textAlign:"center",padding:"4px 8px",borderRadius:8,background:st.includes("✓")?"#f0fdf4":st.includes("エラー")?"#fef2f2":"#fffbeb"}}>{st}</div>}
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>会議やミーティングを録音・書き起こしし、AIが議事録を自動作成します。</p>
<input value={minTitle} onChange={e=>setMinTitle(e.target.value)} placeholder="議事録タイトル（例：2月定例ミーティング）" style={{width:"100%",padding:"8px 12px",borderRadius:10,border:`1.5px solid ${C.g200}`,fontSize:14,fontFamily:"inherit",marginBottom:12,boxSizing:"border-box"}}/>
<textarea value={minPrompt} onChange={e=>setMinPrompt(e.target.value)} placeholder="AIへの追加指示（任意）：例「院内勉強会の形式で」「スタッフミーティング用に簡潔に」" rows={2} style={{...ib,width:"100%",padding:"8px 12px",fontSize:13,marginBottom:10,resize:"vertical",boxSizing:"border-box"}}/>
<div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
<span style={{fontSize:24,fontWeight:700,fontVariantNumeric:"tabular-nums",color:C.pD}}>{String(Math.floor(minEl/60)).padStart(2,"0")}:{String(minEl%60).padStart(2,"0")}</span>
{minRS==="inactive"?<div style={{display:"flex",gap:8,alignItems:"center",minHeight:50,flexWrap:"wrap",justifyContent:"center"}}>
<button onClick={minGo} style={{padding:"10px 24px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:120,whiteSpace:"nowrap"}}>🎙 録音開始</button>
{minInp.trim()&&!minOut&&<button onClick={minSum} style={{padding:"10px 20px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:120,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>✨ 要約作成</button>}
<button onClick={minNext} style={{padding:"10px 24px",borderRadius:14,border:"2px solid "+C.p,background:C.w,color:C.pD,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 2px 6px rgba(0,0,0,.12)"}}>次へ ▶</button></div>
:minRS==="paused"?<div style={{display:"flex",gap:8,alignItems:"center",minHeight:50,flexWrap:"wrap",justifyContent:"center"}}>
<button onClick={()=>{minMR.current&&minMR.current.state==="paused"&&minMR.current.resume();setMinRS("recording")}} style={{padding:"10px 20px",borderRadius:14,border:"none",background:C.rG,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:100,whiteSpace:"nowrap"}}>▶ 再開</button>
<button onClick={minSum} style={{padding:"10px 20px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:140,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>✓ 停止して要約</button></div>
:<div style={{display:"flex",gap:8,alignItems:"center",minHeight:50,flexWrap:"wrap",justifyContent:"center"}}>
<button onClick={()=>{if(minMR.current&&minMR.current.state==="recording"){minMR.current.pause();setMinRS("paused")}}} style={{padding:"10px 16px",borderRadius:14,border:"none",background:"#fbbf24",color:"#78350f",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:100,whiteSpace:"nowrap"}}>⏸ 一時停止</button>
<button onClick={minSum} style={{padding:"10px 20px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",minWidth:140,whiteSpace:"nowrap",boxShadow:`0 2px 8px rgba(0,0,0,.15)`}}>✓ 停止して要約</button>
</div>}
<span style={{fontSize:12,color:minRS==="recording"?C.rG:minRS==="paused"?C.warn:C.g400,fontWeight:600}}>{minRS==="recording"?"● 録音中":minRS==="paused"?"⏸ 一時停止中":"停止"}</span></div>
<div style={{marginBottom:12}}>
<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:600,color:C.g500}}>書き起こし（10秒間隔）</span><span style={{fontSize:11,color:C.g400}}>{minInp.length>0?Math.ceil(minInp.length/40)+"行":"未入力"}</span></div>
<textarea value={minInp} onChange={e=>setMinInp(e.target.value)} placeholder="録音開始すると自動で書き起こされます。手動入力も可能です。" style={{width:"100%",height:120,padding:10,borderRadius:12,border:`1px solid ${C.g200}`,background:C.g50,fontSize:13,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/></div>
{minLd&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが議事録を作成中...</span></div>}
{minOut&&<div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>📋 議事録</span>
<button onClick={()=>{navigator.clipboard.writeText(minOut)}} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.p}44`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button></div>
<textarea value={minOut} onChange={e=>setMinOut(e.target.value)} style={{width:"100%",height:300,padding:14,borderRadius:12,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.8,boxSizing:"border-box"}}/>
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
<span style={{fontSize:14,fontWeight:700,color:C.pDD}}>📚 議事録履歴</span>
<div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
{selMinutes.length>0&&<><button onClick={generateTasksFromSelected} style={{padding:"4px 10px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 選択({selMinutes.length})からタスク生成</button>
<button onClick={analyzeSelectedMinutes} disabled={taskAnalLd} style={{padding:"4px 10px",borderRadius:8,border:"none",background:taskAnalLd?C.g200:`linear-gradient(135deg,#7c3aed,#a78bfa)`,color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>{taskAnalLd?"⏳ 分析中...":"📊 時系列分析"}</button>
{selMinutes.length>=2&&<button onClick={mergeSelectedMinutes} disabled={mergeLd} style={{padding:"4px 12px",borderRadius:8,border:"none",background:mergeLd?C.g200:"linear-gradient(135deg,#7c3aed,#6d28d9)",color:C.w,fontSize:11,fontWeight:600,fontFamily:"inherit",cursor:"pointer"}}>{mergeLd?"⏳ まとめ中...":"🔗 選択分をまとめる("+selMinutes.length+"件)"}</button>}
<button onClick={()=>setSelMinutes([])} style={{padding:"4px 8px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:10,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>選択解除</button></>}
<button onClick={loadMinHist} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>🔄 更新</button></div></div>
{mergeLd&&<div style={{textAlign:"center",padding:16}}><div style={{width:28,height:28,border:"3px solid #e5e7eb",borderTop:"3px solid #7c3aed",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 8px"}}/><span style={{color:"#6b7280",fontSize:12}}>AIが議事録をまとめ中...</span></div>}
{minHist.map(m=>{const sel=selMinutes.includes(m.id);return(<div key={m.id} style={{padding:10,borderRadius:10,border:sel?`2px solid ${C.p}`:`1px solid ${C.g200}`,marginBottom:6,background:sel?C.pLL:C.g50}}>
<div onClick={()=>setOpenMinId(openMinId===m.id?null:m.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,cursor:"pointer"}}>
<div style={{display:"flex",alignItems:"center",gap:6}}>
<input type="checkbox" checked={sel} onChange={(e)=>{e.stopPropagation();setSelMinutes(prev=>prev.includes(m.id)?prev.filter(x=>x!==m.id):[...prev,m.id])}} style={{cursor:"pointer",accentColor:C.p}}/>
{(m.title||"").startsWith("【まとめ】")&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:4,background:"#ede9fe",color:"#7c3aed",fontWeight:700,marginRight:2}}>統合</span>}<span style={{fontSize:13,fontWeight:700,color:C.pD}}>{m.title||"無題"}</span>
<span style={{fontSize:10,color:C.g400}}>{openMinId===m.id?"▼":"▶"}</span></div>
<span style={{fontSize:10,color:C.g400}}>{new Date(m.created_at).toLocaleDateString("ja-JP")}</span></div>
{openMinId===m.id?<div style={{marginBottom:4}}>{(()=>{try{const src=JSON.parse(m.input_text);if(src&&src.source_titles){return(<div style={{padding:6,borderRadius:6,background:"#f5f3ff",border:"1px solid #c4b5fd",marginBottom:6,fontSize:11}}>
<span style={{fontWeight:700,color:"#7c3aed"}}>📎 まとめ元:</span>
{src.source_titles.map((s,i)=>(<span key={i} style={{marginLeft:4,padding:"1px 6px",borderRadius:4,background:"#ede9fe",color:"#6d28d9"}}>{s.date} {s.title}</span>))}
</div>)}}catch{}return null})()}<div style={{fontSize:12,color:C.g600,whiteSpace:"pre-wrap",maxHeight:300,overflowY:"auto",marginBottom:4,padding:8,borderRadius:8,background:C.w,border:`1px solid ${C.g200}`}}>{m.output_text||""}</div><button onClick={(e)=>{e.stopPropagation();navigator.clipboard.writeText(m.output_text||"")}} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.p}44`,background:C.w,fontSize:10,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",marginRight:4}}>📋 コピー</button><button onClick={(e)=>{e.stopPropagation();generateTasksFromMinute(m)}} style={{padding:"3px 10px",borderRadius:6,border:`1px solid ${C.p}44`,background:C.w,fontSize:10,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 この議事録からタスク生成</button></div>:<div style={{fontSize:12,color:C.g600,maxHeight:60,overflow:"hidden",marginBottom:4}}>{(m.output_text||"").substring(0,100)}...</div>}
</div>)})}
{taskAnalysis&&<div style={{marginTop:12,padding:12,borderRadius:12,border:`2px solid #a78bfa`,background:"#f5f3ff"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:"#7c3aed"}}>📊 時系列分析結果</span>
<button onClick={()=>navigator.clipboard.writeText(taskAnalysis)} style={{padding:"3px 10px",borderRadius:8,border:`1px solid #a78bfa`,background:C.w,fontSize:11,fontWeight:600,color:"#7c3aed",fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button></div>
<div style={{fontSize:13,color:C.g700,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{taskAnalysis}</div>
</div>}
</div>
</div></div>);

// === COUNSELING ANALYSIS ===
if(page==="counsel")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{prog>0&&<div style={{width:"100%",height:5,background:"rgba(160,220,100,0.2)",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#3a6820)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>🧠 カウンセリング分析</h2><span style={{fontSize:10,color:C.g400,fontWeight:500,marginLeft:8}}>{geminiModel||"Gemini 2.5 Flash"}</span><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>カウンセリング内容をAIが多角的に分析。傾聴力・ニーズ把握・提案力の改善やトークスクリプト提案、年間計画を生成します。<br/><span style={{fontSize:12,color:C.pD,fontWeight:600}}>💬 カウンセリング履歴: {csCount}件保存済み（カウンセリング室の記録を自動蓄積）</span></p>
<div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
{[{k:"full",l:"📊 総合分析"},{k:"listening",l:"👂 傾聴・共感"},{k:"needs",l:"🎯 ニーズ把握"},{k:"marketing",l:"💡 マーケティング"},{k:"plan",l:"📅 年間計画"}].map(m=>(<button key={m.k} onClick={()=>setCsMode(m.k)} style={{padding:"5px 12px",borderRadius:10,border:csMode===m.k?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:csMode===m.k?C.pLL:C.w,fontSize:12,fontWeight:csMode===m.k?700:500,color:csMode===m.k?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{m.l}</button>))}
</div>
<div style={{marginBottom:10}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
<span style={{fontSize:12,fontWeight:600,color:C.g500}}>分析テキスト</span>
<button onClick={()=>setCsTx(iR.current||"")} style={{padding:"3px 10px",borderRadius:8,border:`1px solid ${C.p}44`,background:C.pLL,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 書き起こしから取得</button></div>
<textarea value={csTx} onChange={e=>setCsTx(e.target.value)} placeholder="カウンセリング内容を入力、または「書き起こしから取得」ボタンで取得" style={{width:"100%",height:100,padding:10,borderRadius:10,border:`1px solid ${C.g200}`,fontSize:13,color:C.g700,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/></div>
<button onClick={analyzeCounseling} disabled={csLd} style={{padding:"10px 24px",borderRadius:14,border:"none",background:csLd?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",marginBottom:12,width:"100%"}}>{csLd?"⏳ AI分析中...":"🧠 分析開始"}</button>
{csLd&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが分析中...</span></div>}
{csOut&&<div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>📋 分析結果</span>
<button onClick={()=>navigator.clipboard.writeText(csOut)} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.p}44`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button></div>
<textarea value={csOut} onChange={e=>setCsOut(e.target.value)} style={{width:"100%",height:400,padding:14,borderRadius:12,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.8,boxSizing:"border-box"}}/>
</div>}
</div></div>);

// === TASKS ===
if(page==="tasks")return(<div style={{maxWidth:1200,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{prog>0&&<div style={{width:"100%",height:5,background:"rgba(160,220,100,0.2)",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#3a6820)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#2a5018",margin:0}}>✅ タスク管理</h2>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>{const et=selMatrixDate?tasks.filter(t=>{const m=minHist.find(h=>h.id===t.minute_id);return m?new Date(m.created_at).toLocaleDateString("ja-JP")===selMatrixDate:selMatrixDate==="手動作成"}):tasks;exportToExcel(et,todos,minHist,selMatrixDate?"タスク_"+selMatrixDate:"四象限マトリクス");sSt("✓ Excelを出力しました")}} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:10,fontWeight:600,color:"#16a34a",fontFamily:"inherit",cursor:"pointer"}}>📊 Excel</button>
<button onClick={()=>{const et=selMatrixDate?tasks.filter(t=>{const m=minHist.find(h=>h.id===t.minute_id);return m?new Date(m.created_at).toLocaleDateString("ja-JP")===selMatrixDate:selMatrixDate==="手動作成"}):tasks;exportToPDF(et,todos,minHist,selMatrixDate?"Tasks_"+selMatrixDate:"Task_Matrix");sSt("✓ PDFを出力しました")}} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:10,fontWeight:600,color:"#dc2626",fontFamily:"inherit",cursor:"pointer"}}>📕 PDF</button>
<button onClick={()=>{const et=selMatrixDate?tasks.filter(t=>{const m=minHist.find(h=>h.id===t.minute_id);return m?new Date(m.created_at).toLocaleDateString("ja-JP")===selMatrixDate:selMatrixDate==="手動作成"}):tasks;exportToWord(et,todos,minHist,selMatrixDate?"タスク_"+selMatrixDate:"四象限マトリクス");sSt("✓ Wordを出力しました")}} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:10,fontWeight:600,color:"#2563eb",fontFamily:"inherit",cursor:"pointer"}}>📝 Word</button>
</div>
<span style={{fontSize:10,color:C.g400}}>{geminiModel||"Gemini 2.5 Flash"}</span>
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
{[...new Set(tasks.map(t=>{const m=minHist.find(h=>h.id===t.minute_id);return m?new Date(m.created_at).toLocaleDateString("ja-JP"):"手動作成"}).filter(Boolean))].sort().reverse().map(date=>{
const dateTasks=tasks.filter(t=>{const m=minHist.find(h=>h.id===t.minute_id);return m?new Date(m.created_at).toLocaleDateString("ja-JP")===date:date==="手動作成"});
const doneCount=dateTasks.filter(t=>t.done).length;
const minTitle2=minHist.find(h=>{const d=new Date(h.created_at).toLocaleDateString("ja-JP");return d===date});
return(<div key={date} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:6,border:selMatrixDate===date?"2px solid #0d9488":"1px solid #e5e7eb",background:selMatrixDate===date?"#f0fdfa":"#fff",cursor:"pointer"}} onClick={()=>setSelMatrixDate(selMatrixDate===date?null:date)}>
<span style={{fontSize:12,fontWeight:600,color:"#0d9488",flex:1}}>📅 {date} {minTitle2?" - "+minTitle2.title:""}</span>
<span style={{fontSize:10,color:"#6b7280"}}>{doneCount}/{dateTasks.length}完了</span>
<button onClick={e=>{e.stopPropagation();if(window.confirm(date+"のタスク("+dateTasks.length+"件)を全て削除しますか？")){dateTasks.forEach(t=>supabase.from("tasks").delete().eq("id",t.id));setTimeout(()=>{loadTasks();loadTodos()},500)}}} style={{fontSize:9,color:"#ef4444",background:"none",border:"1px solid #fca5a5",borderRadius:4,padding:"1px 6px",cursor:"pointer"}}>🗑 削除</button>
</div>)})}
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
const filterBase=t=>selRoles.includes(t.role_level||"staff")&&(!selMatrixDate||(()=>{const m=minHist.find(h=>h.id===t.minute_id);return m?new Date(m.created_at).toLocaleDateString("ja-JP")===selMatrixDate:selMatrixDate==="手動作成"})());
const renderTask=(t,fs)=>{const rc=ROLE_COLORS[t.role_level]||ROLE_COLORS.staff;const isOpen=openTaskId===t.id;const taskTodos=todos.filter(td=>td.task_id===t.id);const doneCount=taskTodos.filter(td=>td.done).length;return(<div key={t.id} style={{padding:6,borderRadius:8,background:"#fff",marginBottom:4,fontSize:fs||11,border:"2px solid "+rc.border,cursor:"pointer"}} onClick={()=>setOpenTaskId(isOpen?null:t.id)}>
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
{todoLd&&openTaskId===t.id&&<div style={{textAlign:"center",padding:8}}><span style={{fontSize:11,color:"#6b7280"}}>TODO生成中...</span></div>}
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
{(()=>{const grouped={};tasks.forEach(t=>{const m=minHist.find(x=>x.id===t.minute_id);const dateKey=m?new Date(m.created_at).toLocaleDateString("ja-JP"):"日付なし";if(!grouped[dateKey])grouped[dateKey]=[];grouped[dateKey].push(t)});return Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([date,tks])=>(<div key={date} style={{marginBottom:12}}>
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
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🔊 音声保存</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:8}}>ONにすると診察の音声をSupabase Storageに保存します。カウンセリング分析やトークスクリプト改善に活用できます。</p>
<div style={{display:"flex",alignItems:"center",gap:12}}>
<button onClick={()=>setAudioSave(!audioSave)} style={{padding:"6px 20px",borderRadius:10,border:"none",background:audioSave?C.rG:C.g200,color:audioSave?C.w:C.g500,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>{audioSave?"ON":"OFF"}</button>
<span style={{fontSize:12,color:audioSave?C.rG:C.g400}}>{audioSave?"録音停止時に自動保存されます":"音声は保存されません"}</span>
</div></div>
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🤖 要約AIモデル</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:10}}>要約に使用するAIモデルを選択できます。設定は自動保存されます。</p>
<div style={{display:"flex",gap:12}}>
{[{v:"gemini",label:"Gemini 2.5 Flash（デフォルト）",desc:"高速・無料枠あり"},{v:"claude",label:"Claude Sonnet 4.6",desc:"高精度・日本語に強い"}].map(m=>(
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
<button onClick={()=>{setTplVisible(null);try{localStorage.removeItem("mk_tplVisible")}catch{};sSt("テンプレート表示をリセットしました")}} style={{marginTop:8,padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>🔄 デフォルトに戻す（標準・簡潔のみ）</button>
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
return(<div style={{maxWidth:900,margin:"0 auto",padding:mob?"10px 8px":"20px 16px",minHeight:"100vh",fontFamily:"'Zen Maru Gothic', sans-serif"}}>
{tooltip.visible&&<div style={{position:"fixed",left:tooltip.x,top:tooltip.y,transform:"translate(-50%, -100%)",background:"rgba(42,58,32,0.92)",color:"#e8f5d8",padding:"4px 10px",borderRadius:8,fontSize:12,fontWeight:600,fontFamily:"'Zen Maru Gothic', sans-serif",pointerEvents:"none",zIndex:99999,whiteSpace:"nowrap",boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>{tooltip.text}</div>}
<header style={{background:"linear-gradient(135deg, rgba(200,240,160,0.6), rgba(220,248,180,0.5), rgba(240,252,200,0.45))",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderBottom:"1px solid rgba(160,220,100,0.25)",padding:mob?"12px 16px":"14px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:mob?0:"0 0 24px 24px"}}>
<div style={{display:"flex",alignItems:"center",gap:8}}>{logoUrl?<img src={logoUrl} alt="logo" style={{width:logoSize,height:logoSize,borderRadius:6,objectFit:"contain"}}/>:<span style={{fontSize:18}}>🩺</span>}<span style={{fontWeight:700,fontSize:mob?14:17,color:"#2a5018",letterSpacing:"0.5px"}}>南草津皮フ科AIカルテ要約</span></div>
<div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:10,color:"#3a6820",fontWeight:600,background:"rgba(160,220,100,0.25)",padding:"2px 8px",borderRadius:8}}>{geminiModel||"Gemini 2.5 Flash"}</span>{pc>0&&<span style={{fontSize:12,color:C.warn,fontWeight:600}}>⏳</span>}<span style={{fontSize:11,color:st.includes("✓")?"#3a6820":"#5a8838",fontWeight:st.includes("✓")?600:400}}>{st}</span></div></header>
<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:mob?"nowrap":"wrap",overflowX:mob?"auto":"visible",WebkitOverflowScrolling:"touch",paddingBottom:mob?4:0}}>
{[{p:"hist",i:"📂",t:"履歴",f:()=>{loadHist();setPage("hist")}},{p:"settings",i:"⚙️",t:"設定"},{p:"doc",i:"📄",t:"資料作成"},{p:"minutes",i:"📝",t:"議事録",mh:"tabs_minutes"},{p:"counsel",i:"🧠",t:"分析",mh:"tabs_analysis"},{p:"caselib",i:"📚",t:"症例ライブラリ",mh:"tabs_caselibrary",f:()=>{loadFavorites();setPage("caselib")}},{p:"roleplay",i:"🎭",t:"ロールプレイ",mh:"tabs_roleplay"},{p:"sns",i:"📣",t:"SNS",mh:"tabs_sns"},{p:"satisfaction",i:"📊",t:"満足度分析"},{p:"shortcuts",i:"⌨️",t:"ショートカット"},{p:"tasks",i:"✅",t:"タスク",mh:"tabs_tasks",f:()=>{loadTasks();loadStaff();loadMinHist();loadTodos();setPage("tasks")}},{p:"knowledge",i:"📚",t:"育成・知識",mh:"tabs_knowledge"},{p:"help",i:"❓",t:"ヘルプ"}].filter(m=>!m.mh||!(mob&&mobileHideItems[m.mh])).map(m=>(<button key={m.p} onClick={m.f||(()=>setPage(m.p))} style={{padding:mob?"6px 10px":"7px 12px",borderRadius:12,border:"1px solid #e7e5e4",background:"#ffffff",fontSize:mob?10:11,fontWeight:600,fontFamily:"inherit",cursor:"pointer",color:"#65a30d",display:"flex",alignItems:"center",gap:4,transition:"all 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,.08)",flexShrink:0,whiteSpace:"nowrap"}}><span style={{fontSize:14}}>{m.i}</span>{m.t}</button>))}</div>
<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:mob?"nowrap":"wrap",overflowX:mob?"auto":"visible",WebkitOverflowScrolling:"touch",paddingBottom:mob?4:0}}>{R.map(rm=>(<button key={rm.id} onClick={()=>sRid(rm.id)} style={{padding:"5px 10px",borderRadius:10,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:rid===rm.id?`2px solid ${C.pD}`:`1.5px solid ${C.g200}`,background:rid===rm.id?C.pL:C.w,fontWeight:rid===rm.id?700:500,color:rid===rm.id?C.pDD:C.g500,whiteSpace:"nowrap",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,.08)"}}>{rm.l}</button>))}</div>
<div style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
<span style={{fontSize:10,color:C.g400}}>🎙</span>
<select value={selectedMic} onChange={e=>setSelectedMic(e.target.value)} style={{flex:1,padding:"3px 6px",borderRadius:6,border:`1px solid ${C.g200}`,fontSize:9,color:C.g500,fontFamily:"inherit",background:C.w,maxWidth:200}}>
{micDevices.length===0?<option value="">マイクが見つかりません</option>:micDevices.map((d,i)=>(<option key={d.deviceId} value={d.deviceId}>{d.label||`マイク ${i+1}`}</option>))}
</select>
<button onClick={loadMics} style={{padding:"2px 5px",borderRadius:5,border:`1px solid ${C.g200}`,background:C.w,fontSize:9,cursor:"pointer"}}>🔄</button>
</div>
<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{(()=>{const vis=tplVisible||DEFAULT_VISIBLE_TPLS;const ordered=tplOrder?tplOrder.map(id=>T.find(t=>t.id===id)).filter(Boolean):T;return ordered.filter(t=>vis.includes(t.id))})().map((t,idx)=>(<button key={t.id}
draggable
onDragStart={e=>{setDragTpl(idx);e.dataTransfer.effectAllowed="move"}}
onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move"}}
onDrop={e=>{e.preventDefault();if(dragTpl===null||dragTpl===idx)return;const order=tplOrder?[...tplOrder]:T.map(x=>x.id);const[item]=order.splice(dragTpl,1);order.splice(idx,0,item);setTplOrder(order);setDragTpl(null);try{localStorage.setItem("mk_tplOrder",JSON.stringify(order))}catch{}}}
onDragEnd={()=>setDragTpl(null)}
onClick={()=>sTid(t.id)}
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
<input value={pId} onChange={e=>{sPId(e.target.value);pIdRef.current=e.target.value}} placeholder="患者ID" style={{width:mob?60:80,padding:"6px 8px",borderRadius:8,border:`1.5px solid ${C.g200}`,fontSize:mob?12:13,fontFamily:"inherit",textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}} maxLength={6}/>
<button onClick={()=>{loadHist();setPage("hist")}} title="診療履歴を表示" onMouseEnter={e=>showTip(e,"診療履歴を表示")} onMouseLeave={hideTip} style={{padding:mob?"4px 8px":"6px 12px",borderRadius:8,border:`1.5px solid ${C.g200}`,background:C.w,fontSize:mob?11:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>📂 履歴</button>
<button onClick={()=>setDictModal(true)} title="誤字脱字辞書を管理" onMouseEnter={e=>showTip(e,"誤字脱字辞書を管理")} onMouseLeave={hideTip} style={{padding:mob?"4px 8px":"6px 12px",borderRadius:8,border:`1.5px solid ${C.g200}`,background:C.w,fontSize:mob?11:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.06)",whiteSpace:"nowrap"}}>📖辞書</button>
<button onClick={()=>{loadFavorites();setPage("favs")}} title="お気に入りを表示" onMouseEnter={e=>showTip(e,"お気に入りを表示")} onMouseLeave={hideTip} style={{padding:mob?"4px 8px":"6px 12px",borderRadius:8,border:`1.5px solid ${C.g200}`,background:C.w,fontSize:mob?11:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.06)",whiteSpace:"nowrap"}}>⭐お気に入り</button>
{!(mob&&mobileHideItems.fontsize)&&<div style={{display:"flex",gap:3,marginLeft:"auto"}}>
{[["small","小"],["medium","中"],["large","大"]].map(([v,l])=><button key={v} onClick={()=>setFontSize(v)} title={`文字サイズ: ${l}`} onMouseEnter={e=>showTip(e,`文字サイズ: ${l}`)} onMouseLeave={hideTip} style={{padding:"2px 8px",borderRadius:7,border:"none",background:fontSize===v?"#22c55e":"#d1d5db",color:fontSize===v?"#fff":"#57534e",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 1px 3px rgba(0,0,0,.1)",transition:"all 0.15s"}}>{l}</button>)}
</div>}
</div>
<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:16}}>
{rs!=="inactive"&&<span style={{fontSize:28,fontWeight:700,color:rs==="recording"?C.rG:C.warn,fontVariantNumeric:"tabular-nums"}}>{fm(el)}</span>}
{rs==="recording"&&<div style={{width:"60%",height:6,borderRadius:3,background:C.g200,overflow:"hidden"}}><div style={{width:`${lv}%`,height:"100%",background:`linear-gradient(90deg,${C.rG},${C.p})`,borderRadius:3,transition:"width 0.1s"}}/></div>}
<div style={{display:"flex",gap:12,alignItems:"center",minHeight:mob?80:94}}>
{rs==="inactive"?(<button onClick={go} title="録音開始 / 停止" onMouseEnter={e=>showTip(e,"録音開始 / 停止")} onMouseLeave={hideTip} style={{...rb,width:mob?80:90,height:mob?80:90,background:"linear-gradient(135deg, rgba(140,210,80,0.8), rgba(180,230,100,0.75), rgba(200,240,120,0.7))",color:"#1a3a10",boxShadow:"0 4px 15px rgba(61,90,30,.3), 0 2px 4px rgba(0,0,0,.1)"}}><span style={{fontSize:mob?26:30}}>🎙</span><span style={{fontSize:mob?11:12}}>録音開始</span></button>):(<>
{rs==="recording"?(<button onClick={pause} title="録音開始 / 停止" onMouseEnter={e=>showTip(e,"録音開始 / 停止")} onMouseLeave={hideTip} style={{...rb,width:60,height:60,background:C.warn,color:"#78350f"}}><span style={{fontSize:22}}>⏸</span></button>):(<button onClick={resume} title="録音開始 / 停止" onMouseEnter={e=>showTip(e,"録音開始 / 停止")} onMouseLeave={hideTip} style={{...rb,width:60,height:60,background:C.rG,color:C.w}}><span style={{fontSize:22}}>▶</span></button>)}
<button onClick={stopSum} title="AIで要約する" onMouseEnter={e=>showTip(e,"AIで要約する")} onMouseLeave={hideTip} style={{...rb,width:50,height:50,background:"linear-gradient(135deg, rgba(140,210,80,0.8), rgba(160,220,100,0.75))",color:"#1a3a10",boxShadow:"0 4px 14px rgba(101,163,13,.25)"}}><span style={{fontSize:14,fontWeight:700}}>✓</span><span style={{fontSize:9,fontWeight:700,color:"#1a3a10"}}>要約</span></button>
<button onClick={stop} title="録音開始 / 停止" onMouseEnter={e=>showTip(e,"録音開始 / 停止")} onMouseLeave={hideTip} style={{...rb,width:60,height:60,background:C.err,color:C.w}}><span style={{fontSize:22}}>⏹</span></button></>)}
</div>
{rs==="recording"&&<div style={{fontSize:12,color:C.g400}}>🎙 5秒ごとに自動書き起こし</div>}
<button onClick={()=>setSessionAudioSave(v=>{const next=v===null?!audioSave:!v;return next})} title="録音音声をSupabaseに保存する" onMouseEnter={e=>showTip(e,"録音音声を保存する")} onMouseLeave={hideTip} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${(sessionAudioSave!==null?sessionAudioSave:audioSave)?C.p:C.g200}`,background:(sessionAudioSave!==null?sessionAudioSave:audioSave)?"#f0fdf4":C.g50,fontSize:11,fontWeight:600,color:(sessionAudioSave!==null?sessionAudioSave:audioSave)?"#2a4a18":C.g400,fontFamily:"inherit",cursor:"pointer"}}>🎙️音声保存 {(sessionAudioSave!==null?sessionAudioSave:audioSave)?"ON":"OFF"}</button>
</div>
<div style={{display:"flex",gap:mob?4:8,marginBottom:14,flexWrap:mob?"wrap":"nowrap"}}>
<button onClick={()=>sum()} disabled={ld||!inp.trim()} title="AIで要約する" onMouseEnter={e=>showTip(e,"AIで要約する")} onMouseLeave={hideTip} style={{flex:1,padding:"4px 16px",borderRadius:10,border:"none",background:ld?"rgba(160,220,100,0.2)":"linear-gradient(135deg, rgba(140,210,80,0.8), rgba(180,230,100,0.75), rgba(200,240,120,0.7))",color:"#1a3a10",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!inp.trim()?0.4:1,boxShadow:!ld&&inp.trim()?"0 4px 15px rgba(61,90,30,.3), 0 2px 4px rgba(0,0,0,.1)":"none",transition:"all 0.2s",minWidth:60,whiteSpace:"nowrap",height:mob?44:undefined}}>{ld?"⏳ 処理中...":"⚡ 要約"}</button>
<button onClick={()=>{saveUndo();sInp("");sOut("");sSt("クリアしました")}} title="書き起こし・要約をクリア" onMouseEnter={e=>showTip(e,"書き起こし・要約をクリア")} onMouseLeave={hideTip} style={{padding:"10px 16px",borderRadius:14,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer",minWidth:44,whiteSpace:"nowrap",height:mob?44:undefined}}>🗑</button>
<button onClick={undo} title="要約を元に戻す" onMouseEnter={e=>showTip(e,"要約を元に戻す")} onMouseLeave={hideTip} style={{padding:"10px 14px",borderRadius:14,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer",opacity:undoRef.current?1:.35,minWidth:44,whiteSpace:"nowrap",height:mob?44:undefined}}>↩</button>
<button onClick={clr} title="次の患者へ" onMouseEnter={e=>showTip(e,"次の患者へ")} onMouseLeave={hideTip} style={{padding:"10px 20px",borderRadius:14,border:`2px solid ${C.p}`,background:C.w,fontSize:14,fontWeight:700,color:C.pD,fontFamily:"inherit",cursor:"pointer",minWidth:80,whiteSpace:"nowrap",boxShadow:"0 3px 10px rgba(0,0,0,.15), 0 1px 3px rgba(0,0,0,.1)",height:mob?44:undefined}}>次へ ▶</button></div>
{ld&&<div style={{width:"100%",height:6,borderRadius:3,background:"rgba(160,220,100,0.2)",marginTop:8,marginBottom:8,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#5a9040,#8ac060)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={{display:"flex",gap:12,marginBottom:12,flexDirection:mob?"column":"row"}}>
{/* 左カラム: 書き起こし */}
<div style={{flex:1,minWidth:0}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
<span style={{fontSize:13,fontWeight:700,color:C.pDD}}>📝 書き起こし</span>
<div style={{display:"flex",gap:4,alignItems:"center"}}><button onClick={runTypoCheck} disabled={typoLd} title="AIが書き起こしの医療用語誤字を検出" onMouseEnter={e=>showTip(e,"AIが医療用語の誤字を検出")} onMouseLeave={hideTip} style={{padding:"2px 6px",borderRadius:8,border:`1px solid ${C.p}44`,background:typoLd?"#e5e7eb":"#fffbeb",fontSize:11,fontWeight:600,color:typoLd?C.g400:"#92400e",fontFamily:"inherit",cursor:typoLd?"wait":"pointer"}}>{typoLd?"🔬...":"🔬"}</button>{!mob&&<span style={{fontSize:11,color:C.g400}}>{(iR.current||"").length}文字</span>}</div>
</div>
<textarea value={inp} onChange={e=>{sInp(e.target.value)}} placeholder="録音ボタンで音声を書き起こし、または直接入力..." style={{width:"100%",height:mob?150:200,padding:10,borderRadius:12,border:`1.5px solid ${C.g200}`,background:C.g50,fontSize:15,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/>
</div>
{/* 右カラム: 要約結果 */}
<div style={{flex:1,minWidth:0}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,gap:6}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}>{summaryModel==="claude"?"Claude":"Gemini"} 要約結果</span>
{out&&<div style={{display:"flex",gap:3,whiteSpace:"nowrap",flexWrap:"wrap"}}><button onClick={runTypoCheckOut} disabled={typoLdOut} style={{padding:"2px 6px",borderRadius:8,border:`1px solid ${C.p}44`,background:typoLdOut?"#e5e7eb":"#fffbeb",fontSize:11,fontWeight:600,color:typoLdOut?C.g400:"#92400e",fontFamily:"inherit",cursor:typoLdOut?"wait":"pointer"}}>{typoLdOut?"🔬...":"🔬"}</button><button onClick={()=>cp(out)} style={{padding:"2px 6px",borderRadius:8,border:`1px solid ${C.p}44`,background:C.w,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋</button>
<button onClick={()=>{setFavSaveModal({title:new Date().toLocaleDateString("ja-JP")+(pId?" | "+pId:""),input_text:inp||"",output_text:out||"",recordId:""})}} title="お気に入りに保存" style={{padding:"2px 6px",borderRadius:8,border:"1px solid #f59e0b44",background:"#fffbeb",fontSize:11,fontWeight:600,color:"#92400e",fontFamily:"inherit",cursor:"pointer"}}>⭐</button></div>}
</div>
<textarea value={out} onChange={e=>sOut(e.target.value)} placeholder="要約結果がここに表示されます..." style={{width:"100%",height:mob?150:200,padding:10,borderRadius:12,border:`1.5px solid ${C.g200}`,background:out?"linear-gradient(135deg,#f7fee7,#ecfccb)":C.g50,fontSize:15,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}/>
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
<div style={{background:C.w,borderRadius:16,padding:20,maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
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
{/* AI誤字スキャンモーダル */}
{typoModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setTypoModal(null)}>
<div style={{background:C.w,borderRadius:16,padding:20,maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
<div style={{fontSize:15,fontWeight:700,color:C.pDD}}>🔬 AI誤字スキャン結果（{typoModal.length}件）</div>
<button onClick={()=>setTypoModal(null)} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.g50,fontSize:12,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button>
</div>
{typoModal.map((c,i)=>(<div key={i} style={{marginBottom:14,padding:14,borderRadius:12,border:`1.5px solid ${typoSelections[i]!==undefined?C.p+"66":C.g200}`,background:typoSelections[i]!==undefined?"#f7fee7":C.g50}}>
<div style={{fontSize:13,fontWeight:600,color:"#dc2626",marginBottom:8}}>（誤）{c.from}</div>
<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:typoSelections[i]!==undefined?8:0}}>
{c.candidates.map((cand,j)=>(<button key={j} onClick={()=>{setTypoSelections(prev=>({...prev,[i]:prev[i]===j?undefined:j}));setTypoCustomInputs(prev=>{const n={...prev};delete n[i];return n})}} style={{padding:"6px 14px",borderRadius:10,border:typoSelections[i]===j?`2px solid ${C.rG}`:`1.5px solid ${C.g300}`,background:typoSelections[i]===j?"#dcfce7":C.w,fontSize:13,fontWeight:typoSelections[i]===j?700:500,color:typoSelections[i]===j?"#166534":C.g700,fontFamily:"inherit",cursor:"pointer",transition:"all 0.15s"}}>{cand.to}</button>))}
</div>
<div style={{display:"flex",alignItems:"center",gap:6,marginTop:6}}><span style={{fontSize:11,color:C.g500,whiteSpace:"nowrap"}}>その他：</span><input type="text" value={typoCustomInputs[i]||""} onChange={e=>{const v=e.target.value;setTypoCustomInputs(prev=>({...prev,[i]:v}));if(v)setTypoSelections(prev=>{const n={...prev};delete n[i];return n})}} placeholder="自由に入力..." style={{flex:1,padding:"4px 8px",borderRadius:8,border:`1.5px solid ${typoCustomInputs[i]?.trim()?C.p+"66":C.g300}`,background:typoCustomInputs[i]?.trim()?"#f7fee7":C.w,fontSize:12,fontFamily:"inherit",outline:"none"}}/></div>
{typoSelections[i]!==undefined&&c.candidates[typoSelections[i]]&&<div style={{fontSize:11,color:C.g500,marginTop:6,marginBottom:2,paddingLeft:4}}>💡 {c.candidates[typoSelections[i]].reason}</div>}
{(typoSelections[i]!==undefined||typoCustomInputs[i]?.trim())&&<button onClick={()=>{const cc=typoModal[i];const toVal=typoCustomInputs[i]?.trim()||(typoSelections[i]!==undefined&&cc.candidates[typoSelections[i]]?cc.candidates[typoSelections[i]].to:null);if(toVal){sInp(prev=>prev.split(cc.from).join(toVal));dictAddEntry(cc.from,toVal)}setTypoModal(prev=>{if(!prev)return null;const n=[...prev];n.splice(i,1);if(!n.length)return null;return n});setTypoSelections(prev=>{const ns={};Object.keys(prev).forEach(k=>{const ki=Number(k);if(ki<i)ns[ki]=prev[ki];else if(ki>i)ns[ki-1]=prev[ki]});return ns});setTypoCustomInputs(prev=>{const ns={};Object.keys(prev).forEach(k=>{const ki=Number(k);if(ki<i)ns[ki]=prev[ki];else if(ki>i)ns[ki-1]=prev[ki]});return ns});sSt("✓ 修正+辞書登録しました")}} style={{padding:"4px 14px",borderRadius:8,border:"none",background:C.rG,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",marginTop:6}}>✓ これで登録</button>}
</div>))}
{typoModal.length>1&&<div style={{marginTop:10,display:"flex",gap:8}}>
<button onClick={applyAllTypos} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:C.p,color:C.w,fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>✓ 選択済みをすべて登録（{typoModal.filter((_,i)=>typoSelections[i]!==undefined||typoCustomInputs[i]?.trim()).length}/{typoModal.length}件）</button>
<button onClick={()=>setTypoModal(null)} style={{padding:"10px 16px",borderRadius:10,border:`1px solid ${C.g200}`,background:C.g50,fontSize:13,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>閉じる</button>
</div>}
</div></div>}
</div></div>);}