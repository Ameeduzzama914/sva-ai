-- Phase 1-29 additive billing, usage, reservation, provider accounting, and webhook schema.
-- Apply after validating existing data. This migration is additive and does not drop legacy columns.

create table if not exists public.subscriptions (
  user_id uuid primary key,
  plan text not null check (plan in ('free', 'pro', 'ultra')) default 'free',
  status text not null check (status in ('inactive', 'active', 'past_due', 'halted', 'cancelled', 'expired')) default 'inactive',
  razorpay_customer_id text,
  razorpay_subscription_id text unique,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancellation_at_period_end boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.usage_balances (
  user_id uuid primary key,
  plan text not null check (plan in ('free', 'pro', 'ultra')) default 'free',
  daily_limit integer not null,
  daily_used integer not null default 0 check (daily_used >= 0),
  monthly_limit integer not null,
  monthly_used integer not null default 0 check (monthly_used >= 0),
  daily_reset_at timestamp with time zone not null,
  billing_period_start timestamp with time zone,
  billing_period_end timestamp with time zone,
  active_verifications integer not null default 0 check (active_verifications >= 0),
  monthly_ai_cost_usd numeric(12,6) not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (daily_used <= daily_limit),
  check (monthly_used <= monthly_limit)
);

create table if not exists public.verification_reservations (
  verification_id uuid primary key,
  user_id uuid not null,
  plan text not null check (plan in ('free', 'pro', 'ultra')),
  status text not null check (status in ('reserved', 'finalized', 'refunded')) default 'reserved',
  reserved_at timestamp with time zone not null default now(),
  finalized_at timestamp with time zone,
  refunded_at timestamp with time zone,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.provider_usage (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid,
  user_id uuid,
  plan text check (plan in ('free', 'pro', 'ultra')),
  model_family text not null,
  requested_model text,
  actual_model text,
  attempt_type text not null check (attempt_type in ('primary', 'fallback', 'synthesis', 'evidence')),
  prompt_tokens integer,
  completion_tokens integer,
  reasoning_tokens integer,
  cached_tokens integer,
  cost_usd numeric(12,6),
  latency_ms integer,
  provider_http_status integer,
  provider_error_type text,
  provider_code text,
  status text not null check (status in ('success', 'failed', 'fallback')),
  created_at timestamp with time zone not null default now()
);

create table if not exists public.webhook_events (
  razorpay_event_id text primary key,
  event_type text not null,
  processing_status text not null check (processing_status in ('processing', 'completed', 'failed', 'ignored')),
  error_message text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

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

create index if not exists provider_usage_user_created_at_idx on public.provider_usage (user_id, created_at desc);
create index if not exists provider_usage_verification_idx on public.provider_usage (verification_id);
create index if not exists verification_reservations_user_status_idx on public.verification_reservations (user_id, status, created_at desc);
create index if not exists admin_alerts_unresolved_created_at_idx on public.admin_alerts (resolved, created_at desc);

alter table public.subscriptions enable row level security;
alter table public.usage_balances enable row level security;
alter table public.verification_reservations enable row level security;
alter table public.provider_usage enable row level security;
alter table public.webhook_events enable row level security;
alter table public.admin_alerts enable row level security;

drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription" on public.subscriptions for select using (user_id = auth.uid());

drop policy if exists "Users can view own usage balance" on public.usage_balances;
create policy "Users can view own usage balance" on public.usage_balances for select using (user_id = auth.uid());

drop policy if exists "Service role manages subscriptions" on public.subscriptions;
create policy "Service role manages subscriptions" on public.subscriptions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role manages usage balances" on public.usage_balances;
create policy "Service role manages usage balances" on public.usage_balances for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role manages reservations" on public.verification_reservations;
create policy "Service role manages reservations" on public.verification_reservations for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role manages provider usage" on public.provider_usage;
create policy "Service role manages provider usage" on public.provider_usage for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role manages webhook events" on public.webhook_events;
create policy "Service role manages webhook events" on public.webhook_events for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role manages admin alerts" on public.admin_alerts;
create policy "Service role manages admin alerts" on public.admin_alerts for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create or replace function public.sva_plan_daily_limit(p_plan text) returns integer language sql immutable as $$
  select case p_plan when 'pro' then 8 when 'ultra' then 15 else 2 end;
$$;

create or replace function public.sva_plan_monthly_limit(p_plan text) returns integer language sql immutable as $$
  select case p_plan when 'pro' then 200 when 'ultra' then 450 else 30 end;
$$;

create or replace function public.sva_plan_concurrency_limit(p_plan text) returns integer language sql immutable as $$
  select case p_plan when 'ultra' then 2 else 1 end;
$$;

create or replace function public.sva_reserve_verification(
  p_user_id uuid,
  p_verification_id uuid,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
) returns table(ok boolean, message text, plan text, daily_used integer, daily_limit integer, monthly_used integer, monthly_limit integer)
language plpgsql security definer as $$
declare
  v_balance public.usage_balances%rowtype;
  v_plan text;
  v_subscription_status text;
begin
  select s.plan, s.status into v_plan, v_subscription_status
  from public.subscriptions s where s.user_id = p_user_id;

  if v_plan is null then
    select coalesce(u.plan, 'free'), coalesce(u.status, 'active') into v_plan, v_subscription_status
    from public.sva_users u where u.user_id = p_user_id;
  end if;

  if v_plan is null then v_plan := 'free'; end if;
  if v_subscription_status is null then v_subscription_status := 'active'; end if;
  if v_subscription_status not in ('active', 'past_due') and v_plan <> 'free' then
    return query select false, 'Subscription is not active.', v_plan, 0, public.sva_plan_daily_limit(v_plan), 0, public.sva_plan_monthly_limit(v_plan);
    return;
  end if;

  insert into public.usage_balances(user_id, plan, daily_limit, monthly_limit, daily_reset_at, billing_period_start, billing_period_end)
  values (p_user_id, v_plan, public.sva_plan_daily_limit(v_plan), public.sva_plan_monthly_limit(v_plan), date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '1 day', now(), now() + interval '1 month')
  on conflict (user_id) do update
  set plan = excluded.plan,
      daily_limit = excluded.daily_limit,
      monthly_limit = excluded.monthly_limit,
      billing_period_start = coalesce(public.usage_balances.billing_period_start, excluded.billing_period_start),
      billing_period_end = coalesce(public.usage_balances.billing_period_end, excluded.billing_period_end),
      updated_at = now();

  select * into v_balance from public.usage_balances where user_id = p_user_id for update;

  if v_balance.daily_reset_at <= now() then
    update public.usage_balances set daily_used = 0, daily_reset_at = date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '1 day', updated_at = now() where user_id = p_user_id;
    select * into v_balance from public.usage_balances where user_id = p_user_id for update;
  end if;

  if v_balance.daily_used >= v_balance.daily_limit then
    return query select false, 'Daily verification limit reached.', v_balance.plan, v_balance.daily_used, v_balance.daily_limit, v_balance.monthly_used, v_balance.monthly_limit;
    return;
  end if;

  if v_balance.monthly_used >= v_balance.monthly_limit then
    return query select false, 'Billing-period verification limit reached.', v_balance.plan, v_balance.daily_used, v_balance.daily_limit, v_balance.monthly_used, v_balance.monthly_limit;
    return;
  end if;

  if v_balance.active_verifications >= public.sva_plan_concurrency_limit(v_balance.plan) then
    return query select false, 'Too many active verifications.', v_balance.plan, v_balance.daily_used, v_balance.daily_limit, v_balance.monthly_used, v_balance.monthly_limit;
    return;
  end if;

  insert into public.verification_reservations(verification_id, user_id, plan, status, idempotency_key, metadata)
  values (p_verification_id, p_user_id, v_balance.plan, 'reserved', p_idempotency_key, p_metadata)
  on conflict (idempotency_key) do nothing;

  update public.usage_balances
  set daily_used = daily_used + 1,
      monthly_used = monthly_used + 1,
      active_verifications = active_verifications + 1,
      updated_at = now()
  where user_id = p_user_id;

  select * into v_balance from public.usage_balances where user_id = p_user_id;
  return query select true, 'reserved', v_balance.plan, v_balance.daily_used, v_balance.daily_limit, v_balance.monthly_used, v_balance.monthly_limit;
end;
$$;

create or replace function public.sva_finalize_verification(p_verification_id uuid) returns boolean
language plpgsql security definer as $$
declare
  v_res public.verification_reservations%rowtype;
begin
  select * into v_res from public.verification_reservations where verification_id = p_verification_id for update;
  if not found then return false; end if;
  if v_res.status = 'finalized' then return true; end if;
  if v_res.status = 'refunded' then return false; end if;
  update public.verification_reservations set status = 'finalized', finalized_at = now(), updated_at = now() where verification_id = p_verification_id;
  update public.usage_balances set active_verifications = greatest(0, active_verifications - 1), updated_at = now() where user_id = v_res.user_id;
  return true;
end;
$$;

create or replace function public.sva_refund_verification(p_verification_id uuid) returns boolean
language plpgsql security definer as $$
declare
  v_res public.verification_reservations%rowtype;
begin
  select * into v_res from public.verification_reservations where verification_id = p_verification_id for update;
  if not found then return false; end if;
  if v_res.status = 'refunded' then return true; end if;
  if v_res.status = 'finalized' then return false; end if;
  update public.verification_reservations set status = 'refunded', refunded_at = now(), updated_at = now() where verification_id = p_verification_id;
  update public.usage_balances
  set daily_used = greatest(0, daily_used - 1),
      monthly_used = greatest(0, monthly_used - 1),
      active_verifications = greatest(0, active_verifications - 1),
      updated_at = now()
  where user_id = v_res.user_id;
  return true;
end;
$$;

