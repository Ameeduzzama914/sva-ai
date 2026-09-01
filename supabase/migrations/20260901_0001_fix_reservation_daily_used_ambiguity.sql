-- Fix PL/pgSQL output-column ambiguity in the reservation counter update.
-- Additive migration: replaces only the function definition and does not alter data.

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
  v_subscription_period_end timestamptz;
  v_inserted_count integer := 0;
begin
  select s.plan, s.status, s.current_period_end into v_plan, v_subscription_status, v_subscription_period_end
  from public.subscriptions s where s.user_id = p_user_id;

  if v_plan is null then
    select coalesce(u.plan, 'free'), coalesce(u.status, 'active'), u.billing_period_end into v_plan, v_subscription_status, v_subscription_period_end
    from public.sva_users u where u.user_id = p_user_id;
  end if;

  if v_plan is null then v_plan := 'free'; end if;
  if v_subscription_status is null then v_subscription_status := 'active'; end if;

  if v_plan <> 'free' then
    if v_subscription_status not in ('active', 'past_due', 'cancel_at_period_end') then
      return query select false, 'Subscription is not active.', v_plan, 0, public.sva_plan_daily_limit(v_plan), 0, public.sva_plan_monthly_limit(v_plan);
      return;
    end if;
    if v_subscription_status = 'cancel_at_period_end' and v_subscription_period_end is not null and v_subscription_period_end <= now() then
      return query select false, 'Subscription period has ended.', v_plan, 0, public.sva_plan_daily_limit(v_plan), 0, public.sva_plan_monthly_limit(v_plan);
      return;
    end if;
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
    update public.usage_balances
    set daily_used = 0,
        daily_reset_at = date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '1 day',
        updated_at = now()
    where user_id = p_user_id;
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

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count = 0 then
    select * into v_balance from public.usage_balances where user_id = p_user_id;
    return query select true, 'already_reserved', v_balance.plan, v_balance.daily_used, v_balance.daily_limit, v_balance.monthly_used, v_balance.monthly_limit;
    return;
  end if;

  update public.usage_balances as ub
  set daily_used = ub.daily_used + 1,
      monthly_used = ub.monthly_used + 1,
      active_verifications = ub.active_verifications + 1,
      updated_at = now()
  where ub.user_id = p_user_id;

  select * into v_balance from public.usage_balances where user_id = p_user_id;
  return query select true, 'reserved', v_balance.plan, v_balance.daily_used, v_balance.daily_limit, v_balance.monthly_used, v_balance.monthly_limit;
end;
$$;

notify pgrst, 'reload schema';
