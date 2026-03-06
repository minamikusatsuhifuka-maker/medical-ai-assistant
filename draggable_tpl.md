# テンプレートボタンのドラッグ並び替え機能

app/page.jsを修正してください。既存機能は壊さないでください。

## 1. テンプレート順序のstateを追加

既存のstate宣言の近く（tidの近く）に追加:

```js
const[tplOrder,setTplOrder]=useState(null);
const[dragTpl,setDragTpl]=useState(null);
```

## 2. テンプレート順序のローカルストレージ読み込み

既存のuseEffect（localStorageから設定を読み込む部分）の中に追加:

```js
try{const o=localStorage.getItem("mk_tplOrder");if(o)setTplOrder(JSON.parse(o))}catch{}
```

## 3. テンプレート順序の保存

設定の保存ボタン（💾 保存）のonClick内、他のlocalStorage.setItemの並びに追加:

```js
if(tplOrder)localStorage.setItem("mk_tplOrder",JSON.stringify(tplOrder));
```

## 4. テンプレートボタンの表示を並び替え対応に変更

テンプレートタブボタンが並ぶ箇所を見つけてください:
```
grep -n "T.map\|T\.map" app/page.js | head -5
```

現在のT.mapの部分を以下に変更:

現在（例）:
```jsx
{T.map(t=>(<button key={t.id} onClick={()=>sTid(t.id)} style={{...}}>{t.name}</button>))}
```

変更後:
```jsx
{(tplOrder?tplOrder.map(id=>T.find(t=>t.id===id)).filter(Boolean):T).map((t,idx)=>(<button key={t.id}
draggable
onDragStart={e=>{setDragTpl(idx);e.dataTransfer.effectAllowed="move"}}
onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move"}}
onDrop={e=>{e.preventDefault();if(dragTpl===null||dragTpl===idx)return;const order=tplOrder?[...tplOrder]:T.map(x=>x.id);const[item]=order.splice(dragTpl,1);order.splice(idx,0,item);setTplOrder(order);setDragTpl(null);try{localStorage.setItem("mk_tplOrder",JSON.stringify(order))}catch{}}}
onDragEnd={()=>setDragTpl(null)}
onClick={()=>sTid(t.id)}
style={{padding:mob?"4px 8px":"5px 12px",borderRadius:10,border:tid===t.id?`2px solid ${C.p}`:`1.5px solid ${C.g200}`,background:tid===t.id?C.pLL:C.w,fontSize:mob?11:12,fontWeight:tid===t.id?700:500,color:tid===t.id?C.pD:C.g600,fontFamily:"inherit",cursor:"grab",boxShadow:dragTpl===idx?"0 4px 12px rgba(0,0,0,.3)":"0 1px 4px rgba(0,0,0,.1)",opacity:dragTpl===idx?0.5:1,transition:"all 0.15s ease",transform:dragTpl===idx?"scale(1.05)":"scale(1)",whiteSpace:"nowrap"}}>{t.name}</button>))}
```

## 5. 設定ページにテンプレート順序リセットボタンを追加（オプション）

設定ページ内の適切な場所に追加:

```jsx
<div style={{marginTop:12}}>
<span style={{fontSize:13,fontWeight:700,color:C.pD}}>📋 テンプレート並び順</span>
<p style={{fontSize:11,color:C.g500,margin:"4px 0 8px"}}>トップ画面のテンプレートボタンはドラッグで並び替えできます</p>
<button onClick={()=>{setTplOrder(null);try{localStorage.removeItem("mk_tplOrder")}catch{};sSt("テンプレート順序をリセットしました")}} style={{padding:"4px 12px",borderRadius:8,border:`1px solid ${C.g200}`,background:C.w,fontSize:11,fontWeight:600,color:C.g600,fontFamily:"inherit",cursor:"pointer"}}>🔄 デフォルトに戻す</button>
</div>
```

ビルドが通ることを確認してください。
