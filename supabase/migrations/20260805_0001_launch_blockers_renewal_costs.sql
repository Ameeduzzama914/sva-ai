-- Phase launch-blocker hardening: renewal idempotency, cost alert metadata, and synthesis accounting.
-- Rollback guidance: drop the indexes below, then drop the nullable columns if no application version depends on them.

alter table public.payments
  add column if not exists billing_transaction_id text,
  add column if not exists razorpay_invoice_id text,
  add column if not exists razorpay_subscription_id text,
  add column if not exists billing_period_start timestamptz,
  add column if not exists billing_period_end timestamptz;

update public.payments
set billing_transaction_id = coalesce(billing_transaction_id, razorpay_payment_id, razorpay_order_id)
where billing_transaction_id is null;

create unique index if not exists payments_success_billing_transaction_unique_idx
  on public.payments (billing_transaction_id)
  where status = 'success' and billing_transaction_id is not null;

create unique index if not exists payments_success_razorpay_payment_unique_idx
  on public.payments (razorpay_payment_id)
  where status = 'success' and razorpay_payment_id is not null;

create index if not exists payments_subscription_created_at_idx
  on public.payments (razorpay_subscription_id, created_at desc)
  where razorpay_subscription_id is not null;

alter table public.usage_balances
  add column if not exists abnormal_usage_flagged boolean not null default false;

alter table public.sva_users
  add column if not exists status text not null default 'active',
  add column if not exists billing_period_start timestamptz,
  add column if not exists billing_period_end timestamptz;

alter table public.provider_usage
  drop constraint if exists provider_usage_model_family_check;

alter table public.provider_usage
  add constraint provider_usage_model_family_check
  check (model_family in ('gpt', 'gemini', 'deepseek', 'synthesis'));

create index if not exists provider_usage_plan_created_at_idx
  on public.provider_usage (plan, created_at desc);

create index if not exists provider_usage_model_family_created_at_idx
  on public.provider_usage (model_family, created_at desc);

create index if not exists admin_alerts_type_unresolved_idx
  on public.admin_alerts (alert_type, resolved, created_at desc);

create unique index if not exists webhook_events_razorpay_event_id_unique_idx
  on public.webhook_events (razorpay_event_id);
