-- Spitzer's Express database. Paste this whole file into Supabase > SQL Editor > Run.

create extension if not exists pgcrypto;

-- People and businesses. One record can be a requesting customer, a pickup contact
-- and a drop-off contact at the same time.
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  instructions text,
  notes text,
  aliases text[] not null default '{}',
  -- who gets the automatic delivery-photo text when this contact is the requesting customer
  photo_text_to text not null default 'customer' check (photo_text_to in ('customer','dropoff','pickup','none')),
  invoice_email text,
  wants_invoices boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete set null,
  line text not null,
  area text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists addresses_contact_idx on addresses(contact_id);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  job_date date not null default current_date,
  customer_id uuid references contacts(id) on delete set null,
  description text,
  notes text,
  price numeric(10,2),
  delivery_status text not null default 'upcoming' check (delivery_status in ('upcoming','picked_up','delivered','cancelled')),
  invoice_requested boolean not null default false,
  invoice_id uuid,
  source text not null default 'manual' check (source in ('manual','voice','import')),
  import_ref text,
  created_at timestamptz not null default now()
);
create index if not exists jobs_date_idx on jobs(job_date);
create index if not exists jobs_customer_idx on jobs(customer_id);

create table if not exists stops (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  seq int not null default 0,
  kind text not null check (kind in ('pickup','dropoff')),
  contact_id uuid references contacts(id) on delete set null,
  address_id uuid references addresses(id) on delete set null,
  address_text text,
  area text,
  instructions text,
  status text not null default 'pending' check (status in ('pending','done')),
  completed_at timestamptz,
  route_order numeric not null default 0
);
create index if not exists stops_job_idx on stops(job_id);

-- Extra charges on a job (return trip, waiting, etc.)
create table if not exists job_extras (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  label text not null,
  amount numeric(10,2) not null
);

create table if not exists extra_presets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  amount numeric(10,2) not null,
  sort int not null default 0
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  stop_id uuid references stops(id) on delete set null,
  path text not null,
  created_at timestamptz not null default now(),
  text_status text not null default 'not_sent' check (text_status in ('not_sent','sent','failed','skipped')),
  text_to text,
  text_error text,
  texted_at timestamptz
);
create index if not exists photos_job_idx on photos(job_id);

-- Money received. A payment belongs to a customer and is split across one or more jobs.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references contacts(id) on delete set null,
  amount numeric(10,2) not null,
  method text,
  received_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  amount numeric(10,2) not null
);
create index if not exists alloc_job_idx on payment_allocations(job_id);

-- Prices the driver explicitly saved. pattern_key '*' = customer's default price.
create table if not exists preferred_prices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references contacts(id) on delete cascade,
  pattern_key text not null,
  label text,
  amount numeric(10,2) not null,
  updated_at timestamptz not null default now(),
  unique (customer_id, pattern_key)
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  customer_id uuid references contacts(id) on delete set null,
  total numeric(10,2) not null,
  sent_to text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Things that need a human look (from import or voice memos)
create table if not exists review_flags (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  message text not null,
  job_id uuid references jobs(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Totals per job: price + extras, paid, balance, payment status
create or replace view job_money as
select j.id as job_id,
  j.customer_id,
  j.job_date,
  j.invoice_requested,
  j.invoice_id,
  j.delivery_status,
  coalesce(j.price,0) + coalesce((select sum(amount) from job_extras e where e.job_id = j.id),0) as total,
  coalesce((select sum(amount) from payment_allocations a where a.job_id = j.id),0) as paid,
  coalesce(j.price,0) + coalesce((select sum(amount) from job_extras e where e.job_id = j.id),0)
    - coalesce((select sum(amount) from payment_allocations a where a.job_id = j.id),0) as balance,
  case
    when coalesce((select sum(amount) from payment_allocations a where a.job_id = j.id),0) <= 0 then 'unpaid'
    when coalesce((select sum(amount) from payment_allocations a where a.job_id = j.id),0)
         >= coalesce(j.price,0) + coalesce((select sum(amount) from job_extras e where e.job_id = j.id),0) then 'paid'
    else 'partial'
  end as payment_status
from jobs j where j.delivery_status <> 'cancelled';

-- Customer ranking and balances
create or replace view customer_stats as
select c.id as customer_id,
  count(j.id) filter (where j.job_date > current_date - 90) as jobs_90d,
  count(j.id) as jobs_total,
  max(j.job_date) as last_job,
  coalesce(sum(m.balance),0) as balance,
  coalesce((select sum(p.amount) from payments p where p.customer_id = c.id),0)
    - coalesce((select sum(a.amount) from payment_allocations a join payments p on p.id = a.payment_id where p.customer_id = c.id),0) as unapplied_credit
from contacts c
left join jobs j on j.customer_id = c.id and j.delivery_status <> 'cancelled'
left join job_money m on m.job_id = j.id
group by c.id;

alter view job_money set (security_invoker = true);
alter view customer_stats set (security_invoker = true);

-- Security: only signed-in users can read or change anything.
do $$
declare t text;
begin
  foreach t in array array['contacts','addresses','jobs','stops','job_extras','extra_presets','photos','payments','payment_allocations','preferred_prices','invoices','review_flags']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "signed in" on %I', t);
    execute format('create policy "signed in" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Private photo storage
insert into storage.buckets (id, name, public) values ('photos','photos', false) on conflict (id) do nothing;
drop policy if exists "signed in files" on storage.objects;
create policy "signed in files" on storage.objects for all to authenticated
  using (bucket_id = 'photos') with check (bucket_id = 'photos');

-- Starter quick charges (edit in the app)
insert into extra_presets (label, amount, sort)
select * from (values ('Return trip', 20, 1), ('Waiting time', 10, 2), ('Extra stop', 10, 3), ('Pick up money', 10, 4)) v
where not exists (select 1 from extra_presets);
