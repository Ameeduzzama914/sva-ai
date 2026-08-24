-- SVA production readiness check. Read-only: this script does not alter data or schema.
-- Run after applying required migrations. Rows with status = FAIL need attention before launch.

with expected_tables(name) as (
  values
    ('sva_users'),
    ('payments'),
    ('subscriptions'),
    ('usage_balances'),
    ('verification_reservations'),
    ('provider_usage'),
    ('webhook_events'),
    ('admin_alerts')
),
table_checks as (
  select 'table' as check_area, name as check_name, to_regclass('public.' || name) is not null as pass,
    case when to_regclass('public.' || name) is not null then 'exists' else 'missing' end as detail
  from expected_tables
),
expected_columns(table_name, column_name) as (
  values
    ('sva_users','user_id'), ('sva_users','email'), ('sva_users','plan'), ('sva_users','status'), ('sva_users','usage_count'), ('sva_users','daily_usage'), ('sva_users','monthly_usage'), ('sva_users','credits_remaining'), ('sva_users','credits_reset_at'), ('sva_users','onboarding_completed'), ('sva_users','billing_period_start'), ('sva_users','billing_period_end'), ('sva_users','created_at'), ('sva_users','updated_at'),
    ('payments','user_id'), ('payments','email'), ('payments','plan'), ('payments','amount'), ('payments','currency'), ('payments','razorpay_order_id'), ('payments','razorpay_payment_id'), ('payments','razorpay_signature'), ('payments','billing_transaction_id'), ('payments','razorpay_invoice_id'), ('payments','razorpay_subscription_id'), ('payments','billing_period_start'), ('payments','billing_period_end'), ('payments','provider'), ('payments','source'), ('payments','status'), ('payments','created_at'),
    ('subscriptions','user_id'), ('subscriptions','plan'), ('subscriptions','status'), ('subscriptions','razorpay_customer_id'), ('subscriptions','razorpay_subscription_id'), ('subscriptions','current_period_start'), ('subscriptions','current_period_end'), ('subscriptions','cancellation_at_period_end'), ('subscriptions','created_at'), ('subscriptions','updated_at'),
    ('usage_balances','user_id'), ('usage_balances','plan'), ('usage_balances','daily_limit'), ('usage_balances','daily_used'), ('usage_balances','monthly_limit'), ('usage_balances','monthly_used'), ('usage_balances','daily_reset_at'), ('usage_balances','billing_period_start'), ('usage_balances','billing_period_end'), ('usage_balances','active_verifications'), ('usage_balances','monthly_ai_cost_usd'), ('usage_balances','abnormal_usage_flagged'),
    ('verification_reservations','verification_id'), ('verification_reservations','user_id'), ('verification_reservations','plan'), ('verification_reservations','status'), ('verification_reservations','idempotency_key'), ('verification_reservations','metadata'),
    ('provider_usage','verification_id'), ('provider_usage','user_id'), ('provider_usage','plan'), ('provider_usage','model_family'), ('provider_usage','requested_model'), ('provider_usage','actual_model'), ('provider_usage','attempt_type'), ('provider_usage','cost_usd'), ('provider_usage','latency_ms'), ('provider_usage','provider_http_status'), ('provider_usage','provider_error_type'), ('provider_usage','status'),
    ('webhook_events','razorpay_event_id'), ('webhook_events','event_type'), ('webhook_events','processing_status'), ('webhook_events','processed_at'),
    ('admin_alerts','alert_type'), ('admin_alerts','severity'), ('admin_alerts','source'), ('admin_alerts','message'), ('admin_alerts','metadata'), ('admin_alerts','resolved')
),
column_checks as (
  select 'column' as check_area, table_name || '.' || column_name as check_name,
    exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = expected_columns.table_name and c.column_name = expected_columns.column_name
    ) as pass,
    'required application column' as detail
  from expected_columns
),
expected_indexes(name) as (
  values
    ('payments_email_created_at_idx'),
    ('payments_user_id_created_at_idx'),
    ('payments_status_created_at_idx'),
    ('payments_provider_created_at_idx'),
    ('payments_success_billing_transaction_unique_idx'),
    ('payments_success_razorpay_payment_unique_idx'),
    ('payments_subscription_created_at_idx'),
    ('provider_usage_user_created_at_idx'),
    ('provider_usage_verification_idx'),
    ('provider_usage_plan_created_at_idx'),
    ('provider_usage_model_family_created_at_idx'),
    ('verification_reservations_user_status_idx'),
    ('admin_alerts_unresolved_created_at_idx'),
    ('admin_alerts_type_unresolved_idx'),
    ('webhook_events_razorpay_event_id_unique_idx')
),
index_checks as (
  select 'index' as check_area, name as check_name,
    to_regclass('public.' || name) is not null as pass,
    case when to_regclass('public.' || name) is not null then 'exists' else 'missing' end as detail
  from expected_indexes
),
expected_functions(name) as (
  values
    ('sva_plan_daily_limit'),
    ('sva_plan_monthly_limit'),
    ('sva_plan_concurrency_limit'),
    ('sva_reserve_verification'),
    ('sva_finalize_verification'),
    ('sva_refund_verification'),
    ('set_sva_users_updated_at')
),
function_checks as (
  select 'function' as check_area, name as check_name,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = expected_functions.name
    ) as pass,
    'required RPC/helper function' as detail
  from expected_functions
),
constraint_checks as (
  select 'constraint' as check_area, 'subscriptions.status allows cancel_at_period_end' as check_name,
    exists (
      select 1 from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = 'subscriptions' and pg_get_constraintdef(c.oid) like '%cancel_at_period_end%'
    ) as pass,
    'required for cancellation-at-period-end access' as detail
  union all
  select 'constraint', 'provider_usage.attempt_type allows synthesis_retry',
    exists (
      select 1 from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = 'provider_usage' and pg_get_constraintdef(c.oid) like '%synthesis_retry%'
    ),
    'required for synthesis retry cost accounting'
  union all
  select 'constraint', 'usage_balances counters cannot go negative',
    exists (
      select 1 from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = 'usage_balances' and pg_get_constraintdef(c.oid) like '%daily_used >= 0%'
    )
    and exists (
      select 1 from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = 'usage_balances' and pg_get_constraintdef(c.oid) like '%monthly_used >= 0%'
    ),
    'required for refund/finalize safety'
),
rpc_definition_checks as (
  select 'rpc_definition' as check_area, 'reservation duplicate idempotency is no-op' as check_name,
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'sva_reserve_verification'
        and pg_get_functiondef(p.oid) like '%already_reserved%'
        and pg_get_functiondef(p.oid) like '%v_inserted_count = 0%'
    ) as pass,
    'duplicate idempotency keys must not increment allowance twice' as detail
  union all
  select 'rpc_definition', 'reservation supports cancellation-at-period-end access',
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'sva_reserve_verification'
        and pg_get_functiondef(p.oid) like '%cancel_at_period_end%'
        and pg_get_functiondef(p.oid) like '%Subscription period has ended%'
    ),
    'paid users keep access until the paid period ends'
  union all
  select 'rpc_definition', 'finalize/refund are idempotent',
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'sva_finalize_verification'
        and pg_get_functiondef(p.oid) like '%status = ''finalized''%'
    )
    and exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'sva_refund_verification'
        and pg_get_functiondef(p.oid) like '%status = ''refunded''%'
        and pg_get_functiondef(p.oid) like '%greatest(0%'
    ),
    'finalize/refund retries must be safe'
)
select check_area, check_name,
  case when pass then 'PASS' else 'FAIL' end as status,
  detail
from (
  select * from table_checks
  union all select * from column_checks
  union all select * from index_checks
  union all select * from function_checks
  union all select * from constraint_checks
  union all select * from rpc_definition_checks
) checks
order by case when pass then 1 else 0 end, check_area, check_name;
