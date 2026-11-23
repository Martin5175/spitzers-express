-- Update 2: custom message for delivery photo texts.
-- Paste into Supabase > SQL Editor > Run. Safe to run more than once.

create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
drop policy if exists "signed in" on app_settings;
create policy "signed in" on app_settings for all to authenticated using (true) with check (true);

-- Optional message for one customer (overrides the general one)
alter table contacts add column if not exists photo_message text;
