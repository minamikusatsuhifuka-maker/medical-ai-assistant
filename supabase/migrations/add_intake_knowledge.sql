-- 事前問診項目の抽出機能（疾患別・医師の質問を日常運用で抽出→承認→スタッフ閲覧）
-- 実行方法: Supabase SQL Editor に貼り付けて実行（add_explain_knowledge.sql と同じ流儀）

-- 疾患マスタ（要約の「# 疾患名」見出しから抽出時に自動作成。再抽出で期間・件数を更新）
create table if not exists intake_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  period_from date,
  period_to date,
  record_count integer not null default 0,
  status text not null default 'draft' check (status in ('draft','approved')),
  created_at timestamptz default now()
);

alter table intake_topics enable row level security;
create policy "Allow all on intake_topics" on intake_topics for all using (true) with check (true);

-- 問診項目本体（question=スタッフが読み上げる問診文 / intent=何を確認する質問かの1行メモ）
create table if not exists intake_items (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references intake_topics(id) on delete cascade,
  category text not null check (category in ('発症・経過','症状の性状','悪化因子・生活環境','既往・治療歴','薬剤・アレルギー','その他')),
  question text not null,
  intent text,
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  seen_count integer not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table intake_items enable row level security;
create policy "Allow all on intake_items" on intake_items for all using (true) with check (true);

create index if not exists intake_items_topic_status_idx on intake_items(topic_id, status);
