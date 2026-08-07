-- Compatibility guard for fresh environments where older payment migration filenames
-- do not sort in dependency order. This is idempotent and safe to apply before/after
-- create_payments_table.sql and add_payment_source_metadata.sql.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  plan text not null check (plan in ('pro', 'ultra')),
  amount integer not null,
  currency text not null default 'INR',
  razorpay_order_id text not null,
  razorpay_payment_id text,
  razorpay_signature text,
  status text not null check (status in ('success', 'failed')),
  provider text,
  source text,
  created_at timestamp with time zone not null default now()
);

alter table public.payments add column if not exists provider text;
alter table public.payments add column if not exists source text;

create index if not exists payments_email_created_at_idx on public.payments (lower(email), created_at desc);
create index if not exists payments_user_id_created_at_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_created_at_idx on public.payments (status, created_at desc);
create index if not exists payments_provider_created_at_idx on public.payments (provider, created_at desc);
create index if not exists payments_razorpay_payment_id_success_idx on public.payments (razorpay_payment_id) where status = 'success';

alter table public.payments enable row level security;

drop policy if exists "Users can view their own payments" on public.payments;
create policy "Users can view their own payments"
  on public.payments
  for select
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or user_id = auth.uid());

drop policy if exists "Service role can manage payments" on public.payments;
create policy "Service role can manage payments"
  on public.payments
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
