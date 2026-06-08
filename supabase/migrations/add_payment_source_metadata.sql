alter table public.payments add column if not exists provider text;
alter table public.payments add column if not exists source text;

create index if not exists payments_provider_created_at_idx on public.payments (provider, created_at desc);
