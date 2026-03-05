# タスク一括登録（スクリーンショットから取り込み）

Supabaseのtasksテーブルに以下のタスクを登録してください。

## 前提
- minute_id は null（議事録からの生成ではないため）
- 全タスクに category_source: "manual_import_20260305" のようなメモを残すため、タスクのtitleの末尾に何も付けない
- done: false（全て未着手）
- 既存タスクは一切変更しない

## 登録方法

ターミナルで以下のNode.jsスクリプトを実行してください。
.env.localからSupabaseの接続情報を読み込みます。

```bash
node -e "
const fs = require('fs');
const env = fs.readFileSync('.env.local','utf8');
const getEnv = (key) => {
  const m = env.match(new RegExp(key + '=(.+)'));
  return m ? m[1].trim() : '';
};
const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_KEY = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');

const tasks = [
  // ===== 第I象限: 重要かつ緊急 (urgency:4, importance:4) =====
  {title:'返金対応',urgency:4,importance:4,category:'finance'},
  {title:'レセプト作業',urgency:4,importance:4,category:'operations'},
  {title:'返戻のダウンロード',urgency:4,importance:4,category:'finance'},
  {title:'会計時のORCAエラー修正',urgency:4,importance:4,category:'operations'},
  {title:'会計処理',urgency:4,importance:4,category:'finance'},
  {title:'未収金徴収',urgency:4,importance:4,category:'finance'},
  {title:'スキンポット新規患者登録',urgency:4,importance:4,category:'operations'},
  {title:'MFに同意書更新',urgency:4,importance:4,category:'operations'},
  {title:'N:写真取り込み',urgency:4,importance:4,category:'operations'},
  {title:'N:診療補助/検査データ取り込み・整理',urgency:4,importance:4,category:'medical'},
  {title:'書類スキャン',urgency:4,importance:4,category:'operations'},
  {title:'電話対応',urgency:4,importance:4,category:'operations'},
  {title:'カルテ統合作業',urgency:4,importance:4,category:'medical'},
  {title:'カルテ作成',urgency:4,importance:4,category:'medical'},
  {title:'事前問診未の方の対応',urgency:4,importance:4,category:'medical'},
  {title:'診察後の患者対応/確認など',urgency:4,importance:4,category:'medical'},
  {title:'予約取得/手動予約・オペ',urgency:4,importance:4,category:'operations'},
  {title:'紹介状手続き',urgency:4,importance:4,category:'medical'},
  {title:'N:診療補助/問診',urgency:4,importance:4,category:'medical'},
  {title:'N:カルテ記録',urgency:4,importance:4,category:'medical'},
  {title:'N:診療補助/処置・検査',urgency:4,importance:4,category:'medical'},
  {title:'N:美容/洗面台準備',urgency:4,importance:4,category:'operations'},
  {title:'N:美容/機械片づけ',urgency:4,importance:4,category:'operations'},
  {title:'N:美容/対応患者見送り',urgency:4,importance:4,category:'operations'},
  {title:'N:美容/部屋片づけ',urgency:4,importance:4,category:'operations'},
  {title:'N:美容/施術準備',urgency:4,importance:4,category:'operations'},
  {title:'N:物販対応',urgency:4,importance:4,category:'operations'},
  {title:'N:美容/会計処理',urgency:4,importance:4,category:'finance'},
  {title:'N:美容/契約',urgency:4,importance:4,category:'finance'},
  {title:'N:美容/施術',urgency:4,importance:4,category:'medical'},
  {title:'N:電話対応',urgency:4,importance:4,category:'operations'},
  {title:'N:施術間隔リスト',urgency:4,importance:4,category:'operations'},
  {title:'N:薬剤作成/50%サリワセ',urgency:4,importance:4,category:'medical'},

  // ===== 第II象限: 緊急ではないが重要 (urgency:2, importance:4) =====
  {title:'担当：画像作成',urgency:2,importance:4,category:'operations'},
  {title:'朝の掃除',urgency:2,importance:4,category:'operations'},
  {title:'マニュアル作成',urgency:2,importance:4,category:'operations'},
  {title:'各種テンプレ作成',urgency:2,importance:4,category:'operations'},
  {title:'レセプトエラー確認/W1',urgency:2,importance:4,category:'finance'},
  {title:'返戻下げる',urgency:2,importance:4,category:'finance'},
  {title:'成約率UP',urgency:2,importance:4,category:'operations'},
  {title:'院内掲示物作成',urgency:2,importance:4,category:'operations'},
  {title:'資料作成',urgency:2,importance:4,category:'operations'},
  {title:'担当：SNS対応',urgency:2,importance:4,category:'operations'},

  // ===== 第III象限: 重要ではないが緊急 (urgency:4, importance:2) =====
  {title:'施術・CS予約確認',urgency:4,importance:2,category:'operations'},
  {title:'WEB予約の説明',urgency:4,importance:2,category:'operations'},
  {title:'デジタル診察券のご案内',urgency:4,importance:2,category:'operations'},
  {title:'LINE診察券の案内',urgency:4,importance:2,category:'operations'},
  {title:'予約表印刷・メモ記入',urgency:4,importance:2,category:'operations'},
  {title:'テマサック：両替確認・補充',urgency:4,importance:2,category:'finance'},
  {title:'N:機械滅菌',urgency:4,importance:2,category:'operations'},
  {title:'N:機械メンテナンス',urgency:4,importance:2,category:'operations'},
  {title:'N:物品補充',urgency:4,importance:2,category:'operations'},
  {title:'N:メール対応',urgency:4,importance:2,category:'operations'},
  {title:'N:施術の空き状況を発信',urgency:4,importance:2,category:'operations'},
  {title:'書類の処理',urgency:4,importance:2,category:'operations'},
  {title:'在庫管理',urgency:4,importance:2,category:'operations'},
  {title:'発注業務：日用品',urgency:4,importance:2,category:'operations'},
  {title:'発注業務：医療消耗品',urgency:4,importance:2,category:'operations'},
  {title:'発注業務：院内販売の品',urgency:4,importance:2,category:'operations'},
  {title:'メール対応',urgency:4,importance:2,category:'operations'},
  {title:'紹介状対応',urgency:4,importance:2,category:'medical'},
  {title:'患者様対応',urgency:4,importance:2,category:'medical'},
  {title:'テマサックのレジロール交換',urgency:4,importance:2,category:'operations'},

  // ===== 第IV象限: 重要でも緊急でもない (urgency:2, importance:2) =====
  {title:'スキンポット情報入力',urgency:2,importance:2,category:'operations'},
  {title:'掃除活動/M1',urgency:2,importance:2,category:'operations'},
  {title:'月当番：TODO',urgency:2,importance:2,category:'operations'},
  {title:'月当番：今月の予定をチャットワークに共有する',urgency:2,importance:2,category:'operations'},
  {title:'月当番：粗大ごみ日程調整',urgency:2,importance:2,category:'operations'},
  {title:'担当：説明会日程調整',urgency:2,importance:2,category:'hr'},
  {title:'銀行に両替に行く',urgency:2,importance:2,category:'finance'},
  {title:'美白内服セット袋詰め',urgency:2,importance:2,category:'operations'},
  {title:'シュレッダーをかける',urgency:2,importance:2,category:'operations'},
  {title:'請求書・領収書の整理',urgency:2,importance:2,category:'finance'},
  {title:'配達品の対応',urgency:2,importance:2,category:'operations'},
  {title:'N:タオル類の洗濯',urgency:2,importance:2,category:'operations'},
  {title:'N:医療廃棄物管理・廃棄連絡',urgency:2,importance:2,category:'operations'},
];

async function run() {
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('Total tasks:', tasks.length);
  
  // まず議事録を作成（タスクのグループ化用）
  const minRes = await fetch(SUPABASE_URL + '/rest/v1/minutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      title: '【手動取込】業務タスク一括登録 2026/03/05',
      input_text: JSON.stringify({source:'manual_import',date:'2026-03-05',count:tasks.length}),
      output_text: '四象限マトリクスのスクリーンショットから取り込んだ業務タスク（' + tasks.length + '件）'
    })
  });
  const minData = await minRes.json();
  const minuteId = Array.isArray(minData) ? minData[0]?.id : minData?.id;
  console.log('Created minute:', minuteId);
  
  let success = 0;
  let fail = 0;
  for (const t of tasks) {
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
        },
        body: JSON.stringify({
          minute_id: minuteId,
          title: t.title,
          assignee: '',
          due_date: null,
          urgency: t.urgency,
          importance: t.importance,
          category: t.category,
          done: false
        })
      });
      if (res.ok) { success++; } else { 
        const err = await res.text();
        console.error('Failed:', t.title, err); 
        fail++; 
      }
    } catch(e) { console.error('Error:', t.title, e.message); fail++; }
  }
  console.log('Done! Success:', success, 'Failed:', fail);
}
run().catch(e => console.error(e));
"
```

ビルドは不要です。スクリプト実行のみです。
