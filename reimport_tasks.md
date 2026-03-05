# タスク再登録（既存取込分を削除→独立した議事録に再登録）

ターミナルで以下のスクリプトをそのまま実行してください。

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

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
};

const tasks = [
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
  console.log('=== Step 1: 前回の手動取込タスクを削除 ===');

  // 手動取込の議事録を検索
  const minRes = await fetch(SUPABASE_URL + '/rest/v1/minutes?title=like.*手動取込*&select=id,title', {
    headers
  });
  const mins = await minRes.json();
  console.log('Found import minutes:', mins.length);

  for (const m of mins) {
    // 紐づくタスクを削除
    const delRes = await fetch(SUPABASE_URL + '/rest/v1/tasks?minute_id=eq.' + m.id, {
      method: 'DELETE', headers
    });
    console.log('Deleted tasks for minute', m.id, ':', delRes.status);
    // 議事録も削除
    const delMin = await fetch(SUPABASE_URL + '/rest/v1/minutes?id=eq.' + m.id, {
      method: 'DELETE', headers
    });
    console.log('Deleted minute', m.id, ':', delMin.status);
  }

  // minute_id=nullのタスクも削除（前回nullで登録された可能性）
  const titleList = tasks.map(t => t.title);
  const nullRes = await fetch(SUPABASE_URL + '/rest/v1/tasks?minute_id=is.null&select=id,title', {
    headers
  });
  const nullTasks = await nullRes.json();
  for (const nt of nullTasks) {
    if (titleList.includes(nt.title)) {
      await fetch(SUPABASE_URL + '/rest/v1/tasks?id=eq.' + nt.id, {
        method: 'DELETE', headers
      });
      console.log('Deleted orphan task:', nt.title);
    }
  }

  console.log('');
  console.log('=== Step 2: 専用の議事録レコードを作成 ===');

  const createMin = await fetch(SUPABASE_URL + '/rest/v1/minutes', {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({
      title: '【業務タスク一覧】四象限マトリクス取込 2026/03/05',
      input_text: JSON.stringify({
        source: 'screenshot_import',
        date: '2026-03-05',
        description: '四象限マトリクスのスクリーンショットから手動取込。ミーティングタスクとは別管理。',
        count: tasks.length
      }),
      output_text: '業務タスク一括登録（' + tasks.length + '件）\\n\\n第I象限（重要かつ緊急）: 33件\\n第II象限（緊急ではないが重要）: 10件\\n第III象限（重要ではないが緊急）: 20件\\n第IV象限（重要でも緊急でもない）: 12件'
    })
  });
  const minData = await createMin.json();
  const minuteId = Array.isArray(minData) ? minData[0].id : minData.id;
  console.log('Created minute ID:', minuteId);

  console.log('');
  console.log('=== Step 3: タスクを登録 ===');

  let success = 0, fail = 0;
  for (const t of tasks) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/tasks', {
      method: 'POST',
      headers,
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
      console.error('FAIL:', t.title, err);
      fail++;
    }
  }

  console.log('');
  console.log('=== 完了 ===');
  console.log('成功:', success, '件');
  console.log('失敗:', fail, '件');
  console.log('議事録ID:', minuteId);
  console.log('タイトル: 【業務タスク一覧】四象限マトリクス取込 2026/03/05');
}
run().catch(e => console.error(e));
"
```
