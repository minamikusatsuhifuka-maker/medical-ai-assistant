create table if not exists dictionary (
  id uuid primary key default gen_random_uuid(),
  from_text text not null,
  to_text text not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table dictionary enable row level security;

-- Allow all operations for anonymous/authenticated users
create policy "Allow all on dictionary" on dictionary for all using (true) with check (true);
