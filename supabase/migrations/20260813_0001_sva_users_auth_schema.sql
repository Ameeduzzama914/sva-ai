-- Align the durable SVA user record with every field currently used by the app.
-- This migration is additive and safe to run against the existing production table.

alter table public.sva_users
  add column if not exists user_id uuid,
  add column if not exists email text,
  add column if not exists plan text not null default 'free',
  add column if not exists status text not null default 'active',
  add column if not exists usage_count integer not null default 0,
  add column if not exists daily_usage integer not null default 0,
  add column if not exists monthly_usage integer not null default 0,
  add column if not exists credits_remaining integer not null default 0,
  add column if not exists credits_reset_at timestamptz,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_sva_users_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sva_users_updated_at on public.sva_users;
create trigger set_sva_users_updated_at
before update on public.sva_users
for each row execute function public.set_sva_users_updated_at();

notify pgrst, 'reload schema';
