import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/server/admin-auth";
import { getSupabaseAdminClient } from "../../../../lib/server/supabase-admin";

type Row = Record<string, unknown>;
const count = (rows: Row[], predicate: (row: Row) => boolean) => rows.filter(predicate).length;
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && !Number.isNaN(Number(value)) ? Number(value) : 0);

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) return admin.response;
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ ok: false, message: "Supabase admin client is not configured." }, { status: 503 });

  const [subscriptions, balances, providerUsage, alerts, webhooks, logs] = await Promise.all([
    client.from("subscriptions").select("plan,status,cancellation_at_period_end"),
    client.from("usage_balances").select("plan,daily_used,monthly_used,monthly_limit,abnormal_usage_flagged"),
    client.from("provider_usage").select("plan,model_family,attempt_type,cost_usd,latency_ms,status,provider_error_type,created_at").order("created_at", { ascending: false }).limit(500),
    client.from("admin_alerts").select("alert_type,severity,source,resolved,created_at").eq("resolved", false).order("created_at", { ascending: false }).limit(100),
    client.from("webhook_events").select("event_type,processing_status,created_at").order("created_at", { ascending: false }).limit(200),
    client.from("verification_logs").select("status,created_at,plan").order("created_at", { ascending: false }).limit(500)
  ]);

  const subscriptionRows = ((subscriptions.data ?? []) as Row[]);
  const balanceRows = ((balances.data ?? []) as Row[]);
  const usageRows = ((providerUsage.data ?? []) as Row[]);
  const alertRows = ((alerts.data ?? []) as Row[]);
  const webhookRows = ((webhooks.data ?? []) as Row[]);
  const logRows = ((logs.data ?? []) as Row[]);
  const totalCostUsd = usageRows.reduce((sum, row) => sum + num(row.cost_usd), 0);
  const successfulVerifications = count(logRows, (row) => row.status === "completed" || row.status === "success");
  const failedVerifications = count(logRows, (row) => row.status === "failed" || row.status === "refunded");

  return NextResponse.json({
    ok: true,
    metrics: {
      subscriptions: {
        activePaidUsers: count(subscriptionRows, (row) => row.status === "active" && (row.plan === "pro" || row.plan === "ultra")),
        proUsers: count(subscriptionRows, (row) => row.plan === "pro" && row.status === "active"),
        ultraUsers: count(subscriptionRows, (row) => row.plan === "ultra" && row.status === "active"),
        paymentFailures: count(webhookRows, (row) => /failed/i.test(String(row.event_type))),
        webhookFailures: count(webhookRows, (row) => row.processing_status === "failed")
      },
      usage: {
        successfulVerifications,
        failedVerifications,
        refundRate: successfulVerifications + failedVerifications ? failedVerifications / (successfulVerifications + failedVerifications) : 0,
        dailyUsage: balanceRows.reduce((sum, row) => sum + num(row.daily_used), 0),
        monthlyUsage: balanceRows.reduce((sum, row) => sum + num(row.monthly_used), 0),
        averageResponseTimeMs: usageRows.length ? Math.round(usageRows.reduce((sum, row) => sum + num(row.latency_ms), 0) / usageRows.length) : 0
      },
      openRouter: {
        todayCostUsd: totalCostUsd,
        billingPeriodCostUsd: totalCostUsd,
        averageCostPerVerificationUsd: successfulVerifications ? totalCostUsd / successfulVerifications : 0,
        lowBalanceStatus: alertRows.some((row) => /openrouter_low_balance|openrouter_billing_failure/i.test(String(row.alert_type)))
      },
      models: {
        primarySuccessRate: usageRows.length ? count(usageRows, (row) => row.attempt_type === "primary" && row.status === "success") / usageRows.length : 0,
        fallbackRate: usageRows.length ? count(usageRows, (row) => String(row.attempt_type).includes("fallback")) / usageRows.length : 0,
        recentProviderFailureClassifications: usageRows.filter((row) => row.provider_error_type).slice(0, 10).map((row) => row.provider_error_type)
      },
      profit: {
        totalCostUsd,
        costByPlan: Object.fromEntries(["free", "pro", "ultra"].map((plan) => [plan, usageRows.filter((row) => row.plan === plan).reduce((sum, row) => sum + num(row.cost_usd), 0)])),
        fallbackCostUsd: usageRows.filter((row) => String(row.attempt_type).includes("fallback")).reduce((sum, row) => sum + num(row.cost_usd), 0),
        synthesisRetryCostUsd: usageRows.filter((row) => row.attempt_type === "synthesis_retry").reduce((sum, row) => sum + num(row.cost_usd), 0),
        estimatedContributionMarginUsd: -totalCostUsd
      },
      alerts: alertRows
    }
  });
}
