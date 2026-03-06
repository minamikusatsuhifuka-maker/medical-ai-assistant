# ショートカットキー変更機能 + スニペット（追記）コンパクト化

app/page.jsを修正してください。既存機能は壊さないでください。

## 修正1: ショートカット設定にキー変更機能を追加

ショートカット一覧ページ（page==="shortcuts"）のshortcuts.map内を修正します。

行948付近の shortcuts.map 内を見つけてください:
```
grep -n "shortcuts.map" app/page.js | head -5
```

現在の各ショートカット項目の表示を確認。現在はラベル・ON/OFF・⭐のみで、キー変更の入力欄がありません。

shortcuts.map内の各アイテムのレンダリングで、キー表示部分（sc.keyを表示しているkbd等）を見つけて、以下のように**キー変更入力欄**に差し替えてください。

現在のshortcuts.mapの中身を以下に**完全差し替え**:

```jsx
{shortcuts.map((sc,i)=>(<div key={sc.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:10,background:sc.enabled?C.g50:"#fafafa",border:`1px solid ${sc.enabled?C.g200:"#eee"}`,opacity:sc.enabled?1:0.5,marginBottom:4}}>
<button onClick={()=>{const u=[...shortcuts];u[i]={...u[i],showOnTop:!u[i].showOnTop};setShortcuts(u)}} style={{padding:"2px 5px",borderRadius:5,border:sc.showOnTop?`2px solid ${C.p}`:`1px solid ${C.g200}`,background:sc.showOnTop?C.pLL:C.w,fontSize:10,color:sc.showOnTop?C.pD:C.g400,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>{sc.showOnTop?"⭐":"☆"}</button>
<span style={{fontSize:12,fontWeight:600,color:C.pDD,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sc.label}</span>
<input value={sc.key} onChange={e=>{const u=[...shortcuts];u[i]={...u[i],key:e.target.value};setShortcuts(u)}} onKeyDown={e=>{if(["Tab","Shift","Control","Alt","Meta"].includes(e.key))return;e.preventDefault();let k="";if(e.ctrlKey||e.metaKey)k+="Ctrl+";if(e.shiftKey)k+="Shift+";if(e.altKey)k+="Alt+";if(e.key==="ArrowUp")k+="ArrowUp";else if(e.key==="ArrowDown")k+="ArrowDown";else if(e.key==="ArrowLeft")k+="ArrowLeft";else if(e.key==="ArrowRight")k+="ArrowRight";else if(e.key===" ")k+="Space";else if(e.key.startsWith("F")&&/^F\d+$/.test(e.key))k+=e.key;else k+=e.key.toUpperCase();const u=[...shortcuts];u[i]={...u[i],key:k};setShortcuts(u)}} style={{width:100,padding:"3px 6px",borderRadius:6,border:`1.5px solid ${C.p}`,background:C.w,fontSize:11,fontWeight:700,color:C.pD,fontFamily:"inherit",textAlign:"center",cursor:"pointer",flexShrink:0}} title="クリックしてキーを押すと変更" placeholder="キーを押す"/>
<button onClick={()=>{const u=[...shortcuts];u[i]={...u[i],enabled:!u[i].enabled};setShortcuts(u)}} style={{padding:"3px 8px",borderRadius:6,border:"none",background:sc.enabled?C.rG:C.g200,color:sc.enabled?C.w:C.g500,fontSize:10,fontWeight:700,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>{sc.enabled?"ON":"OFF"}</button>
</div>))}
```

これにより:
- 各ショートカットにキー入力欄が表示される
- 入力欄をクリックしてキーを押すと自動でキー名が入力される（例: F6, Ctrl+S, ArrowUp等）
- Ctrl/Shift/Alt の組み合わせも対応

## 修正2: スニペット（追記ボタン）をコンパクトに

メインページの追記ボタン表示部分を見つけてください:
```
grep -n "snippets.*map\|openCats\|cat.*filter" app/page.js | head -10
```

現在のスニペット表示がカテゴリ別の箇条書きで縦長になっています。これをカテゴリ別のコンパクトなインライン表示に変更します。

メインページのスニペット表示部分（追記テンプレートのボタン群）を以下に差し替え:

現在のスニペット表示ブロック全体を見つけて、以下のコンパクト版に差し替えてください。

```jsx
<div style={{display:"flex",flexWrap:"wrap",gap:4,padding:"6px 0"}}>
{[...new Set(snippets.map(s=>s.cat||"その他"))].map(cat=>(
<div key={cat} style={{display:"flex",flexWrap:"wrap",gap:3,alignItems:"center"}}>
<span style={{fontSize:9,color:C.g400,fontWeight:600,padding:"0 2px"}}>{cat}:</span>
{snippets.filter(s=>(s.cat||"その他")===cat).map((sn,j)=>(
<button key={j} onClick={()=>{sOut(o=>o+(o?"\n":"")+sn.text);navigator.clipboard.writeText(sn.text).catch(()=>{});sSt("📋 "+sn.title+" をコピー")}} style={{padding:"2px 8px",borderRadius:6,border:`1px solid ${C.g200}`,background:C.w,fontSize:10,fontWeight:600,color:C.pD,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>{sn.title}</button>
))}
</div>
))}
</div>
```

これにより:
- カテゴリ名がラベルとして横に表示（例: 「処方: ステロイド ヒルドイド 抗ヒス」）
- 全ボタンが横並びでフレックスラップ
- 開閉式ではなく常に全表示
- スクロール不要のコンパクトレイアウト

ビルドが通ることを確認してください。
