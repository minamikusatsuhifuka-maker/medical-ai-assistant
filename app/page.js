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
const C={p:"#7ba83e",pD:"#567d2a",pDD:"#3d5a1e",pL:"#d4e8b8",pLL:"#f3f9ea",acc:"#a0c96a",w:"#fff",g50:"#fafbf8",g100:"#f0f3ec",g200:"#d8ddd0",g300:"#b8c0ad",g400:"#7a846e",g500:"#555e4a",g700:"#333b28",g900:"#1a1f14",rG:"#6a9e3a",warn:"#e6a817",err:"#d94f4f"};

// === TEMPLATES ===
const T=[
{id:"soap",name:"📋 ASOP",prompt:`あなたは皮膚科専門の医療秘書です。以下の書き起こしテキストをカルテ形式で要約してください。

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

// === CATEGORY AUTO-DETECT ===
const CATEGORIES=[
{id:"insurance",label:"🏥 保険診療",color:"#2563eb",bg:"#eff6ff"},
{id:"cosmetic",label:"✨ 美容自費",color:"#d946ef",bg:"#fdf4ff"},
{id:"counseling",label:"💬 カウンセリング",color:"#f59e0b",bg:"#fffbeb"},
];
function detectCategory(rid,text,template){
if(rid==="r7")return "counseling";
if(rid==="r4"||rid==="r5"||rid==="r6")return "cosmetic";
if(template==="cosmetic")return "cosmetic";
const cosmeticWords=["ポテンツァ","ノーリス","ピーリング","ダーマペン","HIFU","ヒアルロン酸","ボトックス","ゼオスキン","美容","施術","脱毛","レーザートーニング","ピコ","IPL","メソナ","エレクトロポレーション"];
const counselWords=["カウンセリング","相談","提案","ご希望","プラン","見積","予算","コース"];
const t=(text||"").toLowerCase();
if(cosmeticWords.some(w=>t.includes(w.toLowerCase())))return "cosmetic";
if(counselWords.some(w=>t.includes(w.toLowerCase())))return "counseling";
return "insurance";
}

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
const btn=(bg,color,extra)=>({padding:mob?"6px 12px":"8px 18px",borderRadius:mob?10:14,border:"none",background:bg,color,fontSize:mob?12:14,fontWeight:600,fontFamily:"inherit",cursor:"pointer",WebkitTapHighlightColor:"transparent",...extra});
const ib={padding:mob?"7px 10px":"8px 12px",borderRadius:mob?10:12,border:`1.5px solid ${C.g200}`,fontSize:mob?14:13,fontFamily:"inherit",outline:"none",background:C.w,color:C.g900,transition:"border-color 0.2s",WebkitAppearance:"none"};
const card={background:C.w,borderRadius:mob?14:20,padding:mob?"14px":"20px",boxShadow:"0 2px 16px rgba(13,148,136,.08)"};
const rb={width:mob?60:70,height:mob?60:70,borderRadius:"50%",border:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,fontFamily:"inherit",fontWeight:700,fontSize:mob?9:10,cursor:"pointer",WebkitTapHighlightColor:"transparent"};
const[page,setPage]=useState("main"); // main|room|hist|settings|help|about
const[rs,sRS]=useState("inactive"),[inp,sInp]=useState(""),[out,sOut]=useState(""),[st,sSt]=useState("待機中"),[el,sEl]=useState(0),[ld,sLd]=useState(false),[lv,sLv]=useState(0),[md,sMd]=useState("gemini"),[pc,sPC]=useState(0),[tid,sTid]=useState("soap"),[rid,sRid]=useState("r1");
const[hist,sHist]=useState([]),[search,setSearch]=useState(""),[pName,sPName]=useState(""),[pId,sPId]=useState("");
const[pipWin,setPipWin]=useState(null),[pipActive,setPipActive]=useState(false);
const[dict,setDict]=useState(DEFAULT_DICT),[newFrom,setNewFrom]=useState(""),[newTo,setNewTo]=useState(""),[dictEnabled,setDictEnabled]=useState(true);
const[logoUrl,setLogoUrl]=useState(""),[logoSize,setLogoSize]=useState(32);
const[shortcuts,setShortcuts]=useState(DEFAULT_SHORTCUTS);
useEffect(()=>{try{const l=localStorage.getItem("mk_logo");if(l)setLogoUrl(l);const s=localStorage.getItem("mk_logoSize");if(s)setLogoSize(parseInt(s));const d=localStorage.getItem("mk_dict");if(d)setDict(JSON.parse(d));const sn=localStorage.getItem("mk_snippets");if(sn)setSnippets(JSON.parse(sn));const ps=localStorage.getItem("mk_pipSnippets");if(ps)setPipSnippets(JSON.parse(ps));const as=localStorage.getItem("mk_audioSave");if(as)setAudioSave(as==="1");const de=localStorage.getItem("mk_dictEnabled");if(de)setDictEnabled(de==="1");const sc=localStorage.getItem("mk_shortcuts");if(sc)setShortcuts(JSON.parse(sc))}catch{}},[]);
const[micDevices,setMicDevices]=useState([]),[selectedMic,setSelectedMic]=useState("");
const loadMics=async()=>{try{await navigator.mediaDevices.getUserMedia({audio:true}).then(s=>s.getTracks().forEach(t=>t.stop()));const devs=await navigator.mediaDevices.enumerateDevices();const mics=devs.filter(d=>d.kind==="audioinput");setMicDevices(mics);if(!selectedMic&&mics.length>0)setSelectedMic(mics[0].deviceId)}catch(e){console.error("Mic enumeration error:",e)}};
useEffect(()=>{loadMics();navigator.mediaDevices.addEventListener("devicechange",loadMics);return()=>navigator.mediaDevices.removeEventListener("devicechange",loadMics)},[]);
useEffect(()=>{if(!document.getElementById("spin-kf")){const s=document.createElement("style");s.id="spin-kf";s.textContent="@keyframes spin{to{transform:rotate(360deg)}}";document.head.appendChild(s)}},[]);
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
const[recCat,setRecCat]=useState("insurance");
const[manualOut,setManualOut]=useState("");
const[manualLd,setManualLd]=useState(false);
const[manualType,setManualType]=useState("flow");
const[manualCat,setManualCat]=useState("all");
const[catStats,setCatStats]=useState({insurance:0,cosmetic:0,counseling:0});
const[listInput,setListInput]=useState("");
const[listOut,setListOut]=useState(null);
const[listLd,setListLd]=useState(false);
const[listTab,setListTab]=useState("medicine");
const[listMsg,setListMsg]=useState("");
const[listSaved,setListSaved]=useState([]);
const[listVerified,setListVerified]=useState({});
const undoRef=useRef(null);
const loadCsCount=async()=>{if(!supabase)return;try{const{count}=await supabase.from("counseling_records").select("*",{count:"exact",head:true});setCsCount(count||0)}catch{}};
useEffect(()=>{loadCsCount()},[]);

// Keyboard shortcuts
const startRef=useRef(null),stopRef=useRef(null),sumRef=useRef(null),clrRef=useRef(null),undoFnRef=useRef(null),pipFnRef=useRef(null);
useEffect(()=>{
const handler=(e)=>{
if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA"||e.target.tagName==="SELECT")return;
const key=e.key;const ctrl=e.ctrlKey||e.metaKey;
const findSC=(id)=>shortcuts.find(s=>s.id===id);
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
const[minRS,setMinRS]=useState("inactive"),[minInp,setMinInp]=useState(""),[minOut,setMinOut]=useState(""),[minLd,setMinLd]=useState(false),[minEl,setMinEl]=useState(0),[minPrompt,setMinPrompt]=useState("");
const[audioSave,setAudioSave]=useState(false),[audioChunks,setAudioChunks]=useState([]),[savedMsg,setSavedMsg]=useState("");
const audioSaveRef=useRef(false),allAudioChunks=useRef([]);
useEffect(()=>{audioSaveRef.current=audioSave},[audioSave]);
const saveAudio=async(blob)=>{if(!supabase||!blob||blob.size<1000)return;try{const ts=new Date().toISOString().replace(/[:.]/g,"-");const path=`audio/${rid}/${ts}_${pIdRef.current||"unknown"}.webm`;const{error}=await supabase.storage.from("audio").upload(path,blob,{contentType:"audio/webm"});if(error)console.error("Audio save error:",error);else console.log("Audio saved:",path)}catch(e){console.error("Audio save error:",e)}};
const mR=useRef(null),msR=useRef(null),acR=useRef(null),anR=useRef(null),laR=useRef(null),tR=useRef(null),cR=useRef(null),iR=useRef("");
const pipRef=useRef(null),elRef=useRef(0),lvRef=useRef(0),rsRef=useRef("inactive"),pNameRef=useRef(""),pIdRef=useRef(""),snippetsRef=useRef(DEFAULT_SNIPPETS),pipSnippetsRef=useRef([0,1,2,3,4]);
useEffect(()=>{iR.current=inp},[inp]);
useEffect(()=>{elRef.current=el},[el]);
useEffect(()=>{lvRef.current=lv},[lv]);
useEffect(()=>{rsRef.current=rs},[rs]);
useEffect(()=>{pNameRef.current=pName},[pName]);
useEffect(()=>{pIdRef.current=pId},[pId]);
useEffect(()=>{snippetsRef.current=snippets},[snippets]);
useEffect(()=>{pipSnippetsRef.current=pipSnippets},[pipSnippets]);
useEffect(()=>{if(rs==="recording"){tR.current=setInterval(()=>sEl(t=>t+1),1000)}else{clearInterval(tR.current);if(rs==="inactive")sEl(0)}return()=>clearInterval(tR.current)},[rs]);
useEffect(()=>{let lastSnHash="";const id=setInterval(()=>{if(!pipRef.current)return;const d=pipRef.current;const t=d.getElementById("pip-timer"),l=d.getElementById("pip-level"),s=d.getElementById("pip-status"),tr=d.getElementById("pip-transcript");if(t){const e=elRef.current;t.textContent=`${String(Math.floor(e/60)).padStart(2,"0")}:${String(e%60).padStart(2,"0")}`}if(l)l.style.width=`${lvRef.current}%`;if(s){const r=rsRef.current;s.textContent=r==="recording"?"録音中":r==="paused"?"一時停止":"停止";s.style.color=r==="recording"?C.rG:r==="paused"?C.warn:C.g400}if(tr){const txt=iR.current;if(txt){const lines=txt.split("\n");tr.textContent=lines[lines.length-1]}else{tr.textContent=""}}const c=d.getElementById("pip-snippets");if(c){const sn=snippetsRef.current;const ids=pipSnippetsRef.current;const hash=ids.join(",")+"|"+sn.length;if(hash!==lastSnHash){lastSnHash=hash;let html="";ids.forEach(idx=>{if(idx<sn.length){html+=`<button data-sn-idx="${idx}" style="padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.2);color:#fff;font-size:11px;font-weight:600;cursor:pointer">${sn[idx].title}</button>`}});c.innerHTML=html;c.querySelectorAll("button").forEach(b=>{b.onclick=()=>{const idx=parseInt(b.getAttribute("data-sn-idx"));const t2=snippetsRef.current[idx];if(t2)sOut(o=>o+(o?"\n":"")+t2.text)}})}}},500);return()=>clearInterval(id)},[]);

const fm=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const ct=T.find(t=>t.id===tid)||T[0],cr=R.find(r=>r.id===rid);

// Supabase
const saveRecord=async(input,output)=>{if(!supabase)return;
const cat=detectCategory(rid,input+output,tid);
setRecCat(cat);
try{await supabase.from("records").insert({room:rid,template:tid,ai_model:md,input_text:input,output_text:output,patient_name:pNameRef.current,patient_id:pIdRef.current,category:cat});if(rid==="r7"){await supabase.from("counseling_records").insert({patient_name:pNameRef.current,patient_id:pIdRef.current,transcription:input,summary:output,room:"r7"})}}catch(e){console.error("Save error:",e)}};
const generateDoc=async()=>{if(!docDisease.trim())return;setDocLd(true);setDocOut("");try{let histData=[];if(supabase){const{data}=await supabase.from("records").select("output_text").order("created_at",{ascending:false}).limit(200);if(data)histData=data.map(r=>r.output_text).filter(Boolean)}
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
const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:sysPrompt,mode:"gemini",prompt:"以下の指示に従って患者向け説明資料を作成してください。"})});const d=await r.json();if(d.error){setDocOut("エラー: "+d.error)}else{setDocOut(d.summary)}}catch(e){setDocOut("エラー: "+e.message)}finally{setDocLd(false)}};

const minMR=useRef(null),minSR=useRef(null),minIR=useRef(null),minTI=useRef(null);minIR.current=minInp;
const minGo=async()=>{const s=await sAM();if(!s)return;const mr=new MediaRecorder(s,{mimeType:"audio/webm;codecs=opus"});minMR.current=mr;let ch=[];mr.ondataavailable=e=>{if(e.data.size>0)ch.push(e.data)};mr.onstop=async()=>{if(ch.length>0){const b=new Blob(ch,{type:"audio/webm"});ch=[];if(b.size<500)return;try{const f=new FormData();f.append("audio",b,"audio.webm");const r=await fetch("/api/transcribe",{method:"POST",body:f}),d=await r.json();if(d.text&&d.text.trim()){setMinInp(p=>p+(p?"\n":"")+d.text.trim())}}catch{}}};mr.start();setMinRS("recording");setMinEl(0);minTI.current=setInterval(()=>{setMinEl(t=>t+1);if(minMR.current&&minMR.current.state==="recording"){minMR.current.stop();setTimeout(()=>{if(minMR.current&&minSR.current!=="inactive"){minMR.current.start()}},200)}},10000)};
const minStop=()=>{if(minTI.current)clearInterval(minTI.current);if(minMR.current&&minMR.current.state==="recording")minMR.current.stop();setMinRS("inactive");minSR.current="inactive";xAM()};
const minSum=async()=>{minStop();if(!minIR.current?.trim()){return}setMinLd(true);
const p=minPrompt.trim()||"以下の会議・ミーティングの書き起こしから議事録を作成してください。";
const prompt=`${p}\n\n【書き起こし内容】\n${minIR.current}\n\n以下の構成で簡潔にまとめてください：\n1. 日時・参加者（わかる場合）\n2. 議題・アジェンダ\n3. 決定事項\n4. 各議題の要点\n5. アクションアイテム（担当者・期限）\n6. 次回予定`;
try{const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:prompt,mode:"gemini",prompt:"議事録を作成してください。"})});const d=await r.json();if(d.error){setMinOut("エラー: "+d.error)}else{setMinOut(d.summary)}}catch(e){setMinOut("エラー: "+e.message)}finally{setMinLd(false)}};
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

const analyzeCounseling=async()=>{const tx=csTx.trim()||iR.current;if(!tx){setCsOut("分析するテキストがありません。録音→書き起こし後、または直接テキストを入力してください。");return}setCsLd(true);setCsOut("");
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

try{const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:modes[csMode],mode:"gemini",prompt:"詳細に分析してください。"})});const d=await r.json();setCsOut(d.error?"エラー: "+d.error:d.summary)}catch(e){setCsOut("エラー: "+e.message)}finally{setCsLd(false)}};

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
const loadCatStats=async()=>{if(!supabase)return;try{
const{data}=await supabase.from("records").select("category").order("created_at",{ascending:false}).limit(500);
if(data){const stats={insurance:0,cosmetic:0,counseling:0};data.forEach(r=>{const c=r.category||"insurance";if(stats[c]!==undefined)stats[c]++});setCatStats(stats)}
}catch{}};
const delRecord=async(id)=>{if(!supabase)return;try{await supabase.from("records").delete().eq("id",id);sHist(h=>h.filter(r=>r.id!==id))}catch(e){console.error("Delete error:",e)}};
const loadClinicItems=async()=>{if(!supabase)return;try{const{data}=await supabase.from("clinic_items").select("*").order("category").order("name");if(data)setListSaved(data)}catch(e){console.error("clinic_items load error:",e)}};
const saveClinicItem=async(item)=>{if(!supabase)return;try{const{error}=await supabase.from("clinic_items").insert(item);if(error){setListMsg("保存エラー: "+error.message);return false}return true}catch(e){setListMsg("エラー: "+e.message);return false}};
const saveAllVerified=async(items)=>{if(!supabase||!items||items.length===0)return;setListMsg("保存中...");try{
const rows=items.filter(item=>listVerified[item.name]!==false).map(item=>({
category:item.category||"other",
name:item.name,
details:item.details||"",
diseases:item.diseases||"",
usage_info:item.usage||"",
notes:item.notes||"",
verified:listVerified[item.name]===true
}));
const batchSize=50;let total=0;
for(let i=0;i<rows.length;i+=batchSize){const batch=rows.slice(i,i+batchSize);const{error}=await supabase.from("clinic_items").insert(batch);if(error){setListMsg("保存エラー: "+error.message);return}total+=batch.length}
setListMsg(`✅ ${total}件を保存しました`);loadClinicItems();
}catch(e){setListMsg("エラー: "+e.message)}};
const importListFile=async(file)=>{if(!file)return;setListLd(true);setListMsg("ファイル読み込み中...");try{const text=await file.text();setListInput(text);setListMsg(`ファイル読み込み完了（${Math.round(text.length/1024)}KB）`)}catch(e){setListMsg("読み込みエラー: "+e.message)}finally{setListLd(false)}};
const generateList=async(source)=>{
setListLd(true);setListOut(null);setListMsg("");setListVerified({});
try{
let inputText=listInput;

if(source==="records"){
let recText="";
if(supabase){
const{data}=await supabase.from("records").select("output_text,template").order("created_at",{ascending:false}).limit(300);
if(data)recText=data.map(r=>r.output_text).filter(Boolean).join("\n---\n");
const{data:pd}=await supabase.from("past_records").select("content").order("created_at",{ascending:false}).limit(50);
if(pd&&pd.length>0)recText+="\n\n"+pd.map(r=>r.content).join("\n---\n");
}
inputText=recText;
if(!inputText){setListMsg("診療記録がありません");setListLd(false);return}
}

if(!inputText.trim()){setListMsg("テキストを入力またはファイルをアップロードしてください");setListLd(false);return}

const prompt=`あなたは皮膚科クリニックの薬剤・医療機器の専門家です。以下のテキストから、このクリニックで実際に使用されている薬剤・施術・製品・処置を正確に抽出し、JSON形式で一覧表を作成してください。

【重要：正確性ルール】
- テキストに明記されているものだけを抽出すること（推測で追加しない）
- 薬剤名は正式名称を使用（商品名と一般名が分かれば両方記載）
- 用法用量はテキストに記載がある場合のみ記載
- 疾患名は実際にテキスト内でその薬剤・施術と関連付けられているもののみ

【入力テキスト】
${inputText.slice(0,15000)}

【出力形式】必ず以下のJSON形式のみで出力してください。説明文は不要です。
{
  "medicine": [
    {"name":"薬剤名（正式名称）","details":"剤形・規格・用法用量","diseases":"対象疾患（カンマ区切り）","usage":"1日2回 朝夕食後 等","notes":"注意点・備考"}
  ],
  "procedure": [
    {"name":"施術・機器名","details":"パラメータ・設定値","diseases":"対象疾患・症状","usage":"施術頻度・間隔","notes":"注意点"}
  ],
  "product": [
    {"name":"製品名","details":"種類・成分・価格帯","diseases":"対象の悩み","usage":"使用方法","notes":"備考"}
  ],
  "surgery": [
    {"name":"処置・手術名","details":"手順・使用器具","diseases":"対象疾患","usage":"定型文テンプレート","notes":"術後注意"}
  ],
  "disease_rx": [
    {"name":"疾患名","details":"第一選択薬","diseases":"代替薬・追加治療","usage":"処方パターン（用法用量含む）","notes":"注意点・禁忌"}
  ]
}

JSON以外の文字は一切出力しないでください。`;

const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:prompt,mode:"gemini",prompt:"JSON形式のみで出力してください。"})});
const d=await r.json();
if(d.error){setListMsg("エラー: "+d.error);setListLd(false);return}

try{
const cleaned=d.summary.replace(/```json|```/g,"").trim();
const parsed=JSON.parse(cleaned);
setListOut(parsed);
setListMsg(`✅ 抽出完了 - 内容を確認して「✓確認済み」をチェックしてから保存してください`);
}catch(e){
setListMsg("JSON解析エラー - 再度お試しください");
setListOut(null);
}
}catch(e){setListMsg("エラー: "+e.message)}finally{setListLd(false)}
};
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
const sum=async(tx)=>{const t=tx||iR.current;if(!t.trim()){sSt("テキストを入力してください");return}sLd(true);sSt("Gemini で要約中...");try{
let pastExamples="";if(supabase){try{const{data}=await supabase.from("records").select("output_text,template").order("created_at",{ascending:false}).limit(100);if(data){const sameTpl=data.filter(r=>r.template===tid&&r.output_text).slice(0,5);if(sameTpl.length>0){pastExamples="\n\n【当院の過去の要約例（同テンプレート）- この書式・表現を参考にして統一感を出してください】\n"+sameTpl.map((r,i)=>`例${i+1}:\n${r.output_text}`).join("\n---\n")}}
const{data:pastData}=await supabase.from("past_records").select("content").order("created_at",{ascending:false}).limit(30);if(pastData&&pastData.length>0){pastExamples+="\n\n【当院の過去のカルテ記録（参考）- 当院の用語・薬剤名・表現方法を参考にしてください】\n"+pastData.slice(0,10).map(r=>r.content).join("\n---\n")}
}catch(e){console.error("History fetch error:",e)}}
const enhancedPrompt=ct.prompt+pastExamples;
const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t,mode:"gemini",prompt:enhancedPrompt})}),d=await r.json();if(d.error){sSt("エラー: "+d.error);return}sOut(d.summary);await saveRecord(t,d.summary);try{await navigator.clipboard.writeText(d.summary);const catInfo=CATEGORIES.find(c=>c.id===detectCategory(rid,t+d.summary,tid));sSt(`要約完了・保存済み ✓ ${catInfo?catInfo.label:""}`)}catch{const catInfo=CATEGORIES.find(c=>c.id===detectCategory(rid,t+d.summary,tid));sSt(`要約完了・保存済み ${catInfo?catInfo.label:""}`)}}catch{sSt("エラーが発生しました")}finally{sLd(false)}};
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
<button id="pip-pause" style="padding:2px 10px;border-radius:8px;border:none;background:#fbbf24;color:#78350f;font-size:13px;font-weight:700;cursor:pointer;display:none">一時停止</button>
<button id="pip-sum" style="padding:2px 10px;border-radius:8px;border:none;background:#567d2a;color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:none">要約</button>
<button id="pip-stop" style="padding:2px 10px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:none">停止</button>
<button id="pip-next" style="padding:2px 12px;border-radius:8px;border:2px solid #fff;background:rgba(255,255,255,.15);color:#fff;font-size:12px;font-weight:700;cursor:pointer">次へ▶</button></div>
<div id="pip-shortcuts" style="display:flex;gap:3px;flex-wrap:wrap;overflow:hidden;max-height:24px;margin-top:2px;padding-top:2px;border-top:1px solid rgba(255,255,255,.1)"></div>
<div id="pip-snippets" style="display:flex;gap:4px;flex-wrap:wrap;overflow:hidden;max-height:28px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,.15)"></div></div>`;
pw.document.head.innerHTML=`<style>::placeholder{color:rgba(255,255,255,.35)}</style>`;
const pipPiEl=pw.document.getElementById("pip-pid");if(pipPiEl){pipPiEl.value=pId;pipPiEl.addEventListener("input",e=>{sPId(e.target.value)})}
const pipBtnUpdate=()=>{const d=pipRef.current;if(!d)return;const r=rsRef.current;const rb=d.getElementById("pip-rec"),pb=d.getElementById("pip-pause"),sb=d.getElementById("pip-stop"),smb=d.getElementById("pip-sum");if(!rb)return;rb.style.display=r==="inactive"?"inline-block":"none";pb.style.display=r!=="inactive"?"inline-block":"none";if(r==="recording"){pb.textContent="一時停止";pb.style.background="#fbbf24";pb.style.color="#78350f"}else if(r==="paused"){pb.textContent="再開";pb.style.background="#22c55e";pb.style.color="#fff"}sb.style.display=r!=="inactive"?"inline-block":"none";smb.style.display=r!=="inactive"?"inline-block":"none"};
pw.document.getElementById("pip-rec").onclick=()=>{go();setTimeout(pipBtnUpdate,500)};
pw.document.getElementById("pip-pause").onclick=()=>{if(rsRef.current==="recording"){pause()}else{resume()}setTimeout(pipBtnUpdate,300)};
pw.document.getElementById("pip-stop").onclick=()=>{stop();setTimeout(pipBtnUpdate,300)};
pw.document.getElementById("pip-sum").onclick=()=>{stopSum();setTimeout(pipBtnUpdate,500)};
pw.document.getElementById("pip-next").onclick=()=>{clr();const d=pipRef.current;if(d){const pi=d.getElementById("pip-pid");if(pi)pi.value=""}setTimeout(pipBtnUpdate,300)};
const renderPipSnippets=()=>{const d=pipRef.current;if(!d)return;const c=d.getElementById("pip-snippets");if(!c)return;const sn=snippetsRef.current;const ids=pipSnippetsRef.current;let html="";ids.forEach(idx=>{if(idx<sn.length){html+=`<button data-sn-idx="${idx}" style="padding:1px 6px;border-radius:5px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;font-size:9px;font-weight:600;cursor:pointer">${sn[idx].title}</button>`}});c.innerHTML=html;c.querySelectorAll("button").forEach(b=>{b.onclick=()=>{const idx=parseInt(b.getAttribute("data-sn-idx"));const t=snippetsRef.current[idx];if(t)sOut(o=>o+(o?"\n":"")+t.text)}})};
renderPipSnippets();
const renderPipShortcuts=()=>{const d=pipRef.current;if(!d)return;const c=d.getElementById("pip-shortcuts");if(!c)return;
const topSCs=shortcuts.filter(s=>s.showOnTop&&s.enabled);
let html="";topSCs.forEach(sc=>{html+=`<button data-sc-id="${sc.id}" style="padding:1px 5px;border-radius:4px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#a0c96a;font-size:8px;font-weight:600;cursor:pointer">${sc.label.split(" ")[0]} ${sc.key}</button>`});
c.innerHTML=html;
c.querySelectorAll("button").forEach(b=>{b.onclick=()=>{const id=b.getAttribute("data-sc-id");
const actions={rec:()=>{if(rsRef.current==="recording"){stop()}else{go()}},sum:()=>{stopSum()},clear:()=>{saveUndo();sInp("");sOut("");sSt("クリアしました")},next:()=>{clr();const d2=pipRef.current;if(d2){const pi=d2.getElementById("pip-pid");if(pi)pi.value=""}},copy:()=>{if(iR.current)navigator.clipboard.writeText(iR.current)},pip:()=>{closePip()},doc:()=>setPage("doc"),counsel:()=>setPage("counsel"),undo:()=>undo(),room1:()=>sRid("r1"),room2:()=>sRid("r2"),room3:()=>sRid("r3"),room4:()=>sRid("r4"),room5:()=>sRid("r5"),room6:()=>sRid("r6"),room7:()=>sRid("r7")};
const fn=actions[id];if(fn)fn();
}})};
renderPipShortcuts();
pipRef.current=pw.document;setPipWin(pw);setPipActive(true);
const btnLoop=setInterval(()=>{if(!pipRef.current){clearInterval(btnLoop);return}pipBtnUpdate()},600);
pw.addEventListener("pagehide",()=>{clearInterval(btnLoop);pipRef.current=null;setPipWin(null);setPipActive(false)});
}catch(e){console.error("PiP error:",e);sSt("小窓を開けませんでした")}
},[rid,pId,pipSnippets,snippets,shortcuts]);
const closePip=useCallback(()=>{if(pipWin){pipWin.close()}pipRef.current=null;setPipWin(null);setPipActive(false)},[pipWin]);
startRef.current=go;stopRef.current=stop;sumRef.current=sum;clrRef.current=clr;undoFnRef.current=undo;pipFnRef.current=openPip;

// Helpers
const fmD=(d)=>{const dt=new Date(d);return `${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2,"0")}`};
const tn=(id)=>{const t=T.find(x=>x.id===id);return t?t.name:id};
const rn=(id)=>{const r=R.find(x=>x.id===id);return r?`${r.i}${r.l}`:id};

const titleRow=()=>(<div style={{display:"flex",alignItems:"center",gap:8}}>{logoUrl&&<img src={logoUrl} alt="logo" style={{width:logoSize,height:logoSize,borderRadius:8,objectFit:"contain"}}/>}<span style={{fontWeight:700,fontSize:15,color:C.w}}>南草津皮フ科AIカルテ要約</span></div>);

// === MANUAL GENERATION PAGE ===
if(page==="manual")return(<div style={{maxWidth:mob?"100%":800,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:mob?16:18,fontWeight:700,color:C.pDD,margin:0}}>📚 指導マニュアル作成</h2><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<p style={{fontSize:mob?12:13,color:C.g500,marginBottom:12}}>過去の診療記録・書き起こしからAIが新人スタッフ・新人医師向けの指導資料を自動生成します。</p>

<div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
{CATEGORIES.map(c=>(<div key={c.id} style={{flex:1,minWidth:mob?140:160,padding:"10px 14px",borderRadius:12,background:c.bg,border:`1.5px solid ${c.color}22`,textAlign:"center"}}>
<div style={{fontSize:20,fontWeight:700,color:c.color}}>{catStats[c.id]||0}</div>
<div style={{fontSize:11,fontWeight:600,color:c.color}}>{c.label}</div>
<div style={{fontSize:10,color:c.color,opacity:0.6}}>件の記録</div>
</div>))}
</div>

<div style={{marginBottom:12}}>
<div style={{fontSize:12,fontWeight:700,color:C.g500,marginBottom:6}}>📂 対象カテゴリ</div>
<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
{[{id:"all",label:"🔄 全て"},{id:"insurance",label:"🏥 保険診療"},{id:"cosmetic",label:"✨ 美容自費"},{id:"counseling",label:"💬 カウンセリング"}].map(c=>(<button key={c.id} onClick={()=>setManualCat(c.id)} style={{padding:"5px 12px",borderRadius:10,border:manualCat===c.id?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:manualCat===c.id?C.pLL:C.w,fontSize:mob?11:12,fontWeight:manualCat===c.id?700:500,color:manualCat===c.id?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{c.label}</button>))}
</div></div>

<div style={{marginBottom:14}}>
<div style={{fontSize:12,fontWeight:700,color:C.g500,marginBottom:6}}>📋 マニュアルの種類</div>
<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
{[
{id:"flow",label:"🗣 診察の流れ・話し方",desc:"診察の進め方、患者への声かけ、問診のポイント"},
{id:"prescription",label:"💊 処方・処置パターン",desc:"よく使う処方の組み合わせ、処置の手順・注意点"},
{id:"talkscript",label:"💬 トークスクリプト",desc:"カウンセリングの会話例、提案の仕方、クロージング"},
{id:"disease",label:"📖 疾患別対応",desc:"疾患ごとの診察フロー、検査、治療方針の判断基準"},
].map(t=>(<button key={t.id} onClick={()=>setManualType(t.id)} style={{flex:mob?"1 1 100%":"1 1 45%",padding:"10px 14px",borderRadius:12,border:manualType===t.id?`2px solid ${C.p}`:`1.5px solid ${C.g200}`,background:manualType===t.id?C.pLL:C.w,textAlign:"left",fontFamily:"inherit",cursor:"pointer"}}>
<div style={{fontSize:13,fontWeight:manualType===t.id?700:600,color:manualType===t.id?C.pD:C.g700,marginBottom:2}}>{t.label}</div>
<div style={{fontSize:10,color:C.g400,lineHeight:1.4}}>{t.desc}</div>
</button>))}
</div></div>

<button onClick={async()=>{
setManualLd(true);setManualOut("");
try{
let records=[];
if(supabase){
const{data}=await supabase.from("records").select("output_text,input_text,template,room,category").order("created_at",{ascending:false}).limit(300);
if(data){
records=data.filter(r=>{
if(manualCat==="all")return true;
const c=r.category||detectCategory(r.room,r.input_text+r.output_text,r.template);
return c===manualCat;
}).slice(0,80);
}}

let pastKarte="";
if(supabase){try{const{data:pd}=await supabase.from("past_records").select("content").order("created_at",{ascending:false}).limit(30);if(pd&&pd.length>0)pastKarte=pd.map(r=>r.content).join("\n---\n")}catch{}}

let csData="";
if(supabase&&(manualCat==="counseling"||manualCat==="all")){try{const{data:cd}=await supabase.from("counseling_records").select("transcription,summary").order("created_at",{ascending:false}).limit(30);if(cd&&cd.length>0)csData=cd.map(r=>`書き起こし: ${r.transcription}\n要約: ${r.summary||""}`).join("\n---\n")}catch{}}

const recText=records.map(r=>`[${r.template}] ${r.output_text}`).join("\n---\n");
const catLabel=manualCat==="all"?"全カテゴリ":CATEGORIES.find(c=>c.id===manualCat)?.label||"";

const prompts={
flow:`以下は${catLabel}の皮膚科クリニックの過去の診療記録です。この記録を分析して、新人医師・新人スタッフ向けの「診察の流れ・話し方マニュアル」を作成してください。

【診療記録（${records.length}件）】
${recText}
${pastKarte?"\n【過去カルテ】\n"+pastKarte:""}
${csData?"\n【カウンセリング記録】\n"+csData:""}

以下の構成でチェックリスト形式を含めて作成：

■ 1. 診察前の準備チェックリスト
□ 確認すべき項目を列挙

■ 2. 診察の流れ（ステップ別）
各ステップで：
- やること
- 声かけ例（「」で具体的なセリフ）
- 注意点
- □ チェック項目

■ 3. よく使うフレーズ集
- 挨拶・導入
- 症状確認
- 説明・指導
- 締めくくり
実際の記録から抽出した当院らしい表現を優先

■ 4. NG例と改善例
- やってはいけない対応
- その改善案

■ 5. 確認テスト（○×クイズ3問）`,

prescription:`以下は${catLabel}の皮膚科クリニックの過去の診療記録です。この記録を分析して、新人医師向けの「よく使う処方・処置パターン集」を作成してください。

【診療記録（${records.length}件）】
${recText}
${pastKarte?"\n【過去カルテ】\n"+pastKarte:""}

以下の構成でチェックリスト形式を含めて作成：

■ 1. 疾患別よく使う処方パターン
実際の記録から頻出する処方の組み合わせを抽出：
- 疾患名
- 第一選択の処方（薬剤名・用法用量）
- 代替処方
- □ 処方時の確認チェックリスト

■ 2. よく行う処置の手順
実際の記録に基づく処置手順：
- 処置名
- 準備物品チェックリスト
- □ 手順（ステップ別）
- 術後指示のテンプレート

■ 3. 外用指導のポイント
- FTU、塗布順序、プロアクティブ療法
- □ 患者説明時の確認項目

■ 4. 注意すべき薬剤相互作用・禁忌

■ 5. クイックリファレンス表
疾患→処方を一覧表形式で`,

talkscript:`以下は${catLabel}の皮膚科クリニックの過去のカウンセリング・診療記録です。この記録を分析して、新人スタッフ向けの「カウンセリング・トークスクリプト」を作成してください。

【診療記録（${records.length}件）】
${recText}
${csData?"\n【カウンセリング記録】\n"+csData:""}

以下の構成でチェックリスト形式を含めて作成：

■ 1. カウンセリングの流れチェックリスト
□ 各フェーズのチェック項目

■ 2. フェーズ別トークスクリプト
各フェーズ（導入→ヒアリング→提案→クロージング→次回予約）で：
- 目的
- 具体的なセリフ例（「」で記載）
- やってはいけないNG例
- □ 確認ポイント

■ 3. 施術別の説明トーク
当院で扱う施術ごと：
- 効果の伝え方
- ダウンタイムの説明
- 費用の伝え方
- 不安解消のフレーズ

■ 4. よくある質問への回答例（Q&A形式）

■ 5. クロージングテクニック
- 決断を後押しするフレーズ
- 迷っている患者への対応
- 次回予約への誘導

■ 6. 成功例・失敗例の比較`,

disease:`以下は${catLabel}の皮膚科クリニックの過去の診療記録です。この記録を分析して、新人医師向けの「疾患別対応マニュアル」を作成してください。

【診療記録（${records.length}件）】
${recText}
${pastKarte?"\n【過去カルテ】\n"+pastKarte:""}

以下の構成でチェックリスト形式を含めて作成：

■ 疾患別セクション（実際の記録で頻出する疾患を優先）
各疾患ごとに：

### 疾患名
1. 概要（新人向け簡潔説明）
2. 診察フロー
   □ 問診で確認すること
   □ 視診・触診のポイント
   □ 必要な検査
3. 当院での標準治療
   - 第一選択
   - 効果不十分時の次の手
4. 患者への説明ポイント
   - 声かけ例（「」で具体的に）
5. フォローアップ
   □ 再診時の確認項目
   □ 治療効果判定の基準
6. 注意・ピットフォール
   - 見落としやすいポイント
   - 紹介が必要なケース

※実際の記録に基づいて当院の治療方針を反映
※最低5疾患以上をカバー`
};

const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:prompts[manualType],mode:"gemini",prompt:"新人指導用のマニュアルを作成してください。チェックリスト形式（□）を必ず含めてください。"})});
const d=await r.json();
setManualOut(d.error?"エラー: "+d.error:d.summary);
}catch(e){setManualOut("エラー: "+e.message)}finally{setManualLd(false)}
}} disabled={manualLd} style={{width:"100%",padding:"12px 24px",borderRadius:14,border:"none",background:manualLd?C.g200:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:15,fontWeight:700,fontFamily:"inherit",cursor:"pointer",marginBottom:14}}>
{manualLd?"⏳ AIがマニュアルを作成中...":"📚 マニュアル生成"}</button>

{manualLd&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>過去の診療記録を分析してマニュアルを作成中...</span></div>}

{manualOut&&<div>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>📚 {[{id:"flow",l:"診察の流れ・話し方"},{id:"prescription",l:"処方・処置パターン"},{id:"talkscript",l:"トークスクリプト"},{id:"disease",l:"疾患別対応"}].find(t=>t.id===manualType)?.l||""} マニュアル</span>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>{navigator.clipboard.writeText(manualOut);sSt("📋 マニュアルをコピーしました")}} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.p}44`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button>
</div></div>
<textarea value={manualOut} onChange={e=>setManualOut(e.target.value)} style={{width:"100%",height:mob?350:500,padding:mob?10:14,borderRadius:12,border:`1px solid ${C.g200}`,background:C.w,fontSize:mob?13:14,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.8,boxSizing:"border-box"}}/>
</div>}

</div></div>);

// === SHORTCUTS PAGE ===
if(page==="shortcuts")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:mob?16:18,fontWeight:700,color:C.pDD,margin:0}}>⌨️ ショートカット一覧</h2><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
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
if(page==="help")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0}}>📖 使い方ガイド</h2><button onClick={()=>{setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<div style={{fontSize:14,color:C.g700,lineHeight:2}}>
<h3 style={{color:C.pD,fontSize:15}}>1. 部屋を選択</h3>
<p>トップ画面で診察室・処置室などを選択します。部屋情報は履歴に保存されます。</p>
<h3 style={{color:C.pD,fontSize:15}}>2. 患者情報を入力</h3>
<p>患者名・患者IDを入力欄に記入します。履歴検索に使えます。</p>
<h3 style={{color:C.pD,fontSize:15}}>3. テンプレートを選択</h3>
<p>ASOP・疾患名・美容・処置・経過・フリーの6種類から選べます。用途に合わせて切り替えてください。</p>
<h3 style={{color:C.pD,fontSize:15}}>4. 録音開始</h3>
<p>🎙ボタンをタップすると録音が始まります。5秒ごとに自動で書き起こしされます。</p>
<h3 style={{color:C.pD,fontSize:15}}>5. 要約</h3>
<p>✓要約ボタンで録音を停止し、AIがカルテ形式で要約します。結果は自動でクリップボードにコピーされます。</p>
<h3 style={{color:C.pD,fontSize:15}}>6. 小窓（PiP）</h3>
<p>🌟ボタンで最前面に固定される小窓を表示。電子カルテを操作しながら録音・要約ができます。</p>
<h3 style={{color:C.pD,fontSize:15}}>7. 履歴</h3>
<p>過去の要約は自動保存されます。📂履歴ボタンから検索・復元・削除が可能です。</p>
<h3 style={{color:C.pD,fontSize:15}}>8. 設定</h3>
<p>⚙️から誤字脱字修正辞書の管理ができます。皮膚科の薬剤名・施術名が事前登録されています。</p>
</div></div></div>);

// === ABOUT PAGE ===
if(page==="about")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0}}>ℹ️ 機能紹介</h2><button onClick={()=>{setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
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
<h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0}}>📂 診療履歴</h2>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 患者名・ID・内容で検索..." style={{...ib,width:"100%",marginBottom:12,padding:"10px 14px",boxSizing:"border-box"}}/>
{filteredHist.length===0?<p style={{color:C.g400,textAlign:"center",padding:40}}>該当する履歴がありません</p>:
filteredHist.map(h=>(<div key={h.id} style={{...card,marginBottom:10,padding:16,borderLeft:`3px solid ${C.p}`}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
<span style={{fontSize:12,color:C.g500,fontWeight:500}}>{fmD(h.created_at)}</span>
{(h.patient_name||h.patient_id)&&<span style={{fontSize:12,padding:"2px 8px",borderRadius:8,background:"#fef3c7",color:"#92400e",fontWeight:600}}>{h.patient_name||""}{h.patient_id?` (${h.patient_id})`:""}</span>}
<span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:C.pLL,color:C.pD,fontWeight:600}}>{rn(h.room)}</span>
<span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:"#f0fdf4",color:C.rG,fontWeight:600}}>{tn(h.template)}</span>
{(()=>{const cat=h.category||detectCategory(h.room,h.input_text+h.output_text,h.template);const ci=CATEGORIES.find(c=>c.id===cat);return ci?<span style={{fontSize:10,padding:"2px 6px",borderRadius:8,background:ci.bg,color:ci.color,fontWeight:600}}>{ci.label}</span>:null})()}
</div>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>{sInp(h.input_text);sOut(h.output_text);sPName(h.patient_name||"");sPId(h.patient_id||"");setPage("main")}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>📂 開く</button>
<button onClick={()=>cp(h.output_text)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>📋</button>
<button onClick={()=>delRecord(h.id)} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #fecaca",background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer",color:C.err}}>🗑</button></div></div>
<div style={{fontSize:13,color:C.g700,lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:80,overflow:"hidden"}}>{h.output_text}</div></div>))}
</div>);

// === DOC GENERATION ===
if(page==="doc")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0}}>📄 説明資料の作成</h2><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>疾患名や施術名を入力すると、当院の診療履歴をAIが参照して患者向け説明資料を自動生成します。</p>
<div style={{display:"flex",gap:8,marginBottom:12,flexDirection:mob?"column":"row"}}>
<input value={docDisease} onChange={e=>setDocDisease(e.target.value)} placeholder="疾患名・施術名を入力（例：アトピー性皮膚炎、ポテンツァ）" style={{...ib,flex:1,padding:"10px 14px",fontSize:14}}/>
<button onClick={generateDoc} disabled={docLd||!docDisease.trim()} style={{padding:"10px 20px",borderRadius:14,border:"none",background:docLd?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!docDisease.trim()?0.45:1}}>
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
{/* 当院一覧表セクション */}
<div style={{marginTop:24,paddingTop:20,borderTop:`2px solid ${C.g200}`}}>
<h3 style={{fontSize:mob?15:16,fontWeight:700,color:C.pDD,marginBottom:8}}>📋 当院 薬剤・施術・製品 一覧表</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:12}}>テキストファイルや過去の診療記録から、当院で使用している薬剤・施術・製品を自動抽出します。<br/><span style={{color:C.err,fontWeight:600}}>⚠️ AI抽出後に必ず内容を確認・修正してから保存してください</span></p>
<div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
<div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)importListFile(f)}} onClick={()=>{const i=document.createElement("input");i.type="file";i.accept=".txt,.csv,.tsv,.text";i.onchange=e=>{const f=e.target.files[0];if(f)importListFile(f)};i.click()}} style={{padding:"8px 16px",borderRadius:10,border:`2px dashed ${C.p}`,background:C.pLL,fontSize:12,color:C.pD,fontWeight:600,fontFamily:"inherit",cursor:"pointer"}}>📁 ファイルをアップロード</div>
<button onClick={()=>generateList("records")} disabled={listLd} style={{padding:"8px 16px",borderRadius:10,border:"none",background:listLd?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>🔍 過去の記録から抽出</button>
</div>
<textarea value={listInput} onChange={e=>setListInput(e.target.value)} placeholder={"薬剤・施術・製品の情報をペーストしてください。\n例：\nリンデロン-VG軟膏 1日2回 湿疹・皮膚炎\nアンテベート軟膏 1日2回 アトピー性皮膚炎\nポテンツァ ニードルRF 毛穴・ニキビ跡\nゼオスキンヘルス ミラミン 肝斑"} rows={4} style={{width:"100%",padding:10,borderRadius:10,border:`1.5px solid ${C.g200}`,fontSize:13,color:C.g700,fontFamily:"inherit",resize:"vertical",lineHeight:1.6,boxSizing:"border-box",marginBottom:10}}/>
<button onClick={()=>generateList("input")} disabled={listLd||!listInput.trim()} style={{width:"100%",padding:"10px 24px",borderRadius:14,border:"none",background:listLd?C.g200:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",marginBottom:10,opacity:listLd||!listInput.trim()?0.45:1}}>
{listLd?"⏳ AI抽出中...":"📋 一覧表を生成"}</button>
{listMsg&&<div style={{padding:"8px 14px",borderRadius:10,background:listMsg.includes("✅")?C.pLL:listMsg.includes("エラー")?"#fef2f2":C.g50,border:`1px solid ${listMsg.includes("✅")?C.p+"44":listMsg.includes("エラー")?"#fecaca":C.g200}`,fontSize:12,fontWeight:600,color:listMsg.includes("✅")?C.pD:listMsg.includes("エラー")?C.err:C.g500,marginBottom:10}}>{listMsg}</div>}
{listLd&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIがテキストから薬剤・施術・製品を抽出中...</span></div>}
{listOut&&<div>
<div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
{[
{id:"medicine",label:"💊 薬剤",count:listOut.medicine?.length||0},
{id:"procedure",label:"✨ 施術・機器",count:listOut.procedure?.length||0},
{id:"product",label:"🛍 販売製品",count:listOut.product?.length||0},
{id:"surgery",label:"🔧 処置・手術",count:listOut.surgery?.length||0},
{id:"disease_rx",label:"📖 疾患別処方",count:listOut.disease_rx?.length||0},
].map(t=>(<button key={t.id} onClick={()=>setListTab(t.id)} style={{padding:"5px 10px",borderRadius:10,border:listTab===t.id?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:listTab===t.id?C.pLL:C.w,fontSize:mob?10:11,fontWeight:listTab===t.id?700:500,color:listTab===t.id?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{t.label}({t.count})</button>))}
</div>
<div style={{padding:"8px 12px",borderRadius:10,background:"#fef3c7",border:"1px solid #fcd34d",fontSize:12,color:"#92400e",fontWeight:600,marginBottom:10}}>
⚠️ 確認フロー：各項目の内容を確認 → ✓ボタンで確認済みにする → 「確認済みを保存」で保存
</div>
<div style={{overflowX:"auto",marginBottom:12}}>
<table style={{width:"100%",borderCollapse:"collapse",fontSize:mob?11:12}}>
<thead><tr style={{background:C.pLL}}>
<th style={{padding:"6px 8px",textAlign:"left",borderBottom:`2px solid ${C.p}`,fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}>確認</th>
<th style={{padding:"6px 8px",textAlign:"left",borderBottom:`2px solid ${C.p}`,fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}>{listTab==="disease_rx"?"疾患名":"名称"}</th>
<th style={{padding:"6px 8px",textAlign:"left",borderBottom:`2px solid ${C.p}`,fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}>{listTab==="disease_rx"?"第一選択":"詳細・規格"}</th>
<th style={{padding:"6px 8px",textAlign:"left",borderBottom:`2px solid ${C.p}`,fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}>{listTab==="disease_rx"?"代替・追加":"対象疾患"}</th>
<th style={{padding:"6px 8px",textAlign:"left",borderBottom:`2px solid ${C.p}`,fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}>{listTab==="disease_rx"?"処方パターン":"用法・頻度"}</th>
<th style={{padding:"6px 8px",textAlign:"left",borderBottom:`2px solid ${C.p}`,fontWeight:700,color:C.pD,whiteSpace:"nowrap"}}>備考</th>
</tr></thead>
<tbody>
{(listOut[listTab]||[]).map((item,i)=>(<tr key={i} style={{borderBottom:`1px solid ${C.g100}`,background:listVerified[item.name]===true?"#f0fdf4":listVerified[item.name]===false?"#fef2f2":C.w}}>
<td style={{padding:"6px 8px",whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
<button onClick={()=>setListVerified(v=>({...v,[item.name]:v[item.name]===true?undefined:true}))} style={{padding:"2px 6px",borderRadius:6,border:listVerified[item.name]===true?`2px solid ${C.rG}`:`1px solid ${C.g200}`,background:listVerified[item.name]===true?"#dcfce7":C.w,fontSize:10,fontFamily:"inherit",cursor:"pointer",color:listVerified[item.name]===true?C.rG:C.g400}}>✓</button>
<button onClick={()=>setListVerified(v=>({...v,[item.name]:v[item.name]===false?undefined:false}))} style={{padding:"2px 6px",borderRadius:6,border:listVerified[item.name]===false?`2px solid ${C.err}`:`1px solid ${C.g200}`,background:listVerified[item.name]===false?"#fef2f2":C.w,fontSize:10,fontFamily:"inherit",cursor:"pointer",color:listVerified[item.name]===false?C.err:C.g400}}>✕</button>
</div></td>
<td style={{padding:"6px 8px",fontWeight:700,color:C.g900}}><input value={item.name} onChange={e=>{const u={...listOut};u[listTab]=[...u[listTab]];u[listTab][i]={...u[listTab][i],name:e.target.value};setListOut(u)}} style={{border:"none",background:"transparent",fontWeight:700,fontSize:12,color:C.g900,width:"100%",outline:"none",fontFamily:"inherit"}}/></td>
<td style={{padding:"6px 8px",color:C.g700}}><input value={item.details||""} onChange={e=>{const u={...listOut};u[listTab]=[...u[listTab]];u[listTab][i]={...u[listTab][i],details:e.target.value};setListOut(u)}} style={{border:"none",background:"transparent",fontSize:11,color:C.g700,width:"100%",outline:"none",fontFamily:"inherit"}}/></td>
<td style={{padding:"6px 8px",color:C.g500}}><input value={item.diseases||""} onChange={e=>{const u={...listOut};u[listTab]=[...u[listTab]];u[listTab][i]={...u[listTab][i],diseases:e.target.value};setListOut(u)}} style={{border:"none",background:"transparent",fontSize:11,color:C.g500,width:"100%",outline:"none",fontFamily:"inherit"}}/></td>
<td style={{padding:"6px 8px",color:C.g500}}><input value={item.usage||""} onChange={e=>{const u={...listOut};u[listTab]=[...u[listTab]];u[listTab][i]={...u[listTab][i],usage:e.target.value};setListOut(u)}} style={{border:"none",background:"transparent",fontSize:11,color:C.g500,width:"100%",outline:"none",fontFamily:"inherit"}}/></td>
<td style={{padding:"6px 8px",color:C.g400}}><input value={item.notes||""} onChange={e=>{const u={...listOut};u[listTab]=[...u[listTab]];u[listTab][i]={...u[listTab][i],notes:e.target.value};setListOut(u)}} style={{border:"none",background:"transparent",fontSize:11,color:C.g400,width:"100%",outline:"none",fontFamily:"inherit"}}/></td>
</tr>))}
</tbody></table>
</div>
<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
<button onClick={()=>{
const allItems=["medicine","procedure","product","surgery","disease_rx"].flatMap(cat=>(listOut[cat]||[]).map(item=>({...item,category:cat})));
saveAllVerified(allItems);
}} style={{padding:"10px 20px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>💾 確認済みを保存</button>
<button onClick={()=>{
const allItems=["medicine","procedure","product","surgery","disease_rx"].flatMap(cat=>(listOut[cat]||[]).filter(item=>listVerified[item.name]!==false));
const text=allItems.map(item=>`${item.name}\t${item.details||""}\t${item.diseases||""}\t${item.usage||""}\t${item.notes||""}`).join("\n");
navigator.clipboard.writeText("名称\t詳細\t疾患\t用法\t備考\n"+text);
setListMsg("📋 一覧表をコピーしました（タブ区切り・Excel貼り付け可）");
}} style={{padding:"10px 20px",borderRadius:14,border:`2px solid ${C.p}`,background:C.w,color:C.pD,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー（Excel用）</button>
</div>
{listSaved.length>0&&<div style={{marginTop:16,paddingTop:12,borderTop:`1px solid ${C.g200}`}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>💾 保存済み一覧（{listSaved.length}件）</span>
<button onClick={loadClinicItems} style={{padding:"3px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer",color:C.g500}}>🔄 更新</button>
</div>
<div style={{maxHeight:200,overflow:"auto"}}>
{["medicine","procedure","product","surgery","disease_rx"].map(cat=>{const items=listSaved.filter(s=>s.category===cat);if(!items.length)return null;const catLabel={"medicine":"💊 薬剤","procedure":"✨ 施術","product":"🛍 製品","surgery":"🔧 処置","disease_rx":"📖 疾患別"}[cat]||cat;return(<div key={cat} style={{marginBottom:8}}>
<div style={{fontSize:11,fontWeight:700,color:C.pD,marginBottom:3}}>{catLabel}（{items.length}件）</div>
<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{items.map((s,j)=>(<span key={j} style={{padding:"2px 8px",borderRadius:6,background:s.verified?C.pLL:C.g50,border:`1px solid ${s.verified?C.p+"44":C.g200}`,fontSize:10,fontWeight:600,color:s.verified?C.pD:C.g500}}>{s.verified?"✓ ":""}{s.name}</span>))}</div>
</div>)})}
</div>
</div>}
</div>}
</div></div>);

// === MINUTES ===
if(page==="minutes")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0}}>📝 議事録まとめ</h2><button onClick={()=>{minStop();setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<p style={{fontSize:13,color:C.g500,marginBottom:12}}>会議やミーティングを録音・書き起こしし、AIが議事録を自動作成します。</p>
<textarea value={minPrompt} onChange={e=>setMinPrompt(e.target.value)} placeholder="AIへの追加指示（任意）：例「院内勉強会の形式で」「スタッフミーティング用に簡潔に」" rows={2} style={{...ib,width:"100%",padding:"8px 12px",fontSize:13,marginBottom:10,resize:"vertical",boxSizing:"border-box"}}/>
<div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
<span style={{fontSize:24,fontWeight:700,fontVariantNumeric:"tabular-nums",color:C.pD}}>{String(Math.floor(minEl/60)).padStart(2,"0")}:{String(minEl%60).padStart(2,"0")}</span>
{minRS==="inactive"?<button onClick={minGo} style={{padding:"10px 24px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>🎙 録音開始</button>:
<><button onClick={minSum} style={{padding:"10px 20px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>✓ 要約</button>
<button onClick={minStop} style={{padding:"10px 16px",borderRadius:14,border:"none",background:C.err,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>⏹ 停止</button></>}
<span style={{fontSize:12,color:minRS==="recording"?C.rG:C.g400,fontWeight:600}}>{minRS==="recording"?"● 録音中":"停止"}</span></div>
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
</div></div>);

// === COUNSELING ANALYSIS ===
if(page==="counsel")return(<div style={{maxWidth:mob?"100%":700,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0}}>🧠 カウンセリング分析</h2><button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
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

// === SETTINGS ===
if(page==="settings")return(<div style={{maxWidth:900,margin:"0 auto",padding:mob?"10px 8px":"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
<h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0}}>⚙️ 設定</h2>
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
<input value={sc.key} onChange={e=>{const u=[...shortcuts];u[i]={...u[i],key:e.target.value};setShortcuts(u)}} style={{width:80,padding:"3px 8px",borderRadius:8,border:`1.5px solid ${C.g200}`,fontSize:12,fontFamily:"monospace",fontWeight:700,color:C.pD,background:C.w,textAlign:"center",outline:"none"}}/>
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
<header style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,padding:mob?"8px 10px":"10px 16px",background:`linear-gradient(135deg,${C.pD},${C.p})`,borderRadius:16,boxShadow:`0 4px 16px rgba(13,148,136,.15)`}}>
<div style={{display:"flex",alignItems:"center",gap:8}}>{logoUrl?<img src={logoUrl} alt="logo" style={{width:logoSize,height:logoSize,borderRadius:6,objectFit:"contain"}}/>:<span style={{fontSize:18}}>🩺</span>}<span style={{fontWeight:700,fontSize:mob?12:14,color:C.w}}>南草津皮フ科AIカルテ要約</span></div>
<div style={{display:"flex",alignItems:"center",gap:5}}>{pc>0&&<span style={{fontSize:12,color:C.warn,fontWeight:600}}>⏳</span>}<span style={{fontSize:11,color:st.includes("✓")?"#86efac":"rgba(255,255,255,.7)",fontWeight:st.includes("✓")?600:400}}>{st}</span></div></header>
<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
{[{p:"hist",i:"📂",t:"履歴",f:()=>{loadHist();setPage("hist")}},{p:"settings",i:"⚙️",t:"設定"},{p:"doc",i:"📄",t:"資料作成",f:()=>{loadClinicItems();setPage("doc")}},{p:"minutes",i:"📝",t:"議事録"},{p:"counsel",i:"🧠",t:"分析"},{p:"shortcuts",i:"⌨️",t:"ショートカット"},{p:"manual",i:"📚",t:"マニュアル",f:()=>{loadCatStats();setPage("manual")}},{p:"help",i:"❓",t:"ヘルプ"}].map(m=>(<button key={m.p} onClick={m.f||(()=>setPage(m.p))} style={{padding:mob?"4px 7px":"5px 10px",borderRadius:10,border:`1.5px solid ${C.g200}`,background:C.w,fontSize:mob?10:11,fontWeight:600,fontFamily:"inherit",cursor:"pointer",color:C.pD,display:"flex",alignItems:"center",gap:3}}><span style={{fontSize:14}}>{m.i}</span>{m.t}</button>))}</div>
<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:mob?"nowrap":"wrap",overflowX:mob?"auto":"visible",WebkitOverflowScrolling:"touch",paddingBottom:mob?4:0}}>{R.map(rm=>(<button key={rm.id} onClick={()=>sRid(rm.id)} style={{padding:"5px 10px",borderRadius:10,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:rid===rm.id?`2px solid ${C.pD}`:`1.5px solid ${C.g200}`,background:rid===rm.id?C.pL:C.w,fontWeight:rid===rm.id?700:500,color:rid===rm.id?C.pDD:C.g500,whiteSpace:"nowrap",flexShrink:0}}>{rm.l}</button>))}</div>
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
<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{T.map(t=>(<button key={t.id} onClick={()=>sTid(t.id)} style={{padding:mob?"4px 10px":"5px 12px",borderRadius:20,fontSize:mob?11:12,fontFamily:"inherit",cursor:"pointer",border:tid===t.id?`2px solid ${C.p}`:"2px solid transparent",background:tid===t.id?C.pLL:C.g100,fontWeight:tid===t.id?700:500,color:tid===t.id?C.pD:C.g500,transition:"all 0.15s"}}>{t.name}</button>))}</div>
{shortcuts.some(s=>s.showOnTop&&s.enabled)&&<div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap",padding:"6px 10px",borderRadius:12,background:C.pLL,border:`1px solid ${C.p}22`}}>
<span style={{fontSize:10,color:C.pD,fontWeight:600,alignSelf:"center",marginRight:4}}>⌨️</span>
{shortcuts.filter(s=>s.showOnTop&&s.enabled).map(sc=>(<button key={sc.id} onClick={()=>{
const actions={rec:()=>{if(rsRef.current==="recording"){stop()}else{go()}},sum:()=>sum(),clear:()=>{saveUndo();sInp("");sOut("");sSt("クリアしました")},next:()=>clr(),copy:()=>{if(out)cp(out)},pip:()=>{pipActive?closePip():openPip()},doc:()=>setPage("doc"),counsel:()=>setPage("counsel"),undo:()=>undo(),room1:()=>sRid("r1"),room2:()=>sRid("r2"),room3:()=>sRid("r3"),room4:()=>sRid("r4"),room5:()=>sRid("r5"),room6:()=>sRid("r6"),room7:()=>sRid("r7")};
const fn=actions[sc.id];if(fn)fn();
}} style={{padding:"3px 8px",borderRadius:8,border:`1px solid ${C.p}55`,background:C.w,fontSize:mob?10:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
<span>{sc.label.split(" ")[0]}</span>
<span style={{fontSize:9,padding:"1px 4px",borderRadius:4,background:C.pD,color:C.w,fontFamily:"monospace",fontWeight:700}}>{sc.key}</span>
</button>))}
</div>}
<div style={{...card,position:"relative"}}>
<button onClick={pipActive?closePip:openPip} style={{position:"absolute",top:16,right:16,width:50,height:50,borderRadius:"50%",border:"none",background:pipActive?C.rG:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,boxShadow:pipActive?`0 0 0 3px rgba(34,197,94,.3)`:`0 2px 8px rgba(13,148,136,.25)`}}>
<span style={{fontSize:18}}>🌟</span><span style={{fontSize:9}}>{pipActive?"OFF":"小窓"}</span></button>
<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:16}}>
{rs!=="inactive"&&<span style={{fontSize:28,fontWeight:700,color:rs==="recording"?C.rG:C.warn,fontVariantNumeric:"tabular-nums"}}>{fm(el)}</span>}
{rs==="recording"&&<div style={{width:"60%",height:6,borderRadius:3,background:C.g200,overflow:"hidden"}}><div style={{width:`${lv}%`,height:"100%",background:`linear-gradient(90deg,${C.rG},${C.p})`,borderRadius:3,transition:"width 0.1s"}}/></div>}
<div style={{display:"flex",gap:12,alignItems:"center"}}>
{rs==="inactive"?(<button onClick={go} style={{...rb,width:mob?76:90,height:mob?76:90,background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,boxShadow:`0 4px 14px rgba(13,148,136,.25)`}}><span style={{fontSize:30}}>🎙</span><span style={{fontSize:12}}>録音開始</span></button>):(<>
{rs==="recording"?(<button onClick={pause} style={{...rb,width:60,height:60,background:C.warn,color:"#78350f"}}><span style={{fontSize:22}}>⏸</span></button>):(<button onClick={resume} style={{...rb,width:60,height:60,background:C.rG,color:C.w}}><span style={{fontSize:22}}>▶</span></button>)}
<button onClick={stopSum} style={{...rb,width:80,height:80,background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,boxShadow:`0 4px 14px rgba(13,148,136,.25)`}}><span style={{fontSize:20}}>✓</span><span style={{fontSize:12}}>要約</span></button>
<button onClick={stop} style={{...rb,width:60,height:60,background:C.err,color:C.w}}><span style={{fontSize:22}}>⏹</span></button></>)}
</div>
{rs==="recording"&&<div style={{fontSize:12,color:C.g400}}>🎙 5秒ごとに自動書き起こし</div>}
</div>
<div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><label style={{fontSize:13,fontWeight:700,color:C.g500}}>📝 書き起こし</label><span style={{fontSize:12,color:C.g400}}>{inp.length}文字</span></div>
<textarea value={inp} onChange={e=>sInp(e.target.value)} placeholder="録音ボタンで音声を書き起こし、または直接入力..." style={{width:"100%",height:mob?100:140,padding:mob?10:12,borderRadius:mob?10:14,border:`1.5px solid ${C.g200}`,background:C.g50,fontSize:14,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.7,boxSizing:"border-box"}}/></div>
<div style={{display:"flex",gap:mob?4:8,marginBottom:14,flexWrap:mob?"wrap":"nowrap"}}>
<button onClick={()=>sum()} disabled={ld||!inp.trim()} style={{flex:1,padding:"10px 0",borderRadius:14,border:"none",background:ld?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!inp.trim()?0.45:1,boxShadow:!ld&&inp.trim()?`0 4px 12px rgba(13,148,136,.25)`:"none"}}>{ld?"⏳ 処理中...":"⚡ 要約"}</button>
<button onClick={()=>{saveUndo();sInp("");sOut("");sSt("クリアしました")}} style={{padding:"10px 16px",borderRadius:14,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>🗑</button>
<button onClick={undo} style={{padding:"10px 14px",borderRadius:14,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer",opacity:undoRef.current?1:.35}} title="元に戻す (Ctrl+Z)">↩</button>
<button onClick={clr} style={{padding:"10px 20px",borderRadius:14,border:`2px solid ${C.p}`,background:C.w,fontSize:14,fontWeight:700,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>次へ ▶</button></div>
{out&&<div style={{borderRadius:14,border:`2px solid ${C.pL}`,padding:16,background:`linear-gradient(135deg,${C.pLL},#f0fdf4)`}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontSize:13,fontWeight:700,color:C.pD}}>{ct.name} 要約結果</span><button onClick={()=>cp(out)} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.p}44`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button></div>
<textarea value={out} onChange={e=>sOut(e.target.value)} style={{width:"100%",height:mob?140:180,padding:mob?10:12,borderRadius:mob?10:12,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.7,boxSizing:"border-box"}}/>
{snippets.length>0&&<div style={{marginTop:8}}>
<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:4}}>{snippets.map((sn,i)=>(pipSnippets.includes(i)?<button key={i} onClick={()=>sOut(o=>o+(o?"\n":"")+sn.text)} style={{padding:"4px 10px",borderRadius:10,border:`1.5px solid ${C.p}`,background:C.pLL,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>⭐{sn.title}</button>:null))}</div>
{[...new Set(snippets.map(s=>s.cat||"その他"))].map(cat=>{const items=snippets.map((s,i)=>({...s,idx:i})).filter(s=>(s.cat||"その他")===cat&&!pipSnippets.includes(s.idx));if(!items.length)return null;const isOpen=openCats.includes(cat);return(<div key={cat} style={{marginBottom:2}}>
<button onClick={()=>setOpenCats(o=>o.includes(cat)?o.filter(c=>c!==cat):[...o,cat])} style={{width:"100%",padding:"3px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:isOpen?C.pLL:C.g50,fontSize:11,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{cat}（{items.length}）</span><span>{isOpen?"▼":"▶"}</span></button>
{isOpen&&<div style={{display:"flex",gap:4,flexWrap:"wrap",padding:"4px 0"}}>{items.map(sn=>(<button key={sn.idx} onClick={()=>sOut(o=>o+(o?"\n":"")+sn.text)} style={{padding:"3px 8px",borderRadius:8,border:`1px solid ${C.p}33`,background:C.w,fontSize:11,fontWeight:500,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>{sn.title}</button>))}</div>}
</div>)})}
</div>}
</div>}
{ld&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが要約を作成中...</span></div>}
</div></div>);}