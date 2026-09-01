-- 録音音声管理: 編集タイトルの保存先（診察 records にはタイトル列が無く、未紐付け音声にはレコード自体が無いため別テーブル）
-- item_key: 診察は "record:<records.id>"、未紐付け音声は Storage パス（例 "audio/r7/2026-...webm"）
-- 議事録は minutes.title（既存カラム）に直接保存するのでこの表には入らない
-- 実行: Supabase ダッシュボード → SQL Editor で本ファイルを実行（add_favorites.sql と同じ手動SQL流儀）
create table if not exists audio_titles (
  item_key text primary key,
  title text not null,
  updated_at timestamptz not null default now()
);

alter table audio_titles enable row level security;

-- 既存表（favorites 等）と同じく anon 全権。CREATE POLICY は IF NOT EXISTS 非対応のため DO ブロックで冪等化
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audio_titles' and policyname='anon_all_audio_titles') then
    create policy anon_all_audio_titles on audio_titles for all to anon using (true) with check (true);
  end if;
end $$;
