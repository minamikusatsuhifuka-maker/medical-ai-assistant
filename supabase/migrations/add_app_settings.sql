-- 全端末で共有する設定（指示書 exam-to-hydrogen §1・2026-11-14）
-- 例: key='exam_summary_model' / value='exam-hydrogen' | 'exam-3-8'
--   院長が 1 台で切り替えると、スタッフの端末も次の要約から同じモデルになる。
-- 実行方法: Supabase SQL Editor に貼り付けて実行（または supabase db query --remote=<ref> -f このファイル）。何度実行しても安全。

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

-- 他の表と同じく anon で読み書き（このアプリは院内専用・ログインなし）。消すことはできない（delete の方針を作らない）
drop policy if exists "app_settings select" on app_settings;
drop policy if exists "app_settings insert" on app_settings;
drop policy if exists "app_settings update" on app_settings;
create policy "app_settings select" on app_settings for select using (true);
create policy "app_settings insert" on app_settings for insert with check (true);
create policy "app_settings update" on app_settings for update using (true) with check (true);
