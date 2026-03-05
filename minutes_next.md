# 議事録ページに「次へ」ボタン追加

app/page.jsを修正してください。既存機能は壊さないでください。

## 1. 議事録ページの「次の打合せへ」関数を追加

minSum関数の近くに以下の関数を追加:

```js
const minNext=()=>{minStop();setMinOut("");if(minIR)minIR.current="";setMinEl(0);setMinTitle("");sSt("次の打合せへ ✓")};
```

## 2. 議事録ページのUIに「次へ」ボタンを追加

議事録ページ（page==="minutes"）のreturn文の中を確認:
```
grep -n "page.*minutes.*return\|議事録まとめ" app/page.js | head -10
```

議事録ページ内の「停止」ボタンの近く、または議事録出力エリアの下に「次へ」ボタンを追加してください。

具体的には、議事録ページ内の操作ボタン群（録音開始、停止など）の並びに「次へ」ボタンを追加:

```jsx
<button onClick={minNext} style={{padding:"10px 24px",borderRadius:14,border:"2px solid "+C.p,background:C.w,color:C.pD,fontSize:14,fontWeight:700,fontFamily:"inherit",cursor:"pointer",boxShadow:"0 2px 6px rgba(0,0,0,.12)"}}>次へ ▶</button>
```

このボタンの配置場所は、議事録の「停止」ボタンの右横が最適です。
もし停止ボタンの横にスペースがなければ、議事録出力エリア（minOut表示）の下、閉じるボタンの横に配置してください。

## 3. 要約完了後のステータスにも案内を追加

minSum関数内でsetMinOut(d.summary)の後、sSt表示を見つけて「次へで新しい打合せ」の案内を追加:

現在のsSt（minSum成功時）を探して:
```
grep -n "sSt.*議事録\|sSt.*完了" app/page.js | head -5
```

もし議事録完了時のsSt表示があれば、そのメッセージに「→ 次へで新規打合せ」を追記。
なければ、setMinOut(d.summary)の直後に追加:
```js
sSt("議事録作成完了 ✓ → 次へで新規打合せ");
```

ビルドが通ることを確認してください。
