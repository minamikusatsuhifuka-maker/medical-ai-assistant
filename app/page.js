"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";

// === RESPONSIVE HOOK ===
function useResponsive(){
const[w,setW]=useState(1024);
useEffect(()=>{setW(window.innerWidth);const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h)},[]);
return{isMobile:w<640,isTablet:w>=640&&w<1024,w};
}

// === COLOR THEME (Mint) ===
const C={p:"#84cc16",pD:"#65a30d",pDD:"#3f6212",pL:"#bef264",pLL:"#ecfccb",w:"#ffffff",g50:"#fafaf9",g100:"#f5f5f4",g200:"#e7e5e4",g300:"#d6d3d1",g400:"#a8a29e",g500:"#78716c",g600:"#57534e",g700:"#44403c",g800:"#292524",g900:"#1c1917",err:"#f43f5e",warn:"#f59e0b",rG:"#22c55e",pLL2:"#f7fee7"};

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

【出力フォーマット（厳守）】
# 疾患名
S）主訴内容
O）所見内容
P）計画内容
患者情報）背景やイベント情報

【複数疾患の場合の例】
# 接触性皮膚炎
S）両前腕の痒み
O）紅斑性丘疹を散在性に認める
P）リンデロン-VG軟膏 1日2回
---
# 足白癬
S）足指の間がジュクジュクする
O）第3-4趾間に浸軟・鱗屑
P）ルリコン液 1日1回

【フォーマットの厳密なルール】
- # の後に半角スペース1つ、その後に疾患名のみ
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

【出力フォーマット（厳守）】
# 疾患名
S）主訴（1文）
O）所見（簡潔に）
P）処方・指示

【例】
# アトピー性皮膚炎
S）手足の痒み、夜間増悪
O）四肢に紅斑・丘疹、顔面に赤み
P）ステロイド外用 1日2回、2週後再診
---
# ウイルス性疣贅
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

【出力フォーマット（厳守）】
# 疾患名
S）一言
O）一言
P）処方名のみ

【例】
# 接触性皮膚炎
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
const btn=(bg,c,extra)=>({padding:mob?"5px 10px":"6px 14px",borderRadius:12,border:"none",background:bg,color:c,fontSize:mob?11:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 2px 6px rgba(0,0,0,.15), 0 1px 2px rgba(0,0,0,.1)",transition:"all 0.15s ease",transform:"translateY(0)",...extra});
const ib={padding:mob?"7px 10px":"8px 12px",borderRadius:mob?10:12,border:`1.5px solid ${C.g200}`,fontSize:mob?14:13,fontFamily:"inherit",outline:"none",background:C.w,color:C.g900,transition:"border-color 0.2s",WebkitAppearance:"none"};
const card={borderRadius:20,border:"1px solid #e7e5e4",padding:mob?14:20,background:"linear-gradient(180deg,#ffffff,#fafaf9)",marginBottom:mob?12:16,boxShadow:"0 1px 4px rgba(0,0,0,.03)"};
const rb={borderRadius:"50%",border:"none",fontFamily:"inherit",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,transition:"all 0.2s ease",boxShadow:"0 2px 8px rgba(0,0,0,.08)"};
const[page,setPage]=useState("main"); // main|room|hist|settings|help|about
const[rs,sRS]=useState("inactive"),[inp,sInp]=useState(""),[out,sOut]=useState(""),[st,sSt]=useState("待機中"),[el,sEl]=useState(0),[ld,sLd]=useState(false),[prog,setProg]=useState(0),[lv,sLv]=useState(0),[md,sMd]=useState("gemini"),[geminiModel,setGeminiModel]=useState(""),[pc,sPC]=useState(0),[tid,sTid]=useState("soap"),[rid,sRid]=useState("r1");
const[hist,sHist]=useState([]),[search,setSearch]=useState(""),[pName,sPName]=useState(""),[pId,sPId]=useState(""),[histTab,setHistTab]=useState({});
const[pipWin,setPipWin]=useState(null),[pipActive,setPipActive]=useState(false);
const[dict,setDict]=useState(DEFAULT_DICT),[newFrom,setNewFrom]=useState(""),[newTo,setNewTo]=useState(""),[dictEnabled,setDictEnabled]=useState(true);
const[logoUrl,setLogoUrl]=useState(""),[logoSize,setLogoSize]=useState(32);
const[shortcuts,setShortcuts]=useState(DEFAULT_SHORTCUTS);
useEffect(()=>{try{const l=localStorage.getItem("mk_logo");if(l)setLogoUrl(l);const s=localStorage.getItem("mk_logoSize");if(s)setLogoSize(parseInt(s));const d=localStorage.getItem("mk_dict");if(d)setDict(JSON.parse(d));const sn=localStorage.getItem("mk_snippets");if(sn)setSnippets(JSON.parse(sn));const ps=localStorage.getItem("mk_pipSnippets");if(ps)setPipSnippets(JSON.parse(ps));const as=localStorage.getItem("mk_audioSave");if(as)setAudioSave(as==="1");const de=localStorage.getItem("mk_dictEnabled");if(de)setDictEnabled(de==="1");const sc=localStorage.getItem("mk_shortcuts");if(sc)setShortcuts(JSON.parse(sc))}catch{}},[]);
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
const[snippets,setSnippets]=useState(DEFAULT_SNIPPETS),[newSnTitle,setNewSnTitle]=useState(""),[newSnText,setNewSnText]=useState(""),[pipSnippets,setPipSnippets]=useState([0,1,2,3,4]),[openCats,setOpenCats]=useState([]);
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
useEffect(()=>{
const handler=(e)=>{
if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA"||e.target.tagName==="SELECT")return;
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
const[todos,setTodos]=useState([]);
const[todoLd,setTodoLd]=useState(false);
const[minRS,setMinRS]=useState("inactive"),[minInp,setMinInp]=useState(""),[minOut,setMinOut]=useState(""),[minLd,setMinLd]=useState(false),[minEl,setMinEl]=useState(0),[minPrompt,setMinPrompt]=useState("");
const[audioSave,setAudioSave]=useState(false),[audioChunks,setAudioChunks]=useState([]),[savedMsg,setSavedMsg]=useState("");
const audioSaveRef=useRef(false),allAudioChunks=useRef([]);
useEffect(()=>{audioSaveRef.current=audioSave},[audioSave]);
const saveAudio=async(blob)=>{if(!supabase||!blob||blob.size<1000)return;try{const ts=new Date().toISOString().replace(/[:.]/g,"-");const path=`audio/${rid}/${ts}_${pIdRef.current||"unknown"}.webm`;const{error}=await supabase.storage.from("audio").upload(path,blob,{contentType:"audio/webm"});if(error)console.error("Audio save error:",error);else console.log("Audio saved:",path)}catch(e){console.error("Audio save error:",e)}};
const mR=useRef(null),msR=useRef(null),acR=useRef(null),anR=useRef(null),laR=useRef(null),tR=useRef(null),cR=useRef(null),iR=useRef(""),oR=useRef(""),sumDoneRef=useRef(false);
const pipRef=useRef(null),elRef=useRef(0),lvRef=useRef(0),rsRef=useRef("inactive"),pNameRef=useRef(""),pIdRef=useRef(""),snippetsRef=useRef(DEFAULT_SNIPPETS),pipSnippetsRef=useRef([0,1,2,3,4]);
useEffect(()=>{iR.current=inp},[inp]);
useEffect(()=>{oR.current=out},[out]);
useEffect(()=>{elRef.current=el},[el]);
useEffect(()=>{lvRef.current=lv},[lv]);
useEffect(()=>{rsRef.current=rs},[rs]);
useEffect(()=>{pNameRef.current=pName},[pName]);
useEffect(()=>{pIdRef.current=pId},[pId]);
useEffect(()=>{snippetsRef.current=snippets},[snippets]);
useEffect(()=>{shortcutsRef.current=shortcuts},[shortcuts]);
useEffect(()=>{pipSnippetsRef.current=pipSnippets},[pipSnippets]);
useEffect(()=>{if(rs==="recording"){tR.current=setInterval(()=>sEl(t=>t+1),1000)}else{clearInterval(tR.current);if(rs==="inactive")sEl(0)}return()=>clearInterval(tR.current)},[rs]);
useEffect(()=>{let lastSnHash="";const id=setInterval(()=>{if(!pipRef.current)return;const d=pipRef.current;const t=d.getElementById("pip-timer"),l=d.getElementById("pip-level"),s=d.getElementById("pip-status"),tr=d.getElementById("pip-transcript");if(t){const e=elRef.current;t.textContent=`${String(Math.floor(e/60)).padStart(2,"0")}:${String(e%60).padStart(2,"0")}`}if(l)l.style.width=`${lvRef.current}%`;if(s){const r=rsRef.current;s.textContent=r==="recording"?"録音中":r==="paused"?"一時停止":"停止";s.style.color=r==="recording"?C.rG:r==="paused"?C.warn:C.g400}if(tr){const txt=iR.current;if(txt){const lines=txt.split("\n");tr.textContent=lines[lines.length-1]}else{tr.textContent=""}}const c=d.getElementById("pip-snippets");if(c){const sn=snippetsRef.current;const ids=pipSnippetsRef.current;const hash=ids.join(",")+"|"+sn.length;if(hash!==lastSnHash){lastSnHash=hash;let html="";ids.forEach(idx=>{if(idx<sn.length){html+=`<button data-sn-idx="${idx}" style="padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;cursor:pointer">${sn[idx].title}</button>`}});c.innerHTML=html;c.querySelectorAll("button").forEach(b=>{b.onclick=()=>{const idx=parseInt(b.getAttribute("data-sn-idx"));const t2=snippetsRef.current[idx];if(t2)sOut(o=>o+(o?"\n":"")+t2.text)}})}}},500);return()=>clearInterval(id)},[]);

const fm=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const ct=T.find(t=>t.id===tid)||T[0],cr=R.find(r=>r.id===rid);

// Supabase
const saveRecord=async(input,output)=>{if(!supabase)return;try{await supabase.from("records").insert({room:rid,template:tid,ai_model:md,input_text:input,output_text:output,patient_name:pNameRef.current,patient_id:pIdRef.current});if(rid==="r7"){await supabase.from("counseling_records").insert({patient_name:pNameRef.current,patient_id:pIdRef.current,transcription:input,summary:output,room:"r7"})}}catch(e){console.error("Save error:",e)}};
const generateDoc=async()=>{if(!docDisease.trim())return;setDocLd(true);setProg(10);setDocOut("");try{let histData=[];if(supabase){const{data}=await supabase.from("records").select("output_text").order("created_at",{ascending:false}).limit(200);if(data)histData=data.map(r=>r.output_text).filter(Boolean)}
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
const suggestSnippets=async()=>{if(!supabase)return;setSuggestLd(true);setSuggestedSnippets([]);try{const{data}=await supabase.from("records").select("output_text").order("created_at",{ascending:false}).limit(200);if(!data||data.length<3){setSuggestedSnippets([{title:"履歴不足",text:"要約履歴が少なすぎます。もう少し使ってから再度お試しください。"}]);return}
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

const loadHist=async()=>{if(!supabase)return;try{const{data}=await supabase.from("records").select("*").order("created_at",{ascending:false}).limit(50);if(data)sHist(data)}catch(e){console.error("Load error:",e)}};
const delRecord=async(id)=>{if(!supabase)return;try{await supabase.from("records").delete().eq("id",id);sHist(h=>h.filter(r=>r.id!==id))}catch(e){console.error("Delete error:",e)}};
const filteredHist=hist.filter(h=>{if(!search.trim())return true;const s=search.toLowerCase();return(h.patient_name||"").toLowerCase().includes(s)||(h.patient_id||"").toLowerCase().includes(s)||(h.output_text||"").toLowerCase().includes(s)});

// Dict
const applyDict=(text)=>{if(!dictEnabled||!text)return text;let r=text;for(const[from,to] of dict){if(from&&to&&from!==to){r=r.split(from).join(to)}}return r};

// Audio
const sAM=async()=>{try{const constraints=selectedMic?{audio:{deviceId:{exact:selectedMic}}}:{audio:true};const s=await navigator.mediaDevices.getUserMedia(constraints);msR.current=s;const c=new(window.AudioContext||window.webkitAudioContext)(),sr=c.createMediaStreamSource(s),a=c.createAnalyser();a.fftSize=256;a.smoothingTimeConstant=0.7;sr.connect(a);acR.current=c;anR.current=a;const d=new Uint8Array(a.frequencyBinCount),tk=()=>{if(!anR.current)return;anR.current.getByteFrequencyData(d);let sm=0;for(let i=0;i<d.length;i++)sm+=d[i];sLv(Math.min(100,Math.round((sm/d.length/128)*100)));laR.current=requestAnimationFrame(tk)};laR.current=requestAnimationFrame(tk);return s}catch(e){console.error("Mic error:",e);sSt("マイク取得失敗：ブラウザの許可設定を確認してください");return null}};
const xAM=()=>{if(laR.current)cancelAnimationFrame(laR.current);laR.current=null;if(acR.current){try{acR.current.close()}catch{}}acR.current=null;if(msR.current){msR.current.getTracks().forEach(t=>t.stop())}msR.current=null;anR.current=null;sLv(0)};
const tc=async(b)=>{if(b.size<500)return;if(audioSaveRef.current)allAudioChunks.current.push(b);sPC(p=>p+1);sSt("🔄 書き起こし中...");try{const f=new FormData();f.append("audio",b,"audio.webm");const r=await fetch("/api/transcribe",{method:"POST",body:f}),d=await r.json();if(d.text&&d.text.trim()){const fixed=applyDict(d.text.trim());sInp(p=>p+(p?"\n":"")+fixed);sSt("録音中 ✓")}else{sSt("録音中")}}catch{sSt("録音中（エラー）")}finally{sPC(p=>Math.max(0,p-1))}};
const cMR=(s)=>{const m=new MediaRecorder(s,{mimeType:MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm"});m.ondataavailable=(e)=>{if(e.data.size>0)tc(e.data)};return m};
const go=async()=>{const s=await sAM();if(!s)return;sRS("recording");sSt("録音中");const m=cMR(s);m.start();mR.current=m;cR.current=setInterval(()=>{if(mR.current&&mR.current.state==="recording"){mR.current.stop();const m2=cMR(s);m2.start();mR.current=m2}},5000)};
const stop=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording")mR.current.stop();mR.current=null;xAM();sRS("inactive");sSt("待機中");if(audioSaveRef.current&&allAudioChunks.current.length>0){const blob=new Blob(allAudioChunks.current,{type:"audio/webm"});saveAudio(blob);allAudioChunks.current=[]}};
const pause=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording")mR.current.stop();sRS("paused");sSt("一時停止")};
const resume=()=>{if(!msR.current)return;sRS("recording");sSt("録音中");const m=cMR(msR.current);m.start();mR.current=m;cR.current=setInterval(()=>{if(mR.current&&mR.current.state==="recording"){mR.current.stop();const m2=cMR(msR.current);m2.start();mR.current=m2}},5000)};
const sum=async(tx)=>{const t=tx||iR.current;if(!t.trim()){sSt("テキストを入力してください");return}if(t.trim().length<20){sSt("⚠️ 書き起こしが短すぎます。音声入力を確認してください。");return}if(t.replace(/[\s\n]/g,"").length<15){sSt("⚠️ 会話内容が少なすぎます。マイクの位置や音量を確認してください。");return}sumDoneRef.current=false;sLd(true);setProg(10);sSt("Gemini で要約中...");try{
let pastExamples="";if(supabase){try{const{data}=await supabase.from("records").select("output_text,template").order("created_at",{ascending:false}).limit(100);if(data){const sameTpl=data.filter(r=>r.template===tid&&r.output_text).slice(0,5);if(sameTpl.length>0){pastExamples="\n\n【当院の過去の要約例（同テンプレート）- この書式・表現を参考にして統一感を出してください】\n"+sameTpl.map((r,i)=>`例${i+1}:\n${r.output_text}`).join("\n---\n")}}
const{data:pastData}=await supabase.from("past_records").select("content").order("created_at",{ascending:false}).limit(30);if(pastData&&pastData.length>0){pastExamples+="\n\n【当院の過去のカルテ記録（参考）- 当院の用語・薬剤名・表現方法を参考にしてください】\n"+pastData.slice(0,10).map(r=>r.content).join("\n---\n")}
}catch(e){console.error("History fetch error:",e)}}
const enhancedPrompt=ct.prompt+pastExamples;
setProg(40);
const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:iR.current,mode:md,prompt:enhancedPrompt})});
const d=await r.json();if(d.error){sOut("エラー: "+d.error)}else{sOut(d.summary);if(d.model)setGeminiModel(d.model);setProg(90);sumDoneRef.current=true;await saveRecord(iR.current,d.summary);try{await navigator.clipboard.writeText(d.summary);sSt(`要約完了 ✓ [${d.model||"gemini"}]`)}catch{sSt(`要約完了 [${d.model||"gemini"}]`)}}}catch{sSt("エラーが発生しました")}finally{sLd(false);setProg(0)}};
const stopSum=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording"){const cr2=mR.current;cr2.ondataavailable=async(e)=>{if(e.data.size>0){const f=new FormData();f.append("audio",e.data,"audio.webm");try{const r=await fetch("/api/transcribe",{method:"POST",body:f}),d=await r.json();if(d.text&&d.text.trim()){const ft=iR.current+(iR.current?"\n":"")+applyDict(d.text.trim());sInp(ft);setTimeout(()=>sum(ft),300)}else{sum()}}catch{sum()}}else{sum()}};cr2.stop()}else{sum()}mR.current=null;xAM();sRS("inactive")};
const saveUndo=()=>{undoRef.current={inp:iR.current||"",out:out,pName:pName,pId:pId}};
const undo=()=>{if(!undoRef.current)return;const u=undoRef.current;sInp(u.inp);sOut(u.out);sPName(u.pName);sPId(u.pId);undoRef.current=null;sSt("↩ 元に戻しました")};
const clr=()=>{saveUndo();sInp("");sOut("");sSt("待機中");sEl(0);sPName("");sPId("")};
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
pw.document.getElementById("pip-rec").onclick=()=>{if(iR.current&&iR.current.trim()){const d=pipRef.current;if(d){try{const old=d.getElementById("pip-alert");if(old)old.remove()}catch{}const div=d.createElement("div");div.id="pip-alert";div.style.cssText="position:fixed;top:6px;left:50%;transform:translateX(-50%);width:90%;background:#f59e0b;color:#fff;padding:8px 12px;border-radius:10px;font-size:12px;font-weight:700;z-index:9999;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)";div.textContent="⚠️ 前のカルテが残っています → 次へで消去";d.body.appendChild(div)}return}go();setTimeout(pipBtnUpdate,500)};
pw.document.getElementById("pip-pause").onclick=()=>{if(rsRef.current==="recording"){pause()}else{resume()}setTimeout(pipBtnUpdate,300)};
pw.document.getElementById("pip-resume").onclick=()=>{go();setTimeout(pipBtnUpdate,500)};
pw.document.getElementById("pip-stop").onclick=()=>{stop();setTimeout(pipBtnUpdate,300)};
pw.document.getElementById("pip-sum").onclick=()=>{const d=pipRef.current;if(!d)return;sumDoneRef.current=false;try{const old=d.getElementById("pip-alert");if(old)old.remove();const oldBar=d.getElementById("pip-progress");if(oldBar)oldBar.remove()}catch{};const bar=d.createElement("div");bar.id="pip-progress";bar.style.cssText="position:fixed;top:0;left:0;width:100%;height:5px;z-index:9999;background:#e7e5e4";const inner=d.createElement("div");inner.style.cssText="height:100%;width:5%;background:linear-gradient(90deg,#84cc16,#22c55e);border-radius:2px;transition:width 0.3s ease";bar.appendChild(inner);d.body.appendChild(bar);const loading=d.createElement("div");loading.id="pip-loading";loading.style.cssText="position:fixed;top:4px;right:4px;width:auto;max-width:60%;background:#f59e0b;color:#fff;padding:6px 10px;border-radius:10px;font-size:10px;font-weight:700;z-index:9999;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)";loading.textContent="⏳ 要約中...";d.body.appendChild(loading);stopSum();setTimeout(pipBtnUpdate,500);let pct=5;const progI=setInterval(()=>{if(sumDoneRef.current){pct=100;inner.style.width="100%";clearInterval(progI)}else if(pct<90){pct+=2;inner.style.width=pct+"%"}},300);const checkDone=setInterval(()=>{if(sumDoneRef.current){clearInterval(checkDone);clearInterval(progI);inner.style.width="100%";try{const ld=d.getElementById("pip-loading");if(ld)ld.remove()}catch{};setTimeout(()=>{try{bar.remove()}catch{};const outputText=oR.current||"";try{const old2=d.getElementById("pip-alert");if(old2)old2.remove()}catch{};const alertDiv=d.createElement("div");alertDiv.id="pip-alert";alertDiv.style.cssText="position:fixed;top:4px;right:4px;width:auto;max-width:60%;background:#22c55e;color:#fff;padding:6px 10px;border-radius:10px;font-size:10px;font-weight:700;z-index:9999;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:4px";const msg=d.createElement("div");msg.textContent="✅ 要約完了";alertDiv.appendChild(msg);if(outputText.trim()){const copyBtn=d.createElement("button");copyBtn.textContent="📋 タップしてコピー";copyBtn.style.cssText="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.2);color:#fff;font-size:10px;font-weight:700;cursor:pointer";copyBtn.onclick=()=>{const ta=document.createElement('textarea');ta.value=outputText;ta.style.cssText='position:fixed;left:-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);copyBtn.textContent='✅ コピー済み';copyBtn.style.background='rgba(255,255,255,.4)';setTimeout(()=>{try{const alert=d.getElementById("pip-alert");if(alert)alert.remove()}catch{}},1500)};alertDiv.appendChild(copyBtn)}d.body.appendChild(alertDiv)},1000)}},500)};
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
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:mob?16:18,fontWeight:700,color:"#3f6212",margin:0}}>⌨️ ショートカット一覧</h2><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<p style={{fontSize:mob?12:13,color:C.g500,marginBottom:16}}>キーボードショートカットで素早く操作できます。⭐マークのショートカットはトップ画面に表示されます。</p>
<div style={{display:"flex",flexDirection:"column",gap:6}}>
{shortcuts.map((sc,i)=>(<div key={sc.id} style={{display:"flex",alignItems:"center",gap:8,padding:mob?"8px 10px":"10px 14px",borderRadius:12,background:sc.enabled?C.g50:"#fafafa",border:`1px solid ${sc.enabled?C.g200:"#eee"}`,opacity:sc.enabled?1:0.5}}>
<button onClick={()=>{const u=[...shortcuts];u[i]={...u[i],showOnTop:!u[i].showOnTop};setShortcuts(u)}} style={{padding:"2px 6px",borderRadius:6,border:sc.showOnTop?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:sc.showOnTop?C.pLL:C.w,fontSize:11,color:sc.showOnTop?C.pD:C.g400,fontFamily:"inherit",cursor:"pointer",flexShrink:0}} title="トップ画面に表示">{sc.showOnTop?"⭐":"☆"}</button>
<span style={{flex:1,fontSize:mob?13:14,fontWeight:600,color:C.g700}}>{sc.label}</span>
<span style={{padding:"4px 12px",borderRadius:8,background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:mob?11:12,fontWeight:700,fontFamily:"monospace",letterSpacing:0.5,minWidth:50,textAlign:"center"}}>{sc.key}</span>
<button onClick={()=>{const u=[...shortcuts];u[i]={...u[i],enabled:!u[i].enabled};setShortcuts(u)}} style={{padding:"4px 10px",borderRadius:8,border:"none",background:sc.enabled?C.rG:C.g200,color:sc.enabled?C.w:C.g500,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>{sc.enabled?"ON":"OFF"}</button>
</div>))}
</div>
<div style={{marginTop:16,padding:12,borderRadius:10,background:C.pLL,border:`1px solid ${C.p}33`}}>
<div style={{fontSize:12,fontWeight:700,color:C.pD,marginBottom:6}}>💡 ヒント</div>
<div style={{fontSize:12,color:C.g500,lineHeight:1.8}}>
・⭐をクリックするとトップ画面にショートカットバーが表示されます<br/>
・ON/OFFでショートカットの有効/無効を切り替えられます<br/>
・設定画面でキーの割り当てを変更できます<br/>
・小窓（PiP）にも⭐のショートカットが表示されます
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
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:"#3f6212",margin:0}}>ℹ️ 機能紹介</h2><button onClick={()=>{setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
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
if(page==="hist")return(<div style={{maxWidth:900,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#3f6212",margin:0}}>📂 診療履歴</h2>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 患者名・ID・内容で検索..." style={{...ib,width:"100%",marginBottom:12,padding:"10px 14px",boxSizing:"border-box"}}/>
{filteredHist.length===0?<p style={{color:C.g400,textAlign:"center",padding:40}}>該当する履歴がありません</p>:
filteredHist.map(h=>(<div key={h.id} style={{...card,marginBottom:10,padding:16,borderLeft:`3px solid ${C.p}`}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
<span style={{fontSize:12,color:C.g500,fontWeight:500}}>{fmD(h.created_at)}</span>
{(h.patient_name||h.patient_id)&&<span style={{fontSize:12,padding:"2px 8px",borderRadius:8,background:"#fef3c7",color:"#92400e",fontWeight:600}}>{h.patient_name||""}{h.patient_id?` (${h.patient_id})`:""}</span>}
<span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:C.pLL,color:C.pD,fontWeight:600}}>{rn(h.room)}</span>
<span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:"#f0fdf4",color:C.rG,fontWeight:600}}>{tn(h.template)}</span></div>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>{sInp(h.input_text);sOut(h.output_text);sPName(h.patient_name||"");sPId(h.patient_id||"");setPage("main")}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>📂 開く</button>
<button onClick={()=>cp(h.output_text)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>📋</button>
<button onClick={()=>delRecord(h.id)} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #fecaca",background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer",color:C.err}}>🗑</button></div></div>
<div style={{display:"flex",gap:4,marginBottom:4}}>
<button onClick={()=>setHistTab(p=>({...p,[h.id]:"summary"}))} style={{padding:"2px 8px",borderRadius:6,border:(histTab[h.id]||"summary")==="summary"?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:(histTab[h.id]||"summary")==="summary"?C.pLL:C.w,fontSize:10,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 要約</button>
<button onClick={()=>setHistTab(p=>({...p,[h.id]:"transcript"}))} style={{padding:"2px 8px",borderRadius:6,border:histTab[h.id]==="transcript"?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:histTab[h.id]==="transcript"?C.pLL:C.w,fontSize:10,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>🎙 書き起こし</button>
<button onClick={()=>{const text=(histTab[h.id]||"summary")==="summary"?h.output_text:h.input_text;if(text)navigator.clipboard.writeText(text);sSt("コピーしました ✓")}} style={{padding:"2px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.w,fontSize:10,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",marginLeft:"auto"}}>📋 コピー</button></div>
{(histTab[h.id]||"summary")==="summary"
?<div style={{fontSize:13,color:C.g700,whiteSpace:"pre-wrap",lineHeight:1.6,maxHeight:80,overflow:"hidden"}}>{h.output_text||"要約なし"}</div>
:<div style={{fontSize:13,color:C.g600,whiteSpace:"pre-wrap",lineHeight:1.6,background:C.g50,padding:10,borderRadius:10,maxHeight:80,overflow:"hidden"}}>{h.input_text||"書き起こしデータなし"}</div>
}</div>))}
</div>);

// === DOC GENERATION ===
if(page==="doc")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
{prog>0&&<div style={{width:"100%",height:5,background:"#e7e5e4",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#84cc16,#22c55e)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:"#3f6212",margin:0}}>📄 説明資料の作成</h2><span style={{fontSize:10,color:C.g400,fontWeight:500,marginLeft:8}}>{geminiModel||"Gemini 2.5 Flash"}</span><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
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
{prog>0&&<div style={{width:"100%",height:5,background:"#e7e5e4",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#84cc16,#22c55e)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}><h2 style={{fontSize:18,fontWeight:700,color:"#3f6212",margin:0}}>📝 議事録まとめ</h2><span style={{fontSize:10,color:C.g400,fontWeight:500,marginLeft:8}}>{geminiModel||"Gemini 2.5 Flash"}</span><button onClick={()=>{minStop();setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
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
{prog>0&&<div style={{width:"100%",height:5,background:"#e7e5e4",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#84cc16,#22c55e)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
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
{prog>0&&<div style={{width:"100%",height:5,background:"#e7e5e4",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#84cc16,#22c55e)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:"#3f6212",margin:0}}>🧠 カウンセリング分析</h2><span style={{fontSize:10,color:C.g400,fontWeight:500,marginLeft:8}}>{geminiModel||"Gemini 2.5 Flash"}</span><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
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
{prog>0&&<div style={{width:"100%",height:5,background:"#e7e5e4",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#84cc16,#22c55e)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
<h2 style={{fontSize:18,fontWeight:700,color:"#3f6212",margin:0}}>✅ タスク管理</h2>
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
<div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:8}}>
{[{label:"🔴 緊急×重要",filter:t=>t.urgency>=3&&t.importance>=3,bg:"#fef2f2",border:"#fca5a5"},
{label:"🟡 非緊急×重要",filter:t=>t.urgency<3&&t.importance>=3,bg:"#fffbeb",border:"#fcd34d"},
{label:"🟠 緊急×非重要",filter:t=>t.urgency>=3&&t.importance<3,bg:"#fff7ed",border:"#fdba74"},
{label:"🟢 非緊急×非重要",filter:t=>t.urgency<3&&t.importance<3,bg:"#f0fdf4",border:"#86efac"}
].map((q,qi)=>(<div key={qi} style={{padding:10,borderRadius:12,border:`2px solid ${q.border}`,background:q.bg,minHeight:120}}>
<div style={{fontSize:12,fontWeight:700,marginBottom:6}}>{q.label}</div>
{tasks.filter(t=>q.filter(t)&&selRoles.includes(t.role_level||"staff")&&(!selMatrixDate||(()=>{const m=minHist.find(h=>h.id===t.minute_id);return m?new Date(m.created_at).toLocaleDateString("ja-JP")===selMatrixDate:selMatrixDate==="手動作成"})())).map(t=>{
const rc=ROLE_COLORS[t.role_level]||ROLE_COLORS.staff;
const isOpen=openTaskId===t.id;
const taskTodos=todos.filter(td=>td.task_id===t.id);
const doneCount=taskTodos.filter(td=>td.done).length;
return(<div key={t.id} style={{padding:6,borderRadius:8,background:"#fff",marginBottom:4,fontSize:11,border:"2px solid "+rc.border,cursor:"pointer"}} onClick={()=>setOpenTaskId(isOpen?null:t.id)}>
<div style={{display:"flex",alignItems:"center",gap:4}}>
<input type="checkbox" checked={t.done} onChange={e=>{e.stopPropagation();toggleTask(t.id,t.done)}} style={{cursor:"pointer"}}/>
<span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:rc.bg,color:rc.text,fontWeight:700}}>{rc.label.split(" ")[1]}</span>
<span style={{textDecoration:t.done?"line-through":"none",flex:1,fontWeight:600}}>{t.title}</span>
<button onClick={e=>{e.stopPropagation();deleteTask(t.id)}} style={{fontSize:9,color:"#ef4444",background:"none",border:"none",cursor:"pointer",padding:"2px"}}>✕</button>
</div>
<div style={{display:"flex",gap:6,marginTop:2,fontSize:10,color:"#6b7280"}}>
<span>👤 {t.assignee||"未定"}</span>
<span>📅 {t.due_date||"未定"}</span>
{taskTodos.length>0&&<span>📝 {doneCount}/{taskTodos.length}</span>}
<span style={{fontSize:10}}>{isOpen?"▼":"▶"}</span>
</div>
{isOpen&&<div onClick={e=>e.stopPropagation()} style={{marginTop:6,padding:6,background:"#f9fafb",borderRadius:6,border:"1px solid #e5e7eb"}}>
<div style={{display:"flex",gap:4,marginBottom:4}}>
<select value={t.assignee||""} onChange={e=>updateTask(t.id,"assignee",e.target.value)} style={{fontSize:9,padding:"1px 4px",borderRadius:4,border:"1px solid #d1d5db"}}>
<option value="">担当未定</option>{staffList.map(s=>(<option key={s.id} value={s.name}>{s.name}</option>))}
</select>
<input type="date" value={t.due_date||""} onChange={e=>updateTask(t.id,"due_date",e.target.value)} style={{fontSize:9,padding:"1px 4px",borderRadius:4,border:"1px solid #d1d5db"}}/>
</div>
{taskTodos.length===0?<button onClick={()=>generateTodosForTask(t)} style={{padding:"4px 12px",borderRadius:6,border:"none",background:C.p,color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}}>🔄 TODO自動生成</button>
:<div>{taskTodos.map(td=>(<div key={td.id} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 0",borderBottom:"1px solid #f3f4f6"}}>
<input type="checkbox" checked={td.done} onChange={()=>toggleTodo(td.id,td.done)} style={{cursor:"pointer"}}/>
<span style={{flex:1,fontSize:11,textDecoration:td.done?"line-through":"none"}}>{td.title}</span>
<select value={td.assignee||""} onChange={e=>updateTodo(td.id,"assignee",e.target.value)} style={{fontSize:9,padding:"1px 3px",borderRadius:3,border:"1px solid #d1d5db"}}>
<option value="">担当</option>
{staffList.map(s=>(<option key={s.id} value={s.name}>{s.name}</option>))}
</select>
<input type="date" value={td.due_date||""} onChange={e=>updateTodo(td.id,"due_date",e.target.value)} style={{fontSize:9,padding:"1px 3px",borderRadius:3,border:"1px solid #d1d5db",width:90}}/>
<button onClick={()=>deleteTodo(td.id)} style={{fontSize:9,color:"#ef4444",background:"none",border:"none",cursor:"pointer"}}>✕</button>
</div>))}</div>}
{todoLd&&openTaskId===t.id&&<div style={{textAlign:"center",padding:8}}><span style={{fontSize:11,color:"#6b7280"}}>TODO生成中...</span></div>}
</div>}
</div>)})}
</div>))}
</div>
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
<h2 style={{fontSize:18,fontWeight:700,color:"#3f6212",margin:0}}>⚙️ 設定</h2>
<div style={{display:"flex",gap:8,alignItems:"center"}}>
{savedMsg&&<span style={{fontSize:12,color:C.rG,fontWeight:600}}>{savedMsg}</span>}
<button onClick={()=>{try{localStorage.setItem("mk_logo",logoUrl);localStorage.setItem("mk_logoSize",String(logoSize));localStorage.setItem("mk_dict",JSON.stringify(dict));localStorage.setItem("mk_snippets",JSON.stringify(snippets));localStorage.setItem("mk_pipSnippets",JSON.stringify(pipSnippets));localStorage.setItem("mk_audioSave",audioSave?"1":"0");localStorage.setItem("mk_dictEnabled",dictEnabled?"1":"0");localStorage.setItem("mk_shortcuts",JSON.stringify(shortcuts));setSavedMsg("✓ 保存しました");setTimeout(()=>setSavedMsg(""),3000)}catch(e){setSavedMsg("保存エラー")}}} style={{padding:"8px 20px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:`0 2px 8px rgba(0,0,0,.1)`}}>💾 保存</button>
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
<h3 style={{fontSize:mob?14:15,fontWeight:700,color:C.pDD,marginBottom:8}}>⌨️ ショートカットキー設定</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:10}}>各機能のキー割り当てを変更できます。⭐=トップ画面＋小窓に表示</p>
<div style={{display:"flex",flexDirection:"column",gap:4}}>
{shortcuts.map((sc,i)=>(<div key={sc.id} style={{display:"flex",gap:6,alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${C.g100}`}}>
<button onClick={()=>{const u=[...shortcuts];u[i]={...u[i],showOnTop:!u[i].showOnTop};setShortcuts(u)}} style={{padding:"2px 5px",borderRadius:6,border:sc.showOnTop?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:sc.showOnTop?C.pLL:C.w,fontSize:9,color:sc.showOnTop?C.pD:C.g400,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>{sc.showOnTop?"⭐":"☆"}</button>
<span style={{width:mob?100:140,fontSize:12,fontWeight:600,color:C.g700,flexShrink:0}}>{sc.label}</span>
<input value={sc.key} readOnly onKeyDown={e=>{e.preventDefault();let k="";if(e.ctrlKey)k+="Ctrl+";if(e.altKey)k+="Alt+";if(e.shiftKey)k+="Shift+";if(e.metaKey)k+="Cmd+";const key=e.key;if(!["Control","Alt","Shift","Meta"].includes(key)){k+=key.length===1?key.toUpperCase():key;const u=[...shortcuts];u[i]={...u[i],key:k};setShortcuts(u)}}} style={{width:80,padding:"3px 8px",borderRadius:8,border:`1.5px solid ${C.p}`,fontSize:12,fontFamily:"monospace",fontWeight:700,color:C.pD,background:C.pLL,textAlign:"center",outline:"none",cursor:"pointer"}} placeholder="キーを押す"/>
<button onClick={()=>{const u=[...shortcuts];u[i]={...u[i],enabled:!u[i].enabled};setShortcuts(u)}} style={{padding:"3px 10px",borderRadius:6,border:"none",background:sc.enabled?C.rG:C.g200,color:sc.enabled?C.w:C.g500,fontSize:10,fontWeight:700,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>{sc.enabled?"ON":"OFF"}</button>
</div>))}
</div>
<div style={{display:"flex",gap:8,marginTop:8}}>
<button onClick={()=>setShortcuts(DEFAULT_SHORTCUTS)} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>初期値に戻す</button>
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
<button onClick={()=>{if(newFrom.trim()&&newTo.trim()){setDict([[newFrom.trim(),newTo.trim()],...dict]);setNewFrom("");setNewTo("")}}} style={btn(C.p,C.pDD,{padding:"6px 14px",fontSize:13})}>追加</button></div>
<div style={{maxHeight:400,overflow:"auto"}}>
{dict.map((d,i)=>(<div key={i} style={{display:"flex",gap:6,alignItems:"center",padding:"4px 0",borderBottom:`1px solid ${C.g100}`}}>
<span style={{flex:1,fontSize:12,color:C.g500}}>{d[0]}</span>
<span style={{color:C.g400,fontSize:11}}>→</span>
<span style={{flex:1,fontSize:12,color:C.g900,fontWeight:600}}>{d[1]}</span>
<button onClick={()=>setDict(dict.filter((_,j)=>j!==i))} style={{padding:"2px 8px",borderRadius:6,border:"1px solid #fecaca",background:C.w,fontSize:10,color:C.err,fontFamily:"inherit",cursor:"pointer"}}>✕</button></div>))}</div></div>
</div>);

// === MAIN ===
return(<div style={{maxWidth:900,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<header style={{background:"linear-gradient(135deg,#3f6212,#65a30d,#84cc16)",padding:mob?"12px 16px":"14px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:mob?0:"0 0 24px 24px",boxShadow:"0 4px 20px rgba(101,163,13,.2)"}}>
<div style={{display:"flex",alignItems:"center",gap:8}}>{logoUrl?<img src={logoUrl} alt="logo" style={{width:logoSize,height:logoSize,borderRadius:6,objectFit:"contain"}}/>:<span style={{fontSize:18}}>🩺</span>}<span style={{fontWeight:700,fontSize:mob?14:17,color:C.w,letterSpacing:"0.5px"}}>南草津皮フ科AIカルテ要約</span></div>
<div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:10,color:"#86efac",fontWeight:600,background:"rgba(255,255,255,.1)",padding:"2px 8px",borderRadius:8}}>{geminiModel||"Gemini 2.5 Flash"}</span>{pc>0&&<span style={{fontSize:12,color:C.warn,fontWeight:600}}>⏳</span>}<span style={{fontSize:11,color:st.includes("✓")?"#86efac":"rgba(255,255,255,.7)",fontWeight:st.includes("✓")?600:400}}>{st}</span></div></header>
{prog>0&&<div style={{width:"100%",height:5,background:"#e7e5e4",borderRadius:3,marginBottom:10,overflow:"hidden"}}><div style={{width:`${prog}%`,height:"100%",background:"linear-gradient(90deg,#84cc16,#22c55e)",borderRadius:3,transition:"width 0.4s ease"}}/></div>}
<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:mob?"nowrap":"wrap",overflowX:mob?"auto":"visible",WebkitOverflowScrolling:"touch",paddingBottom:mob?4:0}}>
{[{p:"hist",i:"📂",t:"履歴",f:()=>{loadHist();setPage("hist")}},{p:"settings",i:"⚙️",t:"設定"},{p:"doc",i:"📄",t:"資料作成"},{p:"minutes",i:"📝",t:"議事録"},{p:"counsel",i:"🧠",t:"分析"},{p:"shortcuts",i:"⌨️",t:"ショートカット"},{p:"tasks",i:"✅",t:"タスク",f:()=>{loadTasks();loadStaff();loadMinHist();loadTodos();setPage("tasks")}},{p:"help",i:"❓",t:"ヘルプ"}].map(m=>(<button key={m.p} onClick={m.f||(()=>setPage(m.p))} style={{padding:mob?"6px 10px":"7px 12px",borderRadius:12,border:"1px solid #e7e5e4",background:"#ffffff",fontSize:mob?10:11,fontWeight:600,fontFamily:"inherit",cursor:"pointer",color:"#65a30d",display:"flex",alignItems:"center",gap:4,transition:"all 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,.08)",flexShrink:0,whiteSpace:"nowrap"}}><span style={{fontSize:14}}>{m.i}</span>{m.t}</button>))}</div>
<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:mob?"nowrap":"wrap",overflowX:mob?"auto":"visible",WebkitOverflowScrolling:"touch",paddingBottom:mob?4:0}}>{R.map(rm=>(<button key={rm.id} onClick={()=>sRid(rm.id)} style={{padding:"5px 10px",borderRadius:10,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:rid===rm.id?`2px solid ${C.pD}`:`1.5px solid ${C.g200}`,background:rid===rm.id?C.pL:C.w,fontWeight:rid===rm.id?700:500,color:rid===rm.id?C.pDD:C.g500,whiteSpace:"nowrap",flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,.08)"}}>{rm.l}</button>))}</div>
<div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
<span style={{fontSize:12,color:C.g500,flexShrink:0}}>🎤</span>
<select value={selectedMic} onChange={e=>setSelectedMic(e.target.value)} style={{flex:1,padding:"6px 10px",borderRadius:10,border:`1.5px solid ${C.g200}`,fontSize:12,fontFamily:"inherit",color:C.g700,background:C.w,cursor:"pointer"}}>
{micDevices.length===0?<option value="">マイクが見つかりません</option>:micDevices.map((d,i)=>(<option key={d.deviceId} value={d.deviceId}>{d.label||`マイク ${i+1}`}</option>))}
</select>
<button onClick={loadMics} style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer",color:C.g500,flexShrink:0}}>🔄</button>
</div>
<div style={{display:"flex",gap:8,marginBottom:10,flexDirection:mob?"column":"row"}}>
<input value={pName} onChange={e=>sPName(e.target.value)} placeholder="👤 患者名" style={{...ib,flex:1}}/>
<input value={pId} onChange={e=>sPId(e.target.value)} placeholder="🔢 患者ID" style={{...ib,width:120}}/>
</div>
<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{T.map(t=>(<button key={t.id} onClick={()=>sTid(t.id)} style={{padding:mob?"6px 14px":"7px 16px",borderRadius:24,fontSize:mob?11:12,fontFamily:"inherit",cursor:"pointer",border:tid===t.id?"2px solid #84cc16":"2px solid transparent",background:tid===t.id?"#ecfccb":"#f5f5f4",fontWeight:tid===t.id?700:500,color:tid===t.id?"#3f6212":"#78716c",transition:"all 0.15s",boxShadow:"0 1px 4px rgba(0,0,0,.1)"}}>{t.name}</button>))}</div>
{shortcuts.some(s=>s.showOnTop&&s.enabled)&&<div style={{display:"flex",gap:4,marginBottom:10,flexWrap:mob?"nowrap":"wrap",padding:"8px 12px",borderRadius:14,background:"linear-gradient(135deg,#f7fee7,#ecfccb)",border:"1px solid #ecfccb",overflowX:mob?"auto":"visible"}}>
<span style={{fontSize:10,color:C.pD,fontWeight:600,alignSelf:"center",marginRight:4}}>⌨️</span>
{shortcuts.filter(s=>s.showOnTop&&s.enabled).map(sc=>(<button key={sc.id} onClick={()=>{
const actions={rec:()=>{if(rsRef.current==="recording"){stop()}else{go()}},sum:()=>sum(),clear:()=>{saveUndo();sInp("");sOut("");sSt("クリアしました")},next:()=>clr(),copy:()=>{if(out)cp(out)},pip:()=>{pipActive?closePip():openPip()},doc:()=>setPage("doc"),counsel:()=>setPage("counsel"),undo:()=>undo(),room1:()=>sRid("r1"),room2:()=>sRid("r2"),room3:()=>sRid("r3"),room4:()=>sRid("r4"),room5:()=>sRid("r5"),room6:()=>sRid("r6"),room7:()=>sRid("r7")};
const fn=actions[sc.id];if(fn)fn();
}} style={{padding:"3px 8px",borderRadius:8,border:`1px solid ${C.p}55`,background:C.w,fontSize:mob?10:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
<span style={{fontSize:9,color:C.g500}}>{sc.label.replace(/^[^\s]+\s/,"")}</span>
<span style={{fontSize:9,padding:"1px 4px",borderRadius:4,background:C.pD,color:C.w,fontFamily:"monospace",fontWeight:700}}>{sc.key}</span>
</button>))}
</div>}
<div style={{...card,position:"relative"}}>
<button onClick={pipActive?closePip:openPip} style={{position:"absolute",top:16,right:16,width:48,height:48,borderRadius:"50%",border:"none",background:pipActive?"#22c55e":"linear-gradient(135deg,#3f6212,#65a30d)",color:"#fff",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,boxShadow:pipActive?"0 0 0 3px rgba(16,185,129,.25)":"0 2px 10px rgba(20,184,166,.2)",transition:"all 0.2s"}}>
<span style={{fontSize:18}}>🌟</span><span style={{fontSize:9}}>{pipActive?"OFF":"小窓"}</span></button>
<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:16}}>
{rs!=="inactive"&&<span style={{fontSize:28,fontWeight:700,color:rs==="recording"?C.rG:C.warn,fontVariantNumeric:"tabular-nums"}}>{fm(el)}</span>}
{rs==="recording"&&<div style={{width:"60%",height:6,borderRadius:3,background:C.g200,overflow:"hidden"}}><div style={{width:`${lv}%`,height:"100%",background:`linear-gradient(90deg,${C.rG},${C.p})`,borderRadius:3,transition:"width 0.1s"}}/></div>}
<div style={{display:"flex",gap:12,alignItems:"center",minHeight:mob?80:94}}>
{rs==="inactive"?(<button onClick={go} style={{...rb,width:mob?76:90,height:mob?76:90,background:"linear-gradient(135deg,#3f6212,#65a30d)",color:C.w,boxShadow:"0 4px 15px rgba(61,90,30,.3), 0 2px 4px rgba(0,0,0,.1)"}}><span style={{fontSize:30}}>🎙</span><span style={{fontSize:12}}>録音開始</span></button>):(<>
{rs==="recording"?(<button onClick={pause} style={{...rb,width:60,height:60,background:C.warn,color:"#78350f"}}><span style={{fontSize:22}}>⏸</span></button>):(<button onClick={resume} style={{...rb,width:60,height:60,background:C.rG,color:C.w}}><span style={{fontSize:22}}>▶</span></button>)}
<button onClick={stopSum} style={{...rb,width:80,height:80,background:"linear-gradient(135deg,#365314,#3f6212)",color:C.w,boxShadow:"0 4px 14px rgba(101,163,13,.25)"}}><span style={{fontSize:20}}>✓</span><span style={{fontSize:12}}>要約</span></button>
<button onClick={stop} style={{...rb,width:60,height:60,background:C.err,color:C.w}}><span style={{fontSize:22}}>⏹</span></button></>)}
</div>
{rs==="recording"&&<div style={{fontSize:12,color:C.g400}}>🎙 5秒ごとに自動書き起こし</div>}
</div>
<div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><label style={{fontSize:13,fontWeight:700,color:C.g500}}>📝 書き起こし</label><span style={{fontSize:12,color:C.g400}}>{inp.length}文字</span></div>
<textarea value={inp} onChange={e=>sInp(e.target.value)} placeholder="録音ボタンで音声を書き起こし、または直接入力..." style={{width:"100%",height:mob?100:140,padding:mob?12:14,borderRadius:16,border:"1.5px solid #e2e8f0",background:"#f8fafc",fontSize:14,color:"#1e293b",fontFamily:"inherit",resize:"vertical",lineHeight:1.8,boxSizing:"border-box",transition:"border-color 0.2s",outline:"none"}}/></div>
<div style={{display:"flex",gap:mob?4:8,marginBottom:14,flexWrap:mob?"wrap":"nowrap"}}>
<button onClick={()=>sum()} disabled={ld||!inp.trim()} style={{flex:1,padding:"12px 0",borderRadius:16,border:"none",background:ld?"#e7e5e4":"linear-gradient(135deg,#65a30d,#84cc16)",color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!inp.trim()?0.4:1,boxShadow:!ld&&inp.trim()?"0 4px 15px rgba(61,90,30,.3), 0 2px 4px rgba(0,0,0,.1)":"none",transition:"all 0.2s",minWidth:80,whiteSpace:"nowrap"}}>{ld?"⏳ 処理中...":"⚡ 要約"}</button>
<button onClick={()=>{saveUndo();sInp("");sOut("");sSt("クリアしました")}} style={{padding:"10px 16px",borderRadius:14,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer",minWidth:44,whiteSpace:"nowrap"}}>🗑</button>
<button onClick={undo} style={{padding:"10px 14px",borderRadius:14,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer",opacity:undoRef.current?1:.35,minWidth:44,whiteSpace:"nowrap"}} title="元に戻す (Ctrl+Z)">↩</button>
<button onClick={clr} style={{padding:"10px 20px",borderRadius:14,border:`2px solid ${C.p}`,background:C.w,fontSize:14,fontWeight:700,color:C.pD,fontFamily:"inherit",cursor:"pointer",minWidth:80,whiteSpace:"nowrap",boxShadow:"0 3px 10px rgba(0,0,0,.15), 0 1px 3px rgba(0,0,0,.1)"}}>次へ ▶</button></div>
{out&&<div style={{borderRadius:20,border:"1.5px solid #bef264",padding:mob?14:20,background:"linear-gradient(135deg,#f7fee7,#ecfccb)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontSize:13,fontWeight:700,color:C.pD}}>{ct.name} 要約結果</span><button onClick={()=>cp(out)} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.p}44`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button></div>
<textarea value={out} onChange={e=>sOut(e.target.value)} style={{width:"100%",height:mob?140:180,padding:mob?10:12,borderRadius:mob?10:12,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.7,boxSizing:"border-box"}}/>
</div>}
{snippets.length>0&&<div style={{marginTop:8}}>
<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:4}}>{snippets.map((sn,i)=>(pipSnippets.includes(i)?<button key={i} onClick={()=>{sOut(o=>o+(o?"\n":"")+sn.text);navigator.clipboard.writeText(sn.text).catch(()=>{});sSt("📋 "+sn.title+" をコピーしました")}} style={{padding:"4px 10px",borderRadius:10,border:`1.5px solid ${C.p}`,background:C.pLL,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>⭐{sn.title}</button>:null))}</div>
{[...new Set(snippets.map(s=>s.cat||"その他"))].map(cat=>{const items=snippets.map((s,i)=>({...s,idx:i})).filter(s=>(s.cat||"その他")===cat&&!pipSnippets.includes(s.idx));if(!items.length)return null;const isOpen=openCats.includes(cat);return(<div key={cat} style={{marginBottom:2}}>
<button onClick={()=>setOpenCats(o=>o.includes(cat)?o.filter(c=>c!==cat):[...o,cat])} style={{width:"100%",padding:"3px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:isOpen?C.pLL:C.g50,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{cat}（{items.length}）</span><span>{isOpen?"▼":"▶"}</span></button>
{isOpen&&<div style={{display:"flex",gap:4,flexWrap:"wrap",padding:"4px 0"}}>{items.map(sn=>(<button key={sn.idx} onClick={()=>{sOut(o=>o+(o?"\n":"")+sn.text);navigator.clipboard.writeText(sn.text).catch(()=>{});sSt("📋 "+sn.title+" をコピーしました")}} style={{padding:"3px 8px",borderRadius:8,border:`1px solid ${C.p}33`,background:C.w,fontSize:11,fontWeight:500,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>{sn.title}</button>))}</div>}
</div>)})}
</div>}
{ld&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが要約を作成中...</span></div>}
</div></div>);}