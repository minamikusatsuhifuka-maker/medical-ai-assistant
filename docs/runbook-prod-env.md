# 手順書：本番の環境変数をファイルに書かずに使う／作業用フォルダの片付け

## 1. 本番の鍵で手元のスクリプト・dev を動かす（`vercel env run`）

### 罠
**このプロジェクトのフォルダで `vercel env run` を実行すると、手元の `.env.local` が優先されて偽の鍵になる。**

- 例：GEMINI_API_KEY が 11 文字の偽物になり、Gemini が 400 を返す。
- `.env.local` は変更・削除しない決まりなので、`.env.local` の側では直さない。

### 回避方法：リンク情報だけを置いた別フォルダから実行する
1. **作業用の空フォルダに、リンク情報だけを写す**（鍵は入っていない）。
   ```bash
   mkdir -p <作業用>/vlink/.vercel
   cp /Users/tpjatpja/medical-ai-assistant/.vercel/project.json <作業用>/vlink/.vercel/
   ```
2. **そのフォルダを `--cwd` にして、本番の環境変数をメモリ上だけで渡す。**
   ```bash
   # スクリプト
   npx vercel env run -e production --cwd <作業用>/vlink -- node <スクリプト>
   # dev（port 3100）
   npx vercel env run -e production --cwd <作業用>/vlink -- npm --prefix /Users/tpjatpja/medical-ai-assistant run dev -- -p 3100
   ```
3. **鍵が本物か確かめるときは、長さだけを出す。**値そのものは出さない。
   ```bash
   npx vercel env run -e production --cwd <作業用>/vlink -- node -e 'console.log((process.env.GEMINI_API_KEY||"").length)'
   ```
   11 なら `.env.local` の偽物です。

### やらないこと
- `vercel env pull` で本番の env をファイルに書き出す。
  - `/dev/stdout` 宛ては EACCES で失敗します。
  - fifo 宛ては止まったまま進みません。
- `.env.local` を書き換える。

### 開発時だけ、わざとモデルを失敗させる
`GEMINI_TEST_FAIL_MODELS=gemini-3.8-flash,gemini-3.7-flash` を付けて dev を起動すると、3.6 への切り替えを確かめられます。`NODE_ENV=production` では効きません。
```bash
npx vercel env run -e production --cwd <作業用>/vlink -- env GEMINI_TEST_FAIL_MODELS=gemini-3.8-flash,gemini-3.7-flash npm --prefix /Users/tpjatpja/medical-ai-assistant run dev -- -p 3100
```

## 2. 作業用フォルダの片付け（院長が実行する）
Claude の作業用フォルダ（`/private/tmp/claude-502/...` の scratchpad）は、Claude 側からは削除が許可されないことがあります。その場合は、院長が Claude Code の入力欄で次を実行してください。先頭の `!` を付けると、その場で実行されます。

1. 中身を確かめる。
   ```
   ! ls -la <報告書に書いた scratchpad の絶対パス>
   ```
2. フォルダごと削除する。
   ```
   ! rm -rf <報告書に書いた scratchpad の絶対パス>
   ```

- 議事録の写し・音声・本番の env など、消すべきものがあるときは、報告書に**絶対パス**を書きます。
- そのセッションの作業が終わったあとなら、フォルダごと消して問題ありません。
