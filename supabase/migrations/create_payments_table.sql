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
  created_at timestamp with time zone not null default now()
);

create index if not exists payments_email_created_at_idx on public.payments (lower(email), created_at desc);
create index if not exists payments_user_id_created_at_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_created_at_idx on public.payments (status, created_at desc);

alter table public.payments enable row level security;

create policy "Users can view their own payments"
  on public.payments
  for select
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or user_id = auth.uid());

create policy "Service role can manage payments"
  on public.payments
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Admin/founder reads are performed by server-side service-role APIs.
-- Do not expose RAZORPAY_KEY_SECRET or write payment rows from the browser.
