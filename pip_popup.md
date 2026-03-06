# 小窓（PiP）に要約完了後のポップアップ表示

app/page.jsを修正してください。既存機能は壊さないでください。

## 修正箇所

pip-sum のonclick処理内で、要約完了後のアラート表示部分を修正します。

現在は「✅ 要約完了・📋コピー済み」のような短いメッセージだけが表示されています。
これを要約内容のプレビューも含めたポップアップに変更します。

### pip-sumのonclick内のcheckDone setInterval部分を修正

grep で現在の完了表示を確認:
```
grep -n "pip-alert\|要約完了" app/page.js | head -20
```

pip-sum onclick内の、sumDoneRef.current===true 後の setTimeout 内で、アラートdivを作成している部分を見つけてください。

現在の「✅ 要約完了・📋コピー済み」のdiv作成部分を、以下のような要約プレビュー付きポップアップに差し替えてください。

具体的には、setTimeout内の alertDiv 作成部分（outputText取得後）を以下に変更:

```js
const alertDiv=d.createElement("div");alertDiv.id="pip-alert";alertDiv.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.85);color:#fff;z-index:9999;display:flex;flex-direction:column;padding:8px;box-sizing:border-box;overflow:hidden";

const header=d.createElement("div");header.style.cssText="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-shrink:0";
const title=d.createElement("div");title.style.cssText="font-size:11px;font-weight:700;color:#22c55e";title.textContent="✅ 要約完了";
const closeBtn=d.createElement("button");closeBtn.style.cssText="padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:#fff;font-size:10px;font-weight:700;cursor:pointer";closeBtn.textContent="✕ 閉じる";closeBtn.onclick=()=>{alertDiv.remove()};
header.appendChild(title);header.appendChild(closeBtn);alertDiv.appendChild(header);

const content=d.createElement("div");content.style.cssText="flex:1;overflow-y:auto;font-size:10px;line-height:1.5;color:#e5e7eb;white-space:pre-wrap;word-break:break-word;background:rgba(255,255,255,.08);border-radius:6px;padding:6px;margin-bottom:4px";content.textContent=outputText||"（要約なし）";alertDiv.appendChild(content);

const btnRow=d.createElement("div");btnRow.style.cssText="display:flex;gap:4px;flex-shrink:0";
const copyBtn2=d.createElement("button");copyBtn2.style.cssText="flex:1;padding:4px;border-radius:6px;border:none;background:#22c55e;color:#fff;font-size:10px;font-weight:700;cursor:pointer";copyBtn2.textContent="📋 コピー";copyBtn2.onclick=()=>{try{const ta=document.createElement('textarea');ta.value=outputText;ta.style.cssText='position:fixed;left:-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);copyBtn2.textContent='✅ コピー済み';copyBtn2.style.background='#16a34a'}catch{try{navigator.clipboard.writeText(outputText)}catch{}}};
btnRow.appendChild(copyBtn2);
const nextBtn2=d.createElement("button");nextBtn2.style.cssText="flex:1;padding:4px;border-radius:6px;border:2px solid #fff;background:rgba(255,255,255,.15);color:#fff;font-size:10px;font-weight:700;cursor:pointer";nextBtn2.textContent="次へ ▶";nextBtn2.onclick=()=>{alertDiv.remove();const nb=d.getElementById('pip-next');if(nb)nb.click()};
btnRow.appendChild(nextBtn2);alertDiv.appendChild(btnRow);

d.body.appendChild(alertDiv);
```

### 変更のポイント

上記コードで現在の短いアラートdiv作成部分を**完全に差し替え**してください。
outputText.trim()の有無に関わらず、このポップアップを表示します。

つまり、現在の以下の構造:
```
if(outputText.trim()){...コピー処理...アラートdiv作成...}else{...アラートdiv作成...}
```

を、以下のシンプルな構造に変更:
```
// コピー処理（メインウィンドウから）
try{const ta=document.createElement('textarea');ta.value=outputText;ta.style.cssText='position:fixed;left:-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta)}catch{try{navigator.clipboard.writeText(outputText)}catch{}}
// ポップアップ表示（上記のalertDiv作成コード）
```

ビルドが通ることを確認してください。
