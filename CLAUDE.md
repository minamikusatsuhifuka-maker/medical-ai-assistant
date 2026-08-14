# 南草津皮フ科 AIカルテ要約 - 開発ルール

## プロジェクト概要
- Next.js 14 / React 18 / Supabase / Vercel
- メインファイル: app/page.js（単一ファイルで全UI・ロジック）
- 要約API: Gemini 3.7 Flash（設定で 3.6 Flash / 2.5 Pro / Claude Sonnet 4.6 に切替可。診察のLiteトグルは複数疾患SOAPの分離に失敗するため撤去済み）
- 書き起こしAPI: OpenAI Whisper

## 必須ルール（破るとアプリが壊れる）

### React Hooksの順序
- useStateの宣言は必ずuseEffectより前に書く
- useEffectの依存配列に未宣言のstateを入れない
- useEffect内で参照するstateが後の行で宣言される場合はuseRefパターンを使う

### state参照
- 存在しないstateやrefを参照しない
- 新しいモーダルを追加する際は必ずuseState宣言を追加してから参照する
- 複数のstateを一度に追加する場合は宣言をまとめて先頭に置く

### エラー防止
- localStorage参照はuseEffect内のみ（SSRエラー防止）
- Supabase操作は必ずtry/catchで囲む
- 外部API呼び出しは必ずエラーハンドリングを入れる

### コード変更
- 既存の動作しているロジックを不用意に削除しない
- 「既に実装済み」と判断してスキップする前に実際にコードを確認する
- 変更箇所は最小限にする

## APIファイル一覧
- summarize/route.js: Gemini/Claude切替対応（gemini-3-5-flash-lite 指定は旧クライアント互換で標準リストに丸める）
- transcribe/route.js: Whisper（変更禁止）
- その他Geminiルートは app/lib/gemini-models.js の GEMINI_MODELS（3.7 Flash第一候補）にフォールバック集約。モデル変更はこの1ファイルで行う

### thinkingLevel はモデル世代で値が違う（重要）
- **Gemini 3.7 以降は `thinkingLevel:"minimal"` が使えない**（HTTP 400 INVALID_ARGUMENT）。3.7 は low / medium(既定) / high のみ
- そのため `model.startsWith("gemini-3")` で一律 minimal を付けると 3.7 で全リクエストが落ちる
- 分岐は `app/lib/gemini-models.js` の `thinkingLevelFor()` / `applyThinking()` に集約済み。genConfig を組む側で直接 thinkingConfig を書かない

## ビルド・デプロイ
- 必ずnpm run buildで成功確認してからデプロイ
- デプロイ: git push origin main && npx vercel --prod
