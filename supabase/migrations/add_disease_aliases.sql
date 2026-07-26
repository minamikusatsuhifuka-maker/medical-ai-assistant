-- 疾患見出しの名寄せ用エイリアス辞書（カノニカルキーで寄りきらないものを院長が手で統合する）
-- 実行方法: Supabase SQL Editor に貼り付けて実行（add_intake_knowledge.sql と同じ流儀）

create table if not exists disease_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique,
  canonical text not null,
  created_at timestamptz default now()
);

alter table disease_aliases enable row level security;
create policy "Allow all on disease_aliases" on disease_aliases for all using (true) with check (true);
