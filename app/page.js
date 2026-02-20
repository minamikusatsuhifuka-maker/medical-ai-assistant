"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";
const T=[{id:"soap",name:"📋 ASOP",prompt:"あなたは皮膚科専門の医療秘書です。以下の書き起こしテキストをカルテ形式で要約してください。\n\n【出力フォーマット（厳守・このとおりに出力）】\n# 疾患名をここに記載\nS）主訴の内容をここに記載\nO）所見の内容をここに記載\nP）計画の内容をここに記載\n患者情報）情報をここに記載\n\n【フォーマットの厳密なルール】\n- 1行目：# の後に半角スペース1つ、その後に診断名・疾患名のみ（複数あればカンマ区切り）\n- 2行目：S）の直後に主訴内容を続ける（改行しない）\n- 3行目：O）の直後に所見内容を続ける（改行しない）\n- 4行目：P）の直後に計画内容を続ける（改行しない）\n- 5行目：患者情報）の直後に内容を続ける（言及なければ省略可）\n- S,O,P,患者情報の各行の間に空行を入れない\n- 各項目の括弧書き説明は一切不要\n- 結婚式・旅行・発表会などイベント情報は患者情報）に記載。S）には入れない\n\n【重要ルール】\n- 会話にない情報は推測しない\n- 言及のない項目は「言及なし」\n- 数字・日付・薬剤名は正確に\n- とにかくコンパクトに詰めて記載"},{id:"disease",name:"🏥 疾患名",prompt:"あなたは皮膚科専門の医療秘書です。以下の書き起こしから疾患情報を抽出。\n\n【出力フォーマット（厳守）】\n■ 疾患名\n（正式な医学用語で記載。複数あれば改行で列挙）\n■ 部位\n■ 重症度・範囲\n■ 既往歴\n■ 鑑別診断（医師が言及した場合のみ）\n\n【ルール】\n- 推測で疾患名を追加しない\n- 俗称は正式名称に変換（例：水虫→足白癬、ニキビ→ざ瘡）\n- 言及なしは「言及なし」\n- コンパクトに"},{id:"cosmetic",name:"✨ 美容",prompt:"あなたは美容皮膚科専門の医療秘書です。以下の書き起こしを施術記録として要約。\n\n【出力フォーマット（厳守）】\n■ 施術名\n■ 施術部位\n■ 患者の希望・主訴\n■ 施術内容・パラメータ（出力・ショット数・パス数等）\n■ 使用薬剤・機器\n■ 施術後注意事項\n■ 次回予定\n■ 患者情報（イベント・背景等あれば）\n\n【ルール】\n- 施術機器名は正式名称（例：ノーリス、ポテンツァ、メソナJ、MIINレーザー、AGNES）\n- パラメータは正確に\n- 言及なしは「言及なし」\n- コンパクトに"},{id:"procedure",name:"🔧 処置",prompt:"あなたは皮膚科専門の医療秘書です。以下の書き起こしを処置記録として要約。\n\n【出力フォーマット（厳守）】\n■ 処置名\n■ 部位・範囲\n■ 麻酔（種類・量）\n■ 処置内容（時系列で記載）\n■ 使用器具・材料\n■ 検体提出（病理等）\n■ 術後指示・処方\n■ 次回予定\n\n【ルール】\n- サイズはmm単位、量はmL/g単位で正確に\n- 言及なしは「言及なし」\n- コンパクトに"},{id:"followup",name:"🔄 経過",prompt:"あなたは皮膚科専門の医療秘書です。以下の書き起こしを経過観察記録として要約。\n\n【出力フォーマット（厳守）】\n■ 疾患名\n■ 前回からの経過\n■ 現在の症状（患者申告）\n■ 現在の所見（医師評価）\n■ 治療効果判定（改善/不変/悪化）\n■ 今後の方針・処方変更\n■ 次回予定\n\n【ルール】\n- 前回との比較を明確に\n- 薬剤名は正式名称\n- 言及なしは「言及なし」\n- コンパクトに"},{id:"free",name:"📝 フリー",prompt:"あなたは皮膚科専門の医療秘書です。以下の書き起こしを簡潔かつ正確に要約。\n\n【ルール】\n- 医学用語は正式名称（俗称→正式名称に変換）\n- 薬剤名・施術名は正確に\n- 時系列で整理\n- 推測しない\n- 数値・日付は正確に\n- コンパクトに"}];
const R=[{id:"r1",l:"診察室1",i:"1️⃣"},{id:"r2",l:"診察室2",i:"2️⃣"},{id:"r3",l:"診察室3",i:"3️⃣"},{id:"r4",l:"処置室",i:"🔧"},{id:"r5",l:"美容室",i:"✨"},{id:"r6",l:"カウンセリング",i:"💬"},{id:"r7",l:"その他",i:"📋"}];
const DEFAULT_DICT=[
["りんでろん","リンデロン"],["リンデロンVG","リンデロン-VG"],["りんでろんぶいじー","リンデロン-VG"],["アンテベート","アンテベート"],["でるもべーと","デルモベート"],["ロコイド","ロコイド"],["プロトピック","プロトピック"],["キンダベート","キンダベート"],["ヒルドイド","ヒルドイド"],["ひるどいど","ヒルドイド"],["プロペト","プロペト"],["ワセリン","白色ワセリン"],
["アクアチム","アクアチムクリーム"],["ダラシン","ダラシンTゲル"],["ゼビアックス","ゼビアックスローション"],["デュアック","デュアック配合ゲル"],["べピオ","ベピオゲル"],["エピデュオ","エピデュオゲル"],["ディフェリン","ディフェリンゲル"],["アダパレン","アダパレン"],
["イソトレチノイン","イソトレチノイン"],["いそとれちのいん","イソトレチノイン"],["トラネキサム酸","トラネキサム酸"],["とらねきさむさん","トラネキサム酸"],["ハイドロキノン","ハイドロキノン"],["トレチノイン","トレチノイン"],
["デュピクセント","デュピクセント"],["でゅぴくせんと","デュピクセント"],["ミチーガ","ミチーガ"],["オルミエント","オルミエント"],["リンヴォック","リンヴォック"],["サイバインコ","サイバインコ"],["コレクチム","コレクチム軟膏"],["モイゼルト","モイゼルト軟膏"],
["ルミセフ","ルミセフ"],["コセンティクス","コセンティクス"],["スキリージ","スキリージ"],["トルツ","トルツ"],["オテズラ","オテズラ"],["ソーティクツ","ソーティクツ"],
["ゾレア","ゾレア"],["ビラノア","ビラノア"],["デザレックス","デザレックス"],["ルパフィン","ルパフィン"],["アレグラ","アレグラ"],
["あとぴー","アトピー性皮膚炎"],["乾癬","乾癬"],["かんせん","乾癬"],["蕁麻疹","蕁麻疹"],["じんましん","蕁麻疹"],["帯状疱疹","帯状疱疹"],["たいじょうほうしん","帯状疱疹"],["ヘルペス","単純ヘルペス"],["白癬","白癬"],["はくせん","白癬"],["水虫","足白癬"],["爪白癬","爪白癬"],["粉瘤","粉瘤"],["ふんりゅう","粉瘤"],["脂漏性皮膚炎","脂漏性皮膚炎"],["しろうせい","脂漏性皮膚炎"],["酒さ","酒さ"],["しゅさ","酒さ"],["円形脱毛症","円形脱毛症"],["白斑","尋常性白斑"],["しょうせきのうほうしょう","掌蹠膿疱症"],["蜂窩織炎","蜂窩織炎"],["ほうかしきえん","蜂窩織炎"],["伝染性膿痂疹","伝染性膿痂疹"],["とびひ","伝染性膿痂疹"],["いぼ","尋常性疣贅"],["水いぼ","伝染性軟属腫"],["にきび","ざ瘡"],["ニキビ","ざ瘡"],
["肝斑","肝斑"],["かんぱん","肝斑"],["しみ","色素斑"],["そばかす","雀卵斑"],["くすみ","色素沈着"],
["ノーリス","ノーリス（IPL光治療）"],["のーりす","ノーリス（IPL光治療）"],["IPL","IPL光治療"],["あいぴーえる","IPL光治療"],
["ポテンツァ","ポテンツァ"],["ぽてんつぁ","ポテンツァ"],["ジュベルック","ジュベルック"],["じゅべるっく","ジュベルック"],
["メソナJ","メソナJ"],["めそなじぇい","メソナJ"],["めそな","メソナJ"],["メソポレーション","メソポレーション"],
["AGNES","AGNES"],["あぐねす","AGNES"],["アグネス","AGNES"],
["MIIN","MIINレーザー"],["みいん","MIINレーザー"],["ミイン","MIINレーザー"],["美人レーザー","MIINレーザー"],
["サリチル酸マクロゴールピーリング","サリチル酸マクロゴールピーリング"],["マッサージピール","マッサージピール"],["リバースピール","リバースピール"],
["ゼオスキン","ゼオスキンヘルス"],["ぜおすきん","ゼオスキンヘルス"],["ミラミン","ミラミン"],["ミラミックス","ミラミックス"],["デイリーPD","デイリーPD"],["バランサートナー","バランサートナー"],
["カレシム","カレシム美容液"],["DRXステムアドバンスセラム","DRXステムアドバンスセラム"],
["コラージュリペア","コラージュリペア"],["ブライトエッセンス","ブライトエッセンスDR"],
["ドロップスクリーン","ドロップスクリーン"],["どろっぷすくりーん","ドロップスクリーン"],
["AGA","AGA（男性型脱毛症）"],["えーじーえー","AGA（男性型脱毛症）"],
["エキシマ","エキシマライト"],["ナローバンド","ナローバンドUVB"],["紫外線治療","紫外線療法"],
["液体窒素","液体窒素凍結療法"],["えきたいちっそ","液体窒素凍結療法"],["凍結療法","液体窒素凍結療法"],
["生検","皮膚生検"],["せいけん","皮膚生検"],["病理","病理組織検査"],
["ステロイド","ステロイド外用薬"],["すてろいど","ステロイド外用薬"],["保湿剤","保湿剤"],
];
export default function Home(){
const[rs,sRS]=useState("inactive"),[inp,sInp]=useState(""),[out,sOut]=useState(""),[st,sSt]=useState("待機中"),[el,sEl]=useState(0),[ld,sLd]=useState(false),[lv,sLv]=useState(0),[md,sMd]=useState("gemini"),[pc,sPC]=useState(0),[tid,sTid]=useState("soap"),[rid,sRid]=useState("");
const[hist,sHist]=useState([]),[showHist,setShowHist]=useState(false),[search,setSearch]=useState("");
const[pName,sPName]=useState(""),[pId,sPId]=useState("");
const[pipWin,setPipWin]=useState(null),[pipActive,setPipActive]=useState(false);
const[showSettings,setShowSettings]=useState(false),[dict,setDict]=useState(DEFAULT_DICT),[newFrom,setNewFrom]=useState(""),[newTo,setNewTo]=useState(""),[dictEnabled,setDictEnabled]=useState(true);
const pNameRef=useRef(""),pIdRef=useRef("");
useEffect(()=>{pNameRef.current=pName},[pName]);
useEffect(()=>{pIdRef.current=pId},[pId]);
const mR=useRef(null),msR=useRef(null),acR=useRef(null),anR=useRef(null),laR=useRef(null),tR=useRef(null),cR=useRef(null),iR=useRef("");
const pipRef=useRef(null),elRef=useRef(0),lvRef=useRef(0),rsRef=useRef("inactive");
useEffect(()=>{iR.current=inp},[inp]);
useEffect(()=>{elRef.current=el},[el]);
useEffect(()=>{lvRef.current=lv},[lv]);
useEffect(()=>{rsRef.current=rs},[rs]);
useEffect(()=>{if(rs==="recording"){tR.current=setInterval(()=>sEl(t=>t+1),1000)}else{clearInterval(tR.current);if(rs==="inactive")sEl(0)}return()=>clearInterval(tR.current)},[rs]);
// PiP update loop
useEffect(()=>{
const id=setInterval(()=>{if(!pipRef.current)return;const d=pipRef.current;const t=d.getElementById("pip-timer"),l=d.getElementById("pip-level"),s=d.getElementById("pip-status");
if(t){const e=elRef.current;t.textContent=`${String(Math.floor(e/60)).padStart(2,"0")}:${String(e%60).padStart(2,"0")}`}
if(l)l.style.width=`${lvRef.current}%`;
if(s){const r=rsRef.current;s.textContent=r==="recording"?"🔴 録音中":r==="paused"?"⏸ 一時停止":"⏹ 停止";s.style.color=r==="recording"?"#22c55e":r==="paused"?"#f59e0b":"#94a3b8"}},500);
return()=>clearInterval(id)},[]);
const fm=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const ct=T.find(t=>t.id===tid)||T[0],cr=R.find(r=>r.id===rid);
const saveRecord=async(input,output)=>{if(!supabase)return;try{await supabase.from("records").insert({room:rid,template:tid,ai_model:md,input_text:input,output_text:output,patient_name:pNameRef.current,patient_id:pIdRef.current})}catch(e){console.error("Save error:",e)}};
const loadHist=async()=>{if(!supabase)return;try{let q=supabase.from("records").select("*").order("created_at",{ascending:false}).limit(50);const{data}=await q;if(data)sHist(data)}catch(e){console.error("Load error:",e)}};
const delRecord=async(id)=>{if(!supabase)return;try{await supabase.from("records").delete().eq("id",id);sHist(h=>h.filter(r=>r.id!==id))}catch(e){console.error("Delete error:",e)}};
const filteredHist=hist.filter(h=>{if(!search.trim())return true;const s=search.toLowerCase();return(h.patient_name||"").toLowerCase().includes(s)||(h.patient_id||"").toLowerCase().includes(s)||(h.output_text||"").toLowerCase().includes(s)});
const sAM=async()=>{try{const s=await navigator.mediaDevices.getUserMedia({audio:true});msR.current=s;const c=new(window.AudioContext||window.webkitAudioContext)(),sr=c.createMediaStreamSource(s),a=c.createAnalyser();a.fftSize=256;a.smoothingTimeConstant=0.7;sr.connect(a);acR.current=c;anR.current=a;const d=new Uint8Array(a.frequencyBinCount),tk=()=>{if(!anR.current)return;anR.current.getByteFrequencyData(d);let sm=0;for(let i=0;i<d.length;i++)sm+=d[i];sLv(Math.min(100,Math.round((sm/d.length/128)*100)));laR.current=requestAnimationFrame(tk)};laR.current=requestAnimationFrame(tk);return s}catch{sSt("マイク取得失敗");return null}};
const xAM=()=>{if(laR.current)cancelAnimationFrame(laR.current);laR.current=null;if(acR.current){try{acR.current.close()}catch{}}acR.current=null;if(msR.current){msR.current.getTracks().forEach(t=>t.stop())}msR.current=null;anR.current=null;sLv(0)};
const applyDict=(text)=>{if(!dictEnabled||!text)return text;let r=text;for(const[from,to] of dict){if(from&&to&&from!==to){r=r.split(from).join(to)}}return r};
const tc=async(b)=>{if(b.size<500)return;sPC(p=>p+1);sSt("🔄 書き起こし中...");try{const f=new FormData();f.append("audio",b,"audio.webm");const r=await fetch("/api/transcribe",{method:"POST",body:f}),d=await r.json();if(d.text&&d.text.trim()){const fixed=applyDict(d.text.trim());sInp(p=>p+(p?"\n":"")+fixed);sSt("録音中 ✓")}else{sSt("録音中")}}catch{sSt("録音中（エラー）")}finally{sPC(p=>Math.max(0,p-1))}};
const cMR=(s)=>{const m=new MediaRecorder(s,{mimeType:MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm"});m.ondataavailable=(e)=>{if(e.data.size>0)tc(e.data)};return m};
const go=async()=>{const s=await sAM();if(!s)return;sRS("recording");sSt("録音中");const m=cMR(s);m.start();mR.current=m;cR.current=setInterval(()=>{if(mR.current&&mR.current.state==="recording"){mR.current.stop();const m2=cMR(s);m2.start();mR.current=m2}},5000)};
const stop=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording")mR.current.stop();mR.current=null;xAM();sRS("inactive");sSt("待機中")};
const pause=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording")mR.current.stop();sRS("paused");sSt("一時停止")};
const resume=()=>{if(!msR.current)return;sRS("recording");sSt("録音中");const m=cMR(msR.current);m.start();mR.current=m;cR.current=setInterval(()=>{if(mR.current&&mR.current.state==="recording"){mR.current.stop();const m2=cMR(msR.current);m2.start();mR.current=m2}},5000)};
const sum=async(tx)=>{const t=tx||iR.current;if(!t.trim()){sSt("テキストを入力してください");return}sLd(true);sSt(md==="claude"?"Claude で要約中...":"Gemini で要約中...");try{const r=await fetch("/api/summarize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t,mode:md,prompt:ct.prompt})}),d=await r.json();if(d.error){sSt("エラー: "+d.error);return}sOut(d.summary);await saveRecord(t,d.summary);try{await navigator.clipboard.writeText(d.summary);sSt("要約完了・保存済み ✓")}catch{sSt("要約完了・保存済み")}}catch{sSt("エラーが発生しました")}finally{sLd(false)}};
const stopSum=()=>{clearInterval(cR.current);if(mR.current&&mR.current.state==="recording"){const cr2=mR.current;cr2.ondataavailable=async(e)=>{if(e.data.size>0){const f=new FormData();f.append("audio",e.data,"audio.webm");try{const r=await fetch("/api/transcribe",{method:"POST",body:f}),d=await r.json();if(d.text&&d.text.trim()){const ft=iR.current+(iR.current?"\n":"")+d.text.trim();sInp(ft);setTimeout(()=>sum(ft),300)}else{sum()}}catch{sum()}}else{sum()}};cr2.stop()}else{sum()}mR.current=null;xAM();sRS("inactive")};
const clr=()=>{sInp("");sOut("");sSt("待機中");sEl(0);sPName("");sPId("")};
const cp=async(t)=>{try{await navigator.clipboard.writeText(t);sSt("コピー済み ✓")}catch{}};
// === PiP Functions ===
const openPip=useCallback(async()=>{try{if(!("documentPictureInPicture" in window)){sSt("この機能はChrome 116以降で利用可能です");return}
const pw=await window.documentPictureInPicture.requestWindow({width:200,height:90});
const rm=R.find(r=>r.id===rid);const rmName=rm?`${rm.i}${rm.l}`:"";
pw.document.body.style.margin="0";pw.document.body.style.overflow="hidden";
pw.document.body.innerHTML=`<div style="font-family:'Zen Maru Gothic',sans-serif;background:linear-gradient(135deg,#1e1b4b,#312e81);color:#fff;padding:5px 8px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:3px">
<div style="display:flex;align-items:center;gap:4px">
<span style="font-size:9px;opacity:.5">${rmName}</span>
<input id="pip-pid" placeholder="患者ID" value="" style="flex:1;padding:1px 5px;border-radius:4px;border:none;font-size:9px;background:rgba(255,255,255,.15);color:#fff;outline:none;font-family:inherit"/>
<span id="pip-status" style="font-size:9px;font-weight:600;color:#94a3b8">停止</span></div>
<div style="display:flex;align-items:center;gap:6px">
<div id="pip-timer" style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap">00:00</div>
<div style="flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden">
<div id="pip-level" style="width:0%;height:100%;background:#22c55e;border-radius:2px;transition:width 0.15s"></div></div></div>
<div style="display:flex;gap:4px;justify-content:center">
<button id="pip-rec" style="padding:2px 14px;border-radius:8px;border:none;background:#6366f1;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">開始</button>
<button id="pip-pause" style="padding:2px 10px;border-radius:8px;border:none;background:#fbbf24;color:#78350f;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:none">一時停止</button>
<button id="pip-sum" style="padding:2px 10px;border-radius:8px;border:none;background:#4338ca;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:none">要約</button>
<button id="pip-stop" style="padding:2px 10px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:none">停止</button></div></div>`;
pw.document.head.innerHTML=`<link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&display=swap" rel="stylesheet"><style>::placeholder{color:rgba(255,255,255,.35)}</style>`;
const pipPiEl=pw.document.getElementById("pip-pid");
if(pipPiEl){pipPiEl.value=pId;pipPiEl.addEventListener("input",e=>{sPId(e.target.value)})}
const pipBtnUpdate=()=>{const d=pipRef.current;if(!d)return;const r=rsRef.current;const rb=d.getElementById("pip-rec"),pb=d.getElementById("pip-pause"),sb=d.getElementById("pip-stop"),smb=d.getElementById("pip-sum");if(!rb)return;
rb.style.display=r==="inactive"?"inline-block":"none";
pb.style.display=r!=="inactive"?"inline-block":"none";
if(r==="recording"){pb.textContent="一時停止";pb.style.background="#fbbf24";pb.style.color="#78350f"}else if(r==="paused"){pb.textContent="再開";pb.style.background="#22c55e";pb.style.color="#fff"}
sb.style.display=r!=="inactive"?"inline-block":"none";smb.style.display=r!=="inactive"?"inline-block":"none"};
pw.document.getElementById("pip-rec").onclick=()=>{go();setTimeout(pipBtnUpdate,500)};
pw.document.getElementById("pip-pause").onclick=()=>{if(rsRef.current==="recording"){pause()}else{resume()}setTimeout(pipBtnUpdate,300)};
pw.document.getElementById("pip-stop").onclick=()=>{stop();setTimeout(pipBtnUpdate,300)};
pw.document.getElementById("pip-sum").onclick=()=>{stopSum();setTimeout(pipBtnUpdate,500)};
pipRef.current=pw.document;setPipWin(pw);setPipActive(true);
const btnLoop=setInterval(()=>{if(!pipRef.current){clearInterval(btnLoop);return}pipBtnUpdate()},600);
pw.addEventListener("pagehide",()=>{clearInterval(btnLoop);pipRef.current=null;setPipWin(null);setPipActive(false)});
}catch(e){console.error("PiP error:",e);sSt("小窓を開けませんでした")}
},[rid,pName,pId]);
const closePip=useCallback(()=>{if(pipWin){pipWin.close()}pipRef.current=null;setPipWin(null);setPipActive(false)},[pipWin]);
const ac="#6366f1",aD="#4338ca",aS="#eef2ff",rG="#22c55e";
const rb={width:74,height:74,borderRadius:"50%",border:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,fontFamily:"inherit",fontWeight:700,fontSize:10,boxShadow:"0 4px 14px rgba(99,102,241,.25)",cursor:"pointer"};
const fmD=(d)=>{const dt=new Date(d);return `${dt.getMonth()+1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2,"0")}`};
const tn=(id)=>{const t=T.find(x=>x.id===id);return t?t.name:id};
const rn=(id)=>{const r=R.find(x=>x.id===id);return r?`${r.i}${r.l}`:id};
const ib={padding:"8px 12px",borderRadius:10,border:"1px solid #e2e8f0",fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",color:"#1a1a1a"};
if(!rid)return(<div style={{maxWidth:600,margin:"0 auto",padding:"40px 16px"}}><div style={{background:"linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)",borderRadius:24,padding:"40px 24px",boxShadow:"0 8px 32px rgba(99,102,241,.25)",textAlign:"center"}}>
<div style={{width:48,height:48,borderRadius:16,background:"rgba(255,255,255,.2)",margin:"0 auto 16px",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:24}}>🩺</span></div>
<h1 style={{fontSize:22,fontWeight:700,color:"#fff",marginBottom:4}}>AI診療アシスタント</h1><p style={{fontSize:14,color:"rgba(255,255,255,.8)",marginBottom:28}}>部屋を選択してください</p>
<div style={{display:"flex",flexWrap:"wrap",gap:10,justifyContent:"center"}}>{R.map(rm=>(<button key={rm.id} onClick={()=>sRid(rm.id)} style={{padding:"14px 20px",borderRadius:14,border:"none",background:"rgba(255,255,255,.95)",fontSize:14,fontWeight:600,fontFamily:"inherit",cursor:"pointer",display:"flex",alignItems:"center",gap:8,minWidth:140,boxShadow:"0 2px 8px rgba(0,0,0,.1)",transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}><span style={{fontSize:20}}>{rm.i}</span>{rm.l}</button>))}</div></div></div>);
if(showHist)return(<div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,margin:0}}>📂 診療履歴</h2>
<button onClick={()=>setShowHist(false)} style={{padding:"8px 20px",borderRadius:12,border:"none",background:ac,color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button></div>
<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 患者名・ID・内容で検索..." style={{...ib,width:"100%",marginBottom:12,padding:"10px 14px",boxSizing:"border-box"}}/>
{filteredHist.length===0?<p style={{color:"#94a3b8",textAlign:"center",padding:40}}>該当する履歴がありません</p>:
filteredHist.map(h=>(<div key={h.id} style={{background:"#fff",borderRadius:14,padding:16,marginBottom:10,boxShadow:"0 2px 8px rgba(0,0,0,.04)",borderLeft:`3px solid ${ac}`}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
<span style={{fontSize:12,color:"#64748b",fontWeight:500}}>{fmD(h.created_at)}</span>
{(h.patient_name||h.patient_id)&&<span style={{fontSize:12,padding:"2px 8px",borderRadius:8,background:"#fef3c7",color:"#92400e",fontWeight:600}}>{h.patient_name||""}{h.patient_id?` (${h.patient_id})`:""}</span>}
<span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:aS,color:aD,fontWeight:600}}>{rn(h.room)}</span>
<span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:"#f0fdf4",color:"#16a34a",fontWeight:600}}>{tn(h.template)}</span></div>
<div style={{display:"flex",gap:4}}>
<button onClick={()=>{sInp(h.input_text);sOut(h.output_text);sPName(h.patient_name||"");sPId(h.patient_id||"");setShowHist(false)}} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>📂 開く</button>
<button onClick={()=>cp(h.output_text)} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>📋</button>
<button onClick={()=>delRecord(h.id)} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #fecaca",background:"#fff",fontSize:11,fontFamily:"inherit",cursor:"pointer",color:"#ef4444"}}>🗑</button></div></div>
<div style={{fontSize:13,color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:80,overflow:"hidden"}}>{h.output_text}</div></div>))}
</div>);
if(showSettings)return(<div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h2 style={{fontSize:18,fontWeight:700,margin:0}}>⚙️ 設定</h2>
<button onClick={()=>setShowSettings(false)} style={{padding:"8px 20px",borderRadius:12,border:"none",background:ac,color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>✕ 閉じる</button></div>
<div style={{background:"#fff",borderRadius:16,padding:20,boxShadow:"0 2px 12px rgba(0,0,0,.05)",marginBottom:16}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
<h3 style={{fontSize:15,fontWeight:700,margin:0}}>📖 誤字脱字修正辞書（{dict.length}件）</h3>
<button onClick={()=>setDictEnabled(!dictEnabled)} style={{padding:"4px 14px",borderRadius:10,border:"none",background:dictEnabled?"#22c55e":"#e2e8f0",color:dictEnabled?"#fff":"#64748b",fontSize:12,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>{dictEnabled?"ON":"OFF"}</button></div>
<p style={{fontSize:12,color:"#94a3b8",marginBottom:12}}>音声書き起こし結果に自動適用されます。左の文字列を右の文字列に置換します。</p>
<div style={{display:"flex",gap:6,marginBottom:12}}>
<input value={newFrom} onChange={e=>setNewFrom(e.target.value)} placeholder="変換前" style={{flex:1,padding:"6px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,fontFamily:"inherit"}}/>
<span style={{alignSelf:"center",color:"#94a3b8"}}>→</span>
<input value={newTo} onChange={e=>setNewTo(e.target.value)} placeholder="変換後" style={{flex:1,padding:"6px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,fontFamily:"inherit"}}/>
<button onClick={()=>{if(newFrom.trim()&&newTo.trim()){setDict([[newFrom.trim(),newTo.trim()],...dict]);setNewFrom("");setNewTo("")}}} style={{padding:"6px 14px",borderRadius:8,border:"none",background:ac,color:"#fff",fontSize:13,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>追加</button></div>
<div style={{maxHeight:400,overflow:"auto"}}>
{dict.map((d,i)=>(<div key={i} style={{display:"flex",gap:6,alignItems:"center",padding:"4px 0",borderBottom:"1px solid #f1f5f9"}}>
<span style={{flex:1,fontSize:12,color:"#64748b"}}>{d[0]}</span>
<span style={{color:"#94a3b8",fontSize:11}}>→</span>
<span style={{flex:1,fontSize:12,color:"#1a1a1a",fontWeight:600}}>{d[1]}</span>
<button onClick={()=>setDict(dict.filter((_,j)=>j!==i))} style={{padding:"2px 8px",borderRadius:6,border:"1px solid #fecaca",background:"#fff",fontSize:10,color:"#ef4444",fontFamily:"inherit",cursor:"pointer"}}>✕</button></div>))}</div></div>
</div>);
return(<div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px"}}>
<header style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,padding:"10px 16px",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",borderRadius:16,boxShadow:"0 4px 16px rgba(99,102,241,.2)"}}>
<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>🩺</span><span style={{fontWeight:700,fontSize:15,color:"#fff"}}>AI診療アシスタント</span><span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"rgba(255,255,255,.2)",color:"#fff",fontWeight:600}}>{cr?.i} {cr?.l}</span><button onClick={()=>{stop();sRid("")}} style={{fontSize:11,padding:"2px 8px",borderRadius:10,border:"1px solid rgba(255,255,255,.3)",background:"transparent",color:"rgba(255,255,255,.9)",fontFamily:"inherit",cursor:"pointer"}}>変更</button></div>
<div style={{display:"flex",alignItems:"center",gap:6}}>{pc>0&&<span style={{fontSize:12,color:"#fbbf24",fontWeight:600}}>⏳</span>}<span style={{fontSize:12,color:st.includes("✓")?"#86efac":"rgba(255,255,255,.8)",fontWeight:st.includes("✓")?600:400}}>{st}</span>
<button onClick={()=>{loadHist();setShowHist(true)}} style={{fontSize:11,padding:"4px 10px",borderRadius:10,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.15)",color:"#fff",fontFamily:"inherit",cursor:"pointer",fontWeight:600}}>📂 履歴</button>
<button onClick={()=>setShowSettings(true)} style={{fontSize:11,padding:"4px 10px",borderRadius:10,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.15)",color:"#fff",fontFamily:"inherit",cursor:"pointer",fontWeight:600}}>⚙️</button></div></header>
<div style={{display:"flex",gap:8,marginBottom:10}}>
<input value={pName} onChange={e=>sPName(e.target.value)} placeholder="👤 患者名" style={{...ib,flex:1}}/>
<input value={pId} onChange={e=>sPId(e.target.value)} placeholder="🔢 患者ID" style={{...ib,width:120}}/>
</div>
<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{T.map(t=>(<button key={t.id} onClick={()=>sTid(t.id)} style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:tid===t.id?`2px solid ${ac}`:"2px solid transparent",background:tid===t.id?aS:"#f1f5f9",fontWeight:tid===t.id?700:500,color:tid===t.id?aD:"#64748b",transition:"all 0.15s"}}>{t.name}</button>))}</div>
<div style={{background:"#fff",borderRadius:20,padding:"20px",boxShadow:"0 4px 24px rgba(0,0,0,.05)",position:"relative"}}>
{/* PiP Button */}
<button onClick={pipActive?closePip:openPip} style={{position:"absolute",top:16,right:16,width:44,height:44,borderRadius:"50%",border:"none",background:pipActive?"#22c55e":"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",fontSize:11,fontWeight:700,fontFamily:"inherit",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1,boxShadow:pipActive?"0 0 0 3px rgba(34,197,94,.3)":"0 2px 8px rgba(99,102,241,.3)"}}>
<span style={{fontSize:16}}>🌟</span><span style={{fontSize:9}}>{pipActive?"小窓OFF":"小窓ON"}</span></button>
<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:16}}>
{rs!=="inactive"&&<span style={{fontSize:28,fontWeight:700,color:rs==="recording"?rG:"#d97706",fontVariantNumeric:"tabular-nums"}}>{fm(el)}</span>}
{rs==="recording"&&<div style={{width:"60%",height:6,borderRadius:3,background:"#e2e8f0",overflow:"hidden"}}><div style={{width:`${lv}%`,height:"100%",background:`linear-gradient(90deg,${rG},#4ade80)`,borderRadius:3,transition:"width 0.1s"}}/></div>}
<div style={{display:"flex",gap:12,alignItems:"center"}}>
{rs==="inactive"?(<button onClick={go} style={{...rb,background:`linear-gradient(135deg,${ac},#8b5cf6)`,color:"#fff"}}><span style={{fontSize:24}}>🎙</span><span>タップで開始</span></button>):(<>
{rs==="recording"?(<button onClick={pause} style={{...rb,width:56,height:56,background:"#fbbf24",color:"#78350f"}}><span style={{fontSize:22}}>⏸</span></button>):(<button onClick={resume} style={{...rb,width:56,height:56,background:rG,color:"#fff"}}><span style={{fontSize:22}}>▶</span></button>)}
<button onClick={stopSum} style={{...rb,background:`linear-gradient(135deg,${aD},#6d28d9)`,color:"#fff"}}><span style={{fontSize:16}}>✓</span><span>要約</span></button>
<button onClick={stop} style={{...rb,width:56,height:56,background:"#ef4444",color:"#fff"}}><span style={{fontSize:22}}>⏹</span></button></>)}
</div>
<div style={{display:"flex",gap:2,background:"#f1f5f9",borderRadius:20,padding:2}}>
<button onClick={()=>sMd("gemini")} style={{padding:"6px 16px",borderRadius:18,border:"none",fontSize:13,fontWeight:md==="gemini"?700:400,background:md==="gemini"?"#fff":"transparent",color:md==="gemini"?aD:"#64748b",fontFamily:"inherit",cursor:"pointer",boxShadow:md==="gemini"?"0 1px 4px rgba(0,0,0,.08)":"none"}}>⚡ Gemini</button>
<button onClick={()=>sMd("claude")} style={{padding:"6px 16px",borderRadius:18,border:"none",fontSize:13,fontWeight:md==="claude"?700:400,background:md==="claude"?"#fff":"transparent",color:md==="claude"?aD:"#64748b",fontFamily:"inherit",cursor:"pointer",boxShadow:md==="claude"?"0 1px 4px rgba(0,0,0,.08)":"none"}}>🧠 Claude</button></div>
{rs==="recording"&&<div style={{fontSize:12,color:"#94a3b8"}}>🎙 5秒ごとに自動書き起こし</div>}
</div>
<div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><label style={{fontSize:13,fontWeight:700,color:"#64748b"}}>📝 書き起こし</label><span style={{fontSize:12,color:"#94a3b8"}}>{inp.length}文字</span></div>
<textarea value={inp} onChange={e=>sInp(e.target.value)} placeholder="録音ボタンで音声を書き起こし、または直接入力..." style={{width:"100%",height:140,padding:12,borderRadius:14,border:"1px solid #e2e8f0",background:"#fafafa",fontSize:14,color:"#1a1a1a",fontFamily:"inherit",resize:"vertical",lineHeight:1.7,boxSizing:"border-box"}}/></div>
<div style={{display:"flex",gap:8,marginBottom:14}}>
<button onClick={()=>sum()} disabled={ld||!inp.trim()} style={{flex:1,padding:"10px 0",borderRadius:12,border:"none",background:ld?"#e2e8f0":`linear-gradient(135deg,${ac},#8b5cf6)`,color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",opacity:!inp.trim()?.45:1,boxShadow:!ld&&inp.trim()?"0 4px 12px rgba(99,102,241,.3)":"none"}}>{ld?"⏳ 処理中...":`${md==="claude"?"🧠 Claude":"⚡ Gemini"} で要約`}</button>
<button onClick={clr} style={{padding:"10px 20px",borderRadius:12,border:"1px solid #e2e8f0",background:"#fff",fontSize:14,fontWeight:600,color:"#64748b",fontFamily:"inherit",cursor:"pointer"}}>🗑</button></div>
{out&&<div style={{borderRadius:14,border:`2px solid ${ac}22`,padding:16,background:"linear-gradient(135deg,#eef2ff,#f5f3ff)"}}>
<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontSize:13,fontWeight:700,color:aD}}>{ct.name} 要約結果</span><button onClick={()=>cp(out)} style={{padding:"4px 12px",borderRadius:10,border:`1px solid ${ac}44`,background:"#fff",fontSize:12,fontWeight:600,color:aD,fontFamily:"inherit",cursor:"pointer"}}>📋 コピー</button></div>
<textarea value={out} onChange={e=>sOut(e.target.value)} style={{width:"100%",height:180,padding:12,borderRadius:12,border:"1px solid #e2e8f0",background:"#fff",fontSize:14,color:"#1a1a1a",fontFamily:"inherit",resize:"vertical",lineHeight:1.7,boxSizing:"border-box"}}/></div>}
{ld&&<div style={{textAlign:"center",padding:20}}><div style={{width:32,height:32,border:"3px solid #e2e8f0",borderTop:`3px solid ${ac}`,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 10px"}}/><span style={{color:"#64748b"}}>AIが要約を作成中...</span></div>}
</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>);}
