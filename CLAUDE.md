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
- その他Geminiルートは app/lib/gemini-models.js の GEMINI_MODELS（2026-11-14 から gemini-4-hydrogen 先頭 → 3.8 → …）にフォールバック集約。モデル変更はこの1ファイルで行う

### thinkingLevel はモデル世代で値が違う（重要）
- **Gemini 3.7 以降は `thinkingLevel:"minimal"` が使えない**（HTTP 400 INVALID_ARGUMENT）。3.7 は low / medium(既定) / high のみ
- そのため `model.startsWith("gemini-3")` で一律 minimal を付けると 3.7 で全リクエストが落ちる
- 分岐は `app/lib/gemini-models.js` の `thinkingLevelFor()` / `applyThinking()` に集約済み。genConfig を組む側で直接 thinkingConfig を書かない
- **gemini-4-hydrogen は thinkingLevel を付けないと既定 High**（思考が low の約 6 倍・診察の要約で 30 秒超・上限 8192 を食い潰して空になる）。新しい Gemini 呼び出しは必ず `applyThinking(cfg, model, GEMINI_THINKING.xxx)` か `callGeminiWithFallback` を通す。強さは `GEMINI_THINKING`（既定 low・議事録 medium）
- 利用ログの出力トークンは `geminiOutputTokens(usageMetadata)`（思考の分を含む）。料金表 `app/lib/pricing.js` に無いモデルは `(fallback)` で高めに数えられるので、モデルを足したら料金表にも足す
- 実測と判断は `docs/gemini-4-hydrogen-2026-11-14.md`

### モデルの判断と本番の鍵（2026-11-02）
- 診察の要約は 2026-11-15 から Gemini 4 Hydrogen（Low）既定・Hydrogen → 3.8 → 3.6（院長の判断・`docs/exam-to-hydrogen-2026-11-15.md`）。設定 ▸ 要約AIモデル の 2 択は Supabase の app_settings（exam_summary_model）で全端末共有、サーバーも要約のたびに読む。院長が戻すのは設定で「Gemini 3.8 Flash」を押すだけ
- 2 週間の記録: `scripts/report-exam-model.mjs`（利用ログの request_meta の exam_choice / fallback / attempts）
- 以前の判断（3.6 のまま）と 3.6/3.8 の比較は `docs/exam-model-decision-2026-11-02.md`
- 本番の鍵で手元を動かすときは `docs/runbook-prod-env.md`（**このフォルダで `vercel env run` すると `.env.local` の偽の鍵が優先される**）
- Claude Sonnet 4.6 は使わない（補充しない院長の判断・2026-11-02）。要約テストラボの選択肢は 3.8 / 3.6 の2つ。API の Claude の経路も削除済み

## ビルド・デプロイ
- 必ずnpm run buildで成功確認してからデプロイ
- デプロイ: git push origin main && npx vercel --prod
