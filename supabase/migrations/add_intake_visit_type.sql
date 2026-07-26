-- 事前問診: 問診項目に初診/再診/共通の区分を追加（指示書 intake-quality-fix §C）
-- 実行方法: Supabase SQL Editor に貼り付けて実行（再実行しても安全）

alter table intake_items add column if not exists visit_type text not null default '共通'
  check (visit_type in ('初診','再診','共通'));
