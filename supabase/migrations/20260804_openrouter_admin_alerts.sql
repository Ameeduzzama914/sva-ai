create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  source text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamp with time zone not null default now(),
  resolved_at timestamp with time zone
);

create index if not exists admin_alerts_unresolved_created_at_idx
  on public.admin_alerts (resolved, created_at desc);

create index if not exists admin_alerts_source_created_at_idx
  on public.admin_alerts (source, created_at desc);

alter table public.admin_alerts enable row level security;

create policy "Service role can manage admin alerts"
  on public.admin_alerts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.sva_users add column if not exists monthly_limit integer;
alter table public.sva_users add column if not exists billing_period_start timestamp with time zone;
alter table public.sva_users add column if not exists billing_period_end timestamp with time zone;
alter table public.sva_users add column if not exists active_verifications integer not null default 0;
