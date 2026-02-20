"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";

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
- 言及なしは「言及なし」
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

const R=[{id:"r1",l:"診察室1",i:"1️⃣"},{id:"r2",l:"診察室2",i:"2️⃣"},{id:"r3",l:"診察室3",i:"3️⃣"},{id:"r4",l:"処置室",i:"🔧"},{id:"r5",l:"美容室",i:"✨"},{id:"r6",l:"カウンセリング",i:"💬"},{id:"r7",l:"その他",i:"📋"}];

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
];

// === MAIN COMPONENT ===
export default function Home(){
const[page,setPage]=useState("main"); // main|room|hist|settings|help|about
const[rs,sRS]=useState("inactive"),[inp,sInp]=useState(""),[out,sOut]=useState(""),[st,sSt]=useState("待機中"),[el,sEl]=useState(0),[ld,sLd]=useState(false),[lv,sLv]=useState(0),[md,sMd]=useState("gemini"),[pc,sPC]=useState(0),[tid,sTid]=useState("soap"),[rid,sRid]=useState("");
const[hist,sHist]=useState([]),[search,setSearch]=useState(""),[pName,sPName]=useState(""),[pId,sPId]=useState("");
const[pipWin,setPipWin]=useState(null),[pipActive,setPipActive]=useState(false);
const[dict,setDict]=useState(DEFAULT_DICT),[newFrom,setNewFrom]=useState(""),[newTo,setNewTo]=useState(""),[dictEnabled,setDictEnabled]=useState(true);
const[logoUrl,setLogoUrl]=useState(""),[logoSize,setLogoSize]=useState(32);
const DEFAULT_SNIPPETS=[
{title:"f/u 1w",text:"f/u 1w後（1週間後再診）"},
{title:"f/u 2w",text:"f/u 2w後（2週間後再診）"},
{title:"f/u 4w",text:"f/u 4w後（4週間後再診）"},
{title:"f/u 2M",text:"f/u 2M後（2ヶ月後再診）"},
{title:"f/u 3M",text:"f/u 3M後（3ヶ月後再診）"},
{title:"経過観察",text:"経過観察。症状増悪時は早めに再診。"},
{title:"処方箋発行",text:"処方箋発行済み"},
{title:"説明同意",text:"治療内容・リスク・副作用について説明し、同意を得た。"},
{title:"写真撮影",text:"臨床写真撮影済み"},
{title:"紹介状",text:"紹介状作成：　病院　科宛"},
{title:"検査オーダー",text:"検査オーダー：血液検査（CBC, CRP）"},
{title:"アレルギー検査",text:"ドロップスクリーン（41種アレルギー検査）施行"},
{title:"皮膚生検",text:"皮膚生検施行。検体を病理組織検査に提出。結果は約2週間後。"},
{title:"粉瘤切除",text:"【手術記録】粉瘤摘出術\n部位：\nサイズ：約 mm\n麻酔：1%キシロカイン（エピ入り） mL局注\n術式：紡錘形切開にて被膜ごと摘出\n止血確認後、 -0ナイロンにて縫合（ 針）\n検体：病理提出\n術後：ゲンタシン軟膏+ガーゼ保護\n抜糸予定：7-10日後"},
{title:"皮膚腫瘍切除",text:"【手術記録】皮膚腫瘍切除術\n部位：\n臨床診断：\nサイズ：約 mm（マージン mm含む）\n麻酔：1%キシロカイン（エピ入り） mL局注\n術式：マーキング後、紡錘形に切除\n止血確認後、真皮縫合+ -0ナイロンにて縫合\n検体：病理提出\n術後：ガーゼ保護\n抜糸予定：7-14日後"},
{title:"切開排膿",text:"【手術記録】切開排膿術\n部位：\n麻酔：1%キシロカイン mL局注\n所見：膿汁排出あり、内容物を十分に排出\nドレナージ：ガーゼドレーン挿入\n術後：ゲンタシン軟膏+ガーゼ保護、毎日洗浄交換\n抗生剤処方："},
{title:"液体窒素",text:"液体窒素凍結療法施行\n部位：\n回数：　回（各 秒程度）\n対象：尋常性疣贅\nf/u 2w後"},
{title:"光線（NB-UVB）",text:"ナローバンドUVB照射\n照射量： mJ/cm²\n部位：\n回数：本日 回目\n皮膚反応：紅斑（-/±/+）\n次回照射量：　mJ/cm²に増量予定"},
{title:"光線（エキシマ）",text:"エキシマライト照射\n照射量： mJ/cm²\n部位：\n回数：本日 回目\n皮膚反応：紅斑（-/±/+）\n次回照射量：　mJ/cm²"},
{title:"デュピクセント",text:"デュピクセント皮下注射施行\n投与量：300mg（初回のみ600mg）\n投与部位：\n副作用確認：注射部位反応（-）、結膜炎（-）\n次回投与：2w後\nEASIスコア："},
{title:"ミチーガ",text:"ミチーガ皮下注射施行\n投与量：60mg\n投与部位：\n副作用確認：注射部位反応（-）\n次回投与：4w後"},
{title:"コセンティクス",text:"コセンティクス皮下注射施行\n投与量：150mg/300mg\n投与部位：\n副作用確認：注射部位反応（-）\n次回投与：（初期は毎週→4w後）\nPASIスコア："},
{title:"ゾレア",text:"ゾレア皮下注射施行\n投与量：300mg\n投与部位：\n副作用確認：注射部位反応（-）、アナフィラキシー（-）\n次回投与：4w後\nUAS7スコア："},
{title:"スキリージ",text:"スキリージ皮下注射施行\n投与量：150mg\n投与部位：\n副作用確認：注射部位反応（-）\n次回投与：（初期12w→8w後）\nPASIスコア："},
{title:"ノーリス",text:"ノーリス（IPL光治療）施行\n照射部位：顔全体\nフィルター：\nフルエンス：\nパス数：\n冷却：施行\n術後：日焼け止め塗布・保湿指導"},
{title:"ポテンツァ",text:"ポテンツァ施行\nチップ：\n部位：\n出力：\nパス数：\n麻酔：表面麻酔クリーム（ mm塗布 分待機）\n術後：鎮静パック施行、保湿・遮光指導"},
{title:"メソナJ",text:"メソナJ施行\nコース：トータル美容/美肌コース\n導入成分：\n部位：顔全体（目元含む）\n施術時間：約 分\n術後：特記事項なし"},
{title:"ピーリング",text:"サリチル酸マクロゴールピーリング施行\n部位：顔全体\n塗布時間：5分\n皮膚反応：軽度発赤（±）\n術後：保湿・遮光指導"},
{title:"外用指導",text:"外用指導：1日2回（朝・入浴後）患部に薄く塗布。改善後は1日1回に減量可。"},
{title:"保湿指導",text:"保湿指導：1日2回以上、入浴後すぐに保湿剤を全身に塗布。こすらず押さえるように。"},
{title:"遮光指導",text:"遮光指導：日焼け止め（SPF30以上）を毎日塗布。2-3時間おきに塗り直し。"},
{title:"外用FTU",text:"外用量目安（FTU）：人差し指の先端から第一関節まで（約0.5g）で手のひら2枚分の面積に塗布。"},
{title:"重ね塗り順序",text:"外用順序：①保湿剤を広範囲に塗布→②ステロイド外用薬を患部のみに重ね塗り"},
{title:"プロアクティブ",text:"プロアクティブ療法：症状改善後も週2-3回の外用を継続。再燃予防のため自己判断で中止しない。徐々に週1回→隔週と間隔を延長。"},
{title:"ステロイド漸減",text:"ステロイド漸減：\n1-2週目：1日2回\n3-4週目：1日1回\n5-6週目：2日に1回\n以降：週2-3回（プロアクティブ療法へ移行）"},
{title:"抗ヒス内服指導",text:"抗ヒスタミン薬：毎日決まった時間に服用。症状なくても自己判断で中止せず継続。眠気あれば就寝前に服用。"},
{title:"帯状疱疹指導",text:"帯状疱疹指導：抗ウイルス薬5-7日間確実に内服。水疱は清潔に保ち破らない。疼痛持続時は早めに相談。水痘未罹患の乳幼児・妊婦との接触を避ける。"},
{title:"術後注意（縫合）",text:"術後注意（縫合創）：\n・当日は安静、飲酒・激しい運動控える\n・翌日からシャワー可（洗浄後、軟膏+ガーゼ保護）\n・湯船は抜糸まで不可\n・出血時は清潔なガーゼで圧迫し連絡\n・抜糸予定：　日後"},
{title:"術後注意（切開）",text:"術後注意（切開排膿後）：\n・毎日シャワーで洗浄→軟膏+ガーゼ交換\n・膿や浸出液は正常な経過\n・発熱・腫れ拡大時は早めに受診\n・抗生剤は最後まで内服"},
{title:"施術後（レーザー）",text:"施術後注意（レーザー）：\n・赤み腫れは数日で改善\n・24h洗顔・化粧控える\n・かさぶたを剥がさない\n・日焼け止め必須\n・保湿十分に\n・こすらない（色素沈着予防）"},
{title:"施術後（IPL）",text:"施術後注意（ノーリス/IPL）：\n・シミが一時的に濃くなる→1-2wで剥がれる\n・当日から洗顔メイク可\n・日焼け止め必須\n・1w刺激の強い化粧品を避ける"},
{title:"施術後（ポテンツァ）",text:"施術後注意（ポテンツァ）：\n・赤み腫れ点状出血→2-3日で改善\n・当日洗顔メイク不可、翌日から可\n・24h飲酒・運動・入浴控える\n・日焼け止め必須"},
{title:"施術後（ピーリング）",text:"施術後注意（ピーリング）：\n・当日から洗顔メイク可\n・数日間皮むけ乾燥あり\n・保湿十分に・日焼け止め必須\n・1wスクラブ使用不可"},
{title:"ゼオスキン開始",text:"ゼオスキンヘルス開始\nコース：\n製品：\n注意：A反応（赤み皮むけ乾燥）は2-6wで改善。日焼け止め必須。妊娠授乳中はトレチノイン使用不可。"},
{title:"イソトレチノイン",text:"イソトレチノイン内服開始　mg/日\n注意：避妊必須（女性：前1M〜後1M）、献血不可、定期血液検査（肝機能・脂質）、保湿（唇・皮膚・眼の乾燥対策）\n次回血液検査：4w後"},
{title:"帯状疱疹ワクチン",text:"帯状疱疹ワクチン（シングリックス）説明：\n・不活化ワクチン、2回接種（2ヶ月間隔）\n・予防効果90%以上、50歳以上対象\n・接種部位の痛み腫れは数日で改善"},
];
const[snippets,setSnippets]=useState(DEFAULT_SNIPPETS),[newSnTitle,setNewSnTitle]=useState(""),[newSnText,setNewSnText]=useState("");
const mR=useRef(null),msR=useRef(null),acR=useRef(null),anR=useRef(null),laR=useRef(null),tR=useRef(null),cR=useRef(null),iR=useRef("");
const pipRef=useRef(null),elRef=useRef(0),lvRef=useRef(0),rsRef=useRef("inactive"),pNameRef=useRef(""),pIdRef=useRef("");
useEffect(()=>{iR.current=inp},[inp]);
useEffect(()=>{elRef.current=el},[el]);
useEffect(()=>{lvRef.current=lv},[lv]);
useEffect(()=>{rsRef.current=rs},[rs]);
useEffect(()=>{pNameRef.current=pName},[pName]);
useEffect(()=>{pIdRef.current=pId},[pId]);
useEffect(()=>{if(rs==="recording"){tR.current=setInterval(()=>sEl(t=>t+1),1000)}else{clearInterval(tR.current);if(rs==="inactive")sEl(0)}return()=>clearInterval(tR.current)},[rs]);
useEffect(()=>{const id=setInterval(()=>{if(!pipRef.current)return;const d=pipRef.current;const t=d.getElementById("pip-timer"),l=d.getElementById("pip-level"),s=d.getElementById("pip-status");if(t){const e=elRef.current;t.textContent=`${String(Math.floor(e/60)).padStart(2,"0")}:${String(e%60).padStart(2,"0")}`}if(l)l.style.width=`${lvRef.current}%`;if(s){const r=rsRef.current;s.textContent=r==="recording"?"録音中":r==="paused"?"一時停止":"停止";s.style.color=r==="recording"?C.rG:r==="paused"?C.warn:C.g400}},500);return()=>clearInterval(id)},[]);

const fm=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const ct=T.find(t=>t.id===tid)||T[0],cr=R.find(r=>r.id===rid);

// Supabase
const saveRecord=async(input,output)=>{if(!supabase)return;try{await supabase.from("records").insert({room:rid,template:tid,ai_model:md,input_text:input,output_text:output,patient_name:pNameRef.current,patient_id:pIdRef.current})}catch(e){console.error("Save error:",e)}};
const loadHist=async()=>{if(!supabase)return;try{const{data}=await supabase.from("records").select("*").order("created_at",{ascending:false}).limit(50);if(data)sHist(data)}catch(e){console.error("Load error:",e)}};
const delRecord=async(id)=>{if(!supabase)return;try{await supabase.from("records").delete().eq("id",id);sHist(h=>h.filter(r=>r.id!==id))}catch(e){console.error("Delete error:",e)}};
const filteredHist=hist.filter(h=>{if(!search.trim())return true;const s=search.toLowerCase();return(h.patient_name||"").toLowerCase().includes(s)||(h.patient_id||"").toLowerCase().includes(s)||(h.output_text||"").toLowerCase().includes(s)});

// Dict
const applyDict=(text)=>{if(!dictEnabled||!text)return text;let r=text;for(const[from,to] of dict){if(from&&to&&from!==to){r=r.split(from).join(to)}}return r};

// Audio
const sAM=async()=>{try{const s=await navigator.mediaDevices.getUserMedia({audio:true});msR.current=s;const c=new(window.AudioContext||window.webkitAudioContext)(),sr=c.createMediaStreamSource(s),a=c.createAnalyser();a.fftSize=256;a.smoothingTimeConstant=0.7;sr.connect(a);acR.current=c;anR.current=a;const d=new Uint8Array(a.frequencyBinCount),tk=()=>{if(!anR.current)return;anR.current.getByteFrequencyData(d);let sm=0;for(let i=0;i<d.length;i++)sm+=d[i];sLv(Math.min(100,Math.round((sm/d.length/128)*100)));laR.current=requestAnimationFrame(tk)};laR.current=requestAnimationFrame(tk);return s}catch{sSt("マイク取得失敗");return null}};
const xAM=()=>{if(laR.current)cancelAnimationFrame(laR.current);laR.current=null;if(acR.current){try{acR.current.close()}catch{}}acR.current=null;if(msR.current){msR.current.getTracks().forEach(t=>t.stop())}msR.current=null;anR.current=null;sLv(0)};
const tc=async(b)=>{if(b.size<500)return;sPC(p=>p+1);sSt("🔄 書き起こし中...");try{const f=new FormData();f.append("audio",b,"audio.webm");const r=await fetch("/api/transcribe",{method:"POST",body:f}),d=await r.json();if(d.text&&d.text.trim()){const fixed=applyDict(d.text.trim());sInp(p=>p+(p?"\n":"")+fixed);sSt("録音中 ✓")}else{sSt("録音中")}}catch{sSt("録音中（エラー）")}finally{sPC(p=>Math.max(0,p-1))}};
const cMR=(s)=>{const m=new MediaRecorder(s,{mimeType:MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm"});m.ondataavailable=(e)=>{if(e.data.size>0)tc(e.data)};return m};
const go=async()=>{const s=await sAM();if(!s)return;sRS("recording");sSt("録音中");const m=cMR(s);m.start();mR.current=m;cR.current=setInterval(()=>{if(mR.current&&mR.current.state==="recording"){mR.current.stop();const m2=cMR(s);m2.start();mR.current=m2}},5000)};
const stop=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording")mR.current.stop();mR.current=null;xAM();sRS("inactive");sSt("待機中")};
const pause=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording")mR.current.stop();sRS("paused");sSt("一時停止")};
const resume=()=>{if(!msR.current)return;sRS("recording");sSt("録音中");const m=cMR(msR.current);m.start();mR.current=m;cR.current=setInterval(()=>{if(mR.current&&mR.current.state==="recording"){mR.current.stop();const m2=cMR(msR.current);m2.start();mR.current=m2}},5000)};
const sum=async(tx)=>{const t=tx||iR.current;if(!t.trim()){sSt("テキストを入力してください");return}sLd(true);sSt(md==="claude"?"Claude で要約中...":"Gemini で要約中...");try{const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t,mode:md,prompt:ct.prompt})}),d=await r.json();if(d.error){sSt("エラー: "+d.error);return}sOut(d.summary);await saveRecord(t,d.summary);try{await navigator.clipboard.writeText(d.summary);sSt("要約完了・保存済み ✓")}catch{sSt("要約完了・保存済み")}}catch{sSt("エラーが発生しました")}finally{sLd(false)}};
const stopSum=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording"){const cr2=mR.current;cr2.ondataavailable=async(e)=>{if(e.data.size>0){const f=new FormData();f.append("audio",e.data,"audio.webm");try{const r=await fetch("/api/transcribe",{method:"POST",body:f}),d=await r.json();if(d.text&&d.text.trim()){const ft=iR.current+(iR.current?"\n":"")+applyDict(d.text.trim());sInp(ft);setTimeout(()=>sum(ft),300)}else{sum()}}catch{sum()}}else{sum()}};cr2.stop()}else{sum()}mR.current=null;xAM();sRS("inactive")};
const clr=()=>{sInp("");sOut("");sSt("待機中");sEl(0);sPName("");sPId("")};
const cp=async(t)=>{try{await navigator.clipboard.writeText(t);sSt("コピー済み ✓")}catch{}};

// PiP
const openPip=useCallback(async()=>{try{if(!("documentPictureInPicture" in window)){sSt("Chrome 116以降で利用可能です");return}
const pw=await window.documentPictureInPicture.requestWindow({width:200,height:90});
const rm=R.find(r=>r.id===rid);const rmName=rm?`${rm.i}${rm.l}`:"";
pw.document.body.style.margin="0";pw.document.body.style.overflow="hidden";
pw.document.body.innerHTML=`<div style="font-family:sans-serif;background:linear-gradient(135deg,#3d5a1e,#567d2a);color:#fff;padding:5px 8px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:3px">
<div style="display:flex;align-items:center;gap:4px"><span style="font-size:9px;opacity:.5">${rmName}</span>
<input id="pip-pid" placeholder="患者ID" value="" style="flex:1;padding:1px 5px;border-radius:4px;border:none;font-size:9px;background:rgba(255,255,255,.15);color:#fff;outline:none"/>
<span id="pip-status" style="font-size:9px;font-weight:600;color:#94a3b8">停止</span></div>
<div style="display:flex;align-items:center;gap:6px"><div id="pip-timer" style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums">00:00</div>
<div style="flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden"><div id="pip-level" style="width:0%;height:100%;background:#22c55e;border-radius:2px;transition:width 0.15s"></div></div></div>
<div style="display:flex;gap:4px;justify-content:center">
<button id="pip-rec" style="padding:2px 14px;border-radius:8px;border:none;background:#4a9e5c;color:#1a4d24;font-size:13px;font-weight:700;cursor:pointer">開始</button>
<button id="pip-pause" style="padding:2px 10px;border-radius:8px;border:none;background:#fbbf24;color:#78350f;font-size:13px;font-weight:700;cursor:pointer;display:none">一時停止</button>
<button id="pip-sum" style="padding:2px 10px;border-radius:8px;border:none;background:#567d2a;color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:none">要約</button>
<button id="pip-stop" style="padding:2px 10px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:none">停止</button></div></div>`;
pw.document.head.innerHTML=`<style>::placeholder{color:rgba(255,255,255,.35)}</style>`;
const pipPiEl=pw.document.getElementById("pip-pid");if(pipPiEl){pipPiEl.value=pId;pipPiEl.addEventListener("input",e=>{sPId(e.target.value)})}
const pipBtnUpdate=()=>{const d=pipRef.current;if(!d)return;const r=rsRef.current;const rb=d.getElementById("pip-rec"),pb=d.getElementById("pip-pause"),sb=d.getElementById("pip-stop"),smb=d.getElementById("pip-sum");if(!rb)return;rb.style.display=r==="inactive"?"inline-block":"none";pb.style.display=r!=="inactive"?"inline-block":"none";if(r==="recording"){pb.textContent="一時停止";pb.style.background="#fbbf24";pb.style.color="#78350f"}else if(r==="paused"){pb.textContent="再開";pb.style.background="#22c55e";pb.style.color="#fff"}sb.style.display=r!=="inactive"?"inline-block":"none";smb.style.display=r!=="inactive"?"inline-block":"none"};
pw.document.getElementById("pip-rec").onclick=()=>{go();setTimeout(pipBtnUpdate,500)};
pw.document.getElementById("pip-pause").onclick=()=>{if(rsRef.current==="recording"){pause()}else{resume()}setTimeout(pipBtnUpdate,300)};
pw.document.getElementById("pip-stop").onclick=()=>{stop();setTimeout(pipBtnUpdate,300)};
pw.document.getElementById("pip-sum").onclick=()=>{stopSum();setTimeout(pipBtnUpdate,500)};
pipRef.current=pw.document;setPipWin(pw);setPipActive(true);
const btnLoop=setInterval(()=>{if(!pipRef.current){clearInterval(btnLoop);return}pipBtnUpdate()},600);
pw.addEventListener("pagehide",()=>{clearInterval(btnLoop);pipRef.current=null;setPipWin(null);setPipActive(false)});
}catch(e){console.error("PiP error:",e);sSt("小窓を開けませんでした")}
},[rid,pId]);
const closePip=useCallback(()=>{if(pipWin){pipWin.close()}pipRef.current=null;setPipWin(null);setPipActive(false)},[pipWin]);

// Helpers
const fmD=(d)=>{const dt=new Date(d);return `${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2,"0")}`};
const tn=(id)=>{const t=T.find(x=>x.id===id);return t?t.name:id};
const rn=(id)=>{const r=R.find(x=>x.id===id);return r?`${r.i}${r.l}`:id};

// Styles
const btn=(bg,color,extra)=>({padding:"8px 18px",borderRadius:14,border:"none",background:bg,color,fontSize:14,fontWeight:600,fontFamily:"inherit",cursor:"pointer",...extra});
const ib={padding:"8px 12px",borderRadius:12,border:`1.5px solid ${C.g200}`,fontSize:13,fontFamily:"inherit",outline:"none",background:C.w,color:C.g900,transition:"border-color 0.2s"};
const card={background:C.w,borderRadius:20,padding:"20px",boxShadow:"0 2px 16px rgba(13,148,136,.08)"};
const rb={width:70,height:70,borderRadius:"50%",border:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,fontFamily:"inherit",fontWeight:700,fontSize:10,cursor:"pointer"};
const titleRow=()=>(<div style={{display:"flex",alignItems:"center",gap:8}}>{logoUrl&&<img src={logoUrl} alt="logo" style={{width:logoSize,height:logoSize,borderRadius:8,objectFit:"contain"}}/>}<span style={{fontWeight:700,fontSize:15,color:C.w}}>南草津皮フ科AIカルテ要約</span></div>);

// === ROOM SELECT ===
if(!rid)return(<div style={{maxWidth:600,margin:"0 auto",padding:"40px 16px"}}>
<div style={{background:`linear-gradient(135deg,${C.pD},${C.p})`,borderRadius:24,padding:"40px 24px",boxShadow:`0 8px 32px rgba(13,148,136,.2)`,textAlign:"center"}}>
<div style={{width:48,height:48,borderRadius:16,background:"rgba(255,255,255,.2)",margin:"0 auto 16px",display:"flex",alignItems:"center",justifyContent:"center"}}>{logoUrl?<img src={logoUrl} alt="logo" style={{width:32,height:32,borderRadius:6,objectFit:"contain"}}/>:<span style={{fontSize:24}}>🩺</span>}</div>
<h1 style={{fontSize:20,fontWeight:700,color:C.w,marginBottom:4}}>南草津皮フ科AIカルテ要約</h1>
<p style={{fontSize:14,color:"rgba(255,255,255,.8)",marginBottom:28}}>部屋を選択してください</p>
<div style={{display:"flex",flexWrap:"wrap",gap:10,justifyContent:"center"}}>{R.map(rm=>(<button key={rm.id} onClick={()=>sRid(rm.id)} style={{padding:"14px 20px",borderRadius:14,border:"none",background:"rgba(255,255,255,.95)",fontSize:14,fontWeight:600,fontFamily:"inherit",cursor:"pointer",display:"flex",alignItems:"center",gap:8,minWidth:140,boxShadow:"0 2px 8px rgba(0,0,0,.08)",transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}><span style={{fontSize:20}}>{rm.i}</span>{rm.l}</button>))}</div>
<div style={{marginTop:24,display:"flex",gap:10,justifyContent:"center"}}>
<button onClick={()=>{sRid("_");setPage("help")}} style={{padding:"8px 16px",borderRadius:12,border:"1px solid rgba(255,255,255,.3)",background:"transparent",color:C.w,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>📖 使い方</button>
<button onClick={()=>{sRid("_");setPage("about")}} style={{padding:"8px 16px",borderRadius:12,border:"1px solid rgba(255,255,255,.3)",background:"transparent",color:C.w,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>ℹ️ 機能紹介</button>
</div></div></div>);

// === HELP PAGE ===
if(page==="help")return(<div style={{maxWidth:700,margin:"0 auto",padding:"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0}}>📖 使い方ガイド</h2><button onClick={()=>{sRid("");setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
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
if(page==="about")return(<div style={{maxWidth:700,margin:"0 auto",padding:"20px 16px"}}><div style={card}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0}}>ℹ️ 機能紹介</h2><button onClick={()=>{sRid("");setPage("main")}} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
<div style={{fontSize:14,color:C.g700,lineHeight:2}}>
<h3 style={{color:C.pD}}>🎙 リアルタイム音声書き起こし</h3><p>OpenAI Whisper APIによる高精度な日本語音声認識。5秒間隔で自動書き起こし。</p>
<h3 style={{color:C.pD}}>🤖 AI要約（2モデル対応）</h3><p>Gemini 2.5 FlashまたはClaude Sonnet 4.5でカルテ形式に自動要約。</p>
<h3 style={{color:C.pD}}>📋 6種類のテンプレート</h3><p>ASOP・疾患名・美容・処置・経過・フリー。複数疾患の自動分離にも対応。</p>
<h3 style={{color:C.pD}}>🗣 話者分離</h3><p>会話内容から医師と患者の発言を自動判別し、適切な項目に振り分けます。</p>
<h3 style={{color:C.pD}}>📖 誤字脱字修正辞書</h3><p>皮膚科の薬剤名・施術名・疾患名を事前登録。書き起こし時に自動修正。</p>
<h3 style={{color:C.pD}}>🌟 PiP小窓</h3><p>最前面固定の小窓で、電子カルテ操作中も録音・要約が可能。</p>
<h3 style={{color:C.pD}}>💾 クラウド履歴</h3><p>Supabaseによる自動保存。患者名・IDで検索可能。</p>
</div></div></div>);

// === HISTORY ===
if(page==="hist")return(<div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px"}}>
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
<span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:"#f0fdf4",color:C.rG,fontWeight:600}}>{tn(h.template)}</span></div>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>{sInp(h.input_text);sOut(h.output_text);sPName(h.patient_name||"");sPId(h.patient_id||"");setPage("main")}} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>📂 開く</button>
<button onClick={()=>cp(h.output_text)} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>📋</button>
<button onClick={()=>delRecord(h.id)} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #fecaca",background:C.w,fontSize:11,fontFamily:"inherit",cursor:"pointer",color:C.err}}>🗑</button></div></div>
<div style={{fontSize:13,color:C.g700,lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:80,overflow:"hidden"}}>{h.output_text}</div></div>))}
</div>);

// === SETTINGS ===
if(page==="settings")return(<div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,color:C.pDD,margin:0}}>⚙️ 設定</h2>
<button onClick={()=>setPage("main")} style={btn(C.p,C.pDD)}>✕ 閉じる</button></div>
{/* Logo */}
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>🖼 ロゴ設定</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:8}}>ヘッダーにロゴ画像を表示できます。画像URLを入力してください。</p>
<div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
<input value={logoUrl} onChange={e=>setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" style={{...ib,flex:1}}/>
{logoUrl&&<img src={logoUrl} alt="preview" style={{width:logoSize,height:logoSize,borderRadius:6,objectFit:"contain",border:`1px solid ${C.g200}`}}/>}
</div>
<div style={{display:"flex",gap:8,alignItems:"center"}}>
<span style={{fontSize:12,color:C.g500}}>サイズ:</span>
{[24,32,40,48].map(s=>(<button key={s} onClick={()=>setLogoSize(s)} style={{padding:"4px 12px",borderRadius:8,border:logoSize===s?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:logoSize===s?C.pLL:C.w,fontSize:12,fontWeight:logoSize===s?700:400,color:logoSize===s?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer"}}>{s}px</button>))}
</div></div>
{/* Snippets */}
<div style={{...card,marginBottom:16}}>
<h3 style={{fontSize:15,fontWeight:700,color:C.pDD,marginBottom:8}}>📌 追記テンプレート（{snippets.length}件）</h3>
<p style={{fontSize:12,color:C.g400,marginBottom:10}}>要約後にワンタップで追記できるテンプレートを管理します。</p>
<div style={{display:"flex",gap:6,marginBottom:6}}>
<input value={newSnTitle} onChange={e=>setNewSnTitle(e.target.value)} placeholder="タイトル（ボタン表示名）" style={{...ib,width:140}}/>
<input value={newSnText} onChange={e=>setNewSnText(e.target.value)} placeholder="追記テキスト内容" style={{...ib,flex:1}}/>
<button onClick={()=>{if(newSnTitle.trim()&&newSnText.trim()){setSnippets([...snippets,{title:newSnTitle.trim(),text:newSnText.trim()}]);setNewSnTitle("");setNewSnText("")}}} style={btn(C.p,"#fff",{padding:"6px 14px",fontSize:13})}>追加</button></div>
<div style={{maxHeight:300,overflow:"auto"}}>
{snippets.map((sn,i)=>(<div key={i} style={{display:"flex",gap:6,alignItems:"center",padding:"6px 0",borderBottom:"1px solid "+C.g100}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD,minWidth:80}}>{sn.title}</span>
<span style={{flex:1,fontSize:12,color:C.g500}}>{sn.text}</span>
<button onClick={()=>setSnippets(snippets.filter((_,j)=>j!==i))} style={{padding:"2px 8px",borderRadius:6,border:"1px solid #fecaca",background:C.w,fontSize:10,color:C.err,fontFamily:"inherit",cursor:"pointer"}}>✕</button></div>))}</div></div>
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
return(<div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px"}}>
<header style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,padding:"10px 16px",background:`linear-gradient(135deg,${C.pD},${C.p})`,borderRadius:16,boxShadow:`0 4px 16px rgba(13,148,136,.15)`}}>
<div style={{display:"flex",alignItems:"center",gap:8}}>{logoUrl?<img src={logoUrl} alt="logo" style={{width:logoSize,height:logoSize,borderRadius:6,objectFit:"contain"}}/>:<span style={{fontSize:18}}>🩺</span>}<span style={{fontWeight:700,fontSize:14,color:C.w}}>南草津皮フ科AIカルテ要約</span><span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.2)",color:C.w,fontWeight:600}}>{cr?.i} {cr?.l}</span><button onClick={()=>{stop();sRid("")}} style={{fontSize:11,padding:"2px 8px",borderRadius:10,border:"1px solid rgba(255,255,255,.3)",background:"transparent",color:"rgba(255,255,255,.9)",fontFamily:"inherit",cursor:"pointer"}}>変更</button></div>
<div style={{display:"flex",alignItems:"center",gap:5}}>{pc>0&&<span style={{fontSize:12,color:C.warn,fontWeight:600}}>⏳</span>}<span style={{fontSize:12,color:st.includes("✓")?"#86efac":"rgba(255,255,255,.8)",fontWeight:st.includes("✓")?600:400}}>{st}</span>
<button onClick={()=>{loadHist();setPage("hist")}} style={{fontSize:11,padding:"4px 8px",borderRadius:10,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.12)",color:C.w,fontFamily:"inherit",cursor:"pointer",fontWeight:600}}>📂</button>
<button onClick={()=>setPage("settings")} style={{fontSize:11,padding:"4px 8px",borderRadius:10,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.12)",color:C.w,fontFamily:"inherit",cursor:"pointer",fontWeight:600}}>⚙️</button></div></header>
<div style={{display:"flex",gap:8,marginBottom:10}}>
<input value={pName} onChange={e=>sPName(e.target.value)} placeholder="👤 患者名" style={{...ib,flex:1}}/>
<input value={pId} onChange={e=>sPId(e.target.value)} placeholder="🔢 患者ID" style={{...ib,width:120}}/>
</div>
<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{T.map(t=>(<button key={t.id} onClick={()=>sTid(t.id)} style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:tid===t.id?`2px solid ${C.p}`:"2px solid transparent",background:tid===t.id?C.pLL:C.g100,fontWeight:tid===t.id?700:500,color:tid===t.id?C.pD:C.g500,transition:"all 0.15s"}}>{t.name}</button>))}</div>
<div style={{...card,position:"relative"}}>
<button onClick={pipActive?closePip:openPip} style={{position:"absolute",top:16,right:16,width:40,height:40,borderRadius:"50%",border:"none",background:pipActive?C.rG:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:10,fontWeight:700,fontFamily:"inherit",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,boxShadow:pipActive?`0 0 0 3px rgba(34,197,94,.3)`:`0 2px 8px rgba(13,148,136,.25)`}}>
<span style={{fontSize:14}}>🌟</span><span style={{fontSize:8}}>{pipActive?"OFF":"小窓"}</span></button>
<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:16}}>
{rs!=="inactive"&&<span style={{fontSize:28,fontWeight:700,color:rs==="recording"?C.rG:C.warn,fontVariantNumeric:"tabular-nums"}}>{fm(el)}</span>}
{rs==="recording"&&<div style={{width:"60%",height:6,borderRadius:3,background:C.g200,overflow:"hidden"}}><div style={{width:`${lv}%`,height:"100%",background:`linear-gradient(90deg,${C.rG},${C.p})`,borderRadius:3,transition:"width 0.1s"}}/></div>}
<div style={{display:"flex",gap:12,alignItems:"center"}}>
{rs==="inactive"?(<button onClick={go} style={{...rb,background:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,boxShadow:`0 4px 14px rgba(13,148,136,.25)`}}><span style={{fontSize:24}}>🎙</span><span>タップで開始</span></button>):(<>
{rs==="recording"?(<button onClick={pause} style={{...rb,width:54,height:54,background:C.warn,color:"#78350f"}}><span style={{fontSize:20}}>⏸</span></button>):(<button onClick={resume} style={{...rb,width:54,height:54,background:C.rG,color:C.w}}><span style={{fontSize:20}}>▶</span></button>)}
<button onClick={stopSum} style={{...rb,background:`linear-gradient(135deg,${C.pDD},${C.pD})`,color:C.w,boxShadow:`0 4px 14px rgba(13,148,136,.25)`}}><span style={{fontSize:16}}>✓</span><span>要約</span></button>
<button onClick={stop} style={{...rb,width:54,height:54,background:C.err,color:C.w}}><span style={{fontSize:20}}>⏹</span></button></>)}
</div>
<div style={{display:"flex",gap:2,background:C.g100,borderRadius:20,padding:2}}>
<button onClick={()=>sMd("gemini")} style={{padding:"6px 16px",borderRadius:18,border:"none",fontSize:13,fontWeight:md==="gemini"?700:400,background:md==="gemini"?C.w:"transparent",color:md==="gemini"?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer",boxShadow:md==="gemini"?"0 1px 4px rgba(0,0,0,.06)":"none"}}>⚡ Gemini</button>
<button onClick={()=>sMd("claude")} style={{padding:"6px 16px",borderRadius:18,border:"none",fontSize:13,fontWeight:md==="claude"?700:400,background:md==="claude"?C.w:"transparent",color:md==="claude"?C.pD:C.g500,fontFamily:"inherit",cursor:"pointer",boxShadow:md==="claude"?"0 1px 4px rgba(0,0,0,.06)":"none"}}>🧠 Claude</button></div>
{rs==="recording"&&<div style={{fontSize:12,color:C.g400}}>🎙 5秒ごとに自動書き起こし</div>}
</div>
<div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><label style={{fontSize:13,fontWeight:700,color:C.g500}}>📝 書き起こし</label><span style={{fontSize:12,color:C.g400}}>{inp.length}文字</span></div>
<textarea value={inp} onChange={e=>sInp(e.target.value)} placeholder="録音ボタンで音声を書き起こし、または直接入力..." style={{width:"100%",height:140,padding:12,borderRadius:14,border:`1.5px solid ${C.g200}`,background:C.g50,fontSize:14,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.7,boxSizing:"border-box"}}/></div>
<div style={{display:"flex",gap:8,marginBottom:14}}>
<button onClick={()=>sum()} disabled={ld||!inp.trim()} style={{flex:1,padding:"10px 0",borderRadius:14,border:"none",background:ld?C.g200:`linear-gradient(135deg,${C.pD},${C.p})`,color:C.w,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!inp.trim()?.45:1,boxShadow:!ld&&inp.trim()?`0 4px 12px rgba(13,148,136,.25)`:"none"}}>{ld?"⏳ 処理中...":`${md==="claude"?"🧠 Claude":"⚡ Gemini"} で要約`}</button>
<button onClick={clr} style={{padding:"10px 20px",borderRadius:14,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,fontWeight:600,color:C.g500,fontFamily:"inherit",cursor:"pointer"}}>🗑</button></div>
{out&&<div style={{borderRadius:14,border:`2px solid ${C.pL}`,padding:16,background:`linear-gradient(135deg,${C.pLL},#f0fdf4)`}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontSize:13,fontWeight:700,color:C.pD}}>{ct.name} 要約結果</span><button onClick={()=>cp(out)} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.p}44`,background:C.w,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button></div>
<textarea value={out} onChange={e=>sOut(e.target.value)} style={{width:"100%",height:180,padding:12,borderRadius:12,border:`1px solid ${C.g200}`,background:C.w,fontSize:14,color:C.g900,fontFamily:"inherit",resize:"vertical",lineHeight:1.7,boxSizing:"border-box"}}/>
{snippets.length>0&&<div style={{marginTop:8}}><div style={{fontSize:11,color:C.g400,marginBottom:4}}>📌 テンプレート追記</div>
<div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{snippets.map((sn,i)=>(<button key={i} onClick={()=>sOut(o=>o+(o?"\n":"")+sn.text)} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${C.p}44`,background:C.pLL,fontSize:12,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer"}}>{sn.title}</button>))}</div></div>}
</div>}
{ld&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:`3px solid ${C.g200}`,borderTop:`3px solid ${C.p}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:C.g500}}>AIが要約を作成中...</span></div>}
</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);}
