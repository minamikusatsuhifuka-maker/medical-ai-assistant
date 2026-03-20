CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id text,
  group_name text NOT NULL DEFAULT 'その他',
  title text,
  content text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS anon_all_favorites ON favorites
  FOR ALL TO anon USING (true) WITH CHECK (true);
