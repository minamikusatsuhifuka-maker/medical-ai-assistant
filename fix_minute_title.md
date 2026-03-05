# 議事録タイトルに時刻を自動付与

app/page.jsを修正してください。既存機能は壊さないでください。

## 修正箇所

minSum関数内で、議事録をSupabaseに保存する際のtitleを見つけてください:

```
grep -n "minTitle\|の議事録" app/page.js | head -10
```

現在のコード（minSum関数内）:
```js
title:minTitle||new Date().toLocaleDateString("ja-JP")+"の議事録"
```

以下に変更:
```js
title:minTitle||new Date().toLocaleDateString("ja-JP")+" "+new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+"の議事録"
```

これにより、タイトル未入力時は「2026/3/5 14:30の議事録」のように自動命名されます。

ビルドが通ることを確認してください。
