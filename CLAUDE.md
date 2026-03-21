# 南草津皮フ科 AIカルテ要約 - 開発ルール

## プロジェクト概要
- Next.js 14 / React 18 / Supabase / Vercel
- メインファイル: app/page.js（単一ファイルで全UI・ロジック）
- 要約API: Gemini 2.5 Flash（設定でClaude Sonnet 4.6切替可）
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
- summarize/route.js: Gemini/Claude切替対応
- transcribe/route.js: Whisper（変更禁止）
- fix-typos/route.js: Gemini 2.5 Pro（maxDuration:60）
- その他APIは全てGemini 2.5 Flash

## ビルド・デプロイ
- 必ずnpm run buildで成功確認してからデプロイ
- デプロイ: git push origin main && npx vercel --prod
