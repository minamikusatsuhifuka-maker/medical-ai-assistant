-- 説明ナレッジ機能（疾患別・院長の説明の型を日次抽出→承認→スタッフ閲覧）
-- 実行方法: Supabase SQL Editor に貼り付けて実行（既存の add_dictionary.sql / add_favorites.sql と同じ流儀）

-- 疾患マスタ（抽出時にAIが疾患名を正規化して自動作成。表記ゆれは aliases で同一視）
create table if not exists explain_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aliases text[] default '{}',
  created_at timestamptz default now()
);

alter table explain_topics enable row level security;
create policy "Allow all on explain_topics" on explain_topics for all using (true) with check (true);

-- ナレッジ本体
create table if not exists explain_items (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references explain_topics(id) on delete cascade,
  category text not null check (category in ('treatment','explanation','skincare','qa','caution')),
  content text not null,
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  seen_count integer not null default 1,
  source_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table explain_items enable row level security;
create policy "Allow all on explain_items" on explain_items for all using (true) with check (true);

create index if not exists explain_items_topic_status_idx on explain_items(topic_id, status);
