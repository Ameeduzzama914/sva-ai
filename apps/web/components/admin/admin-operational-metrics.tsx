import { AdminSection } from "./admin-section";

type Props = { metrics: Record<string, any> | null };
const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const formatPct = (value: unknown) => `${Math.round(asNumber(value) * 100)}%`;
const formatUsd = (value: unknown) => `$${asNumber(value).toFixed(4)}`;

export const AdminOperationalMetrics = ({ metrics }: Props) => (
  <AdminSection title="Launch operations" subtitle="Subscriptions, usage, OpenRouter cost, model health, profit signals, and unresolved alerts.">
    {!metrics ? (
      <p className="text-sm text-slate-400">Pending operational metrics.</p>
    ) : (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-sm text-slate-300">
          <p className="font-semibold text-slate-100">Subscriptions</p>
          <p>Active paid: {metrics.subscriptions?.activePaidUsers ?? 0}</p>
          <p>Pro: {metrics.subscriptions?.proUsers ?? 0}</p>
          <p>Ultra: {metrics.subscriptions?.ultraUsers ?? 0}</p>
          <p>Payment failures: {metrics.subscriptions?.paymentFailures ?? 0}</p>
          <p>Webhook failures: {metrics.subscriptions?.webhookFailures ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-sm text-slate-300">
          <p className="font-semibold text-slate-100">Usage</p>
          <p>Successful: {metrics.usage?.successfulVerifications ?? 0}</p>
          <p>Failed: {metrics.usage?.failedVerifications ?? 0}</p>
          <p>Refund rate: {formatPct(metrics.usage?.refundRate)}</p>
          <p>Avg response: {metrics.usage?.averageResponseTimeMs ?? 0}ms</p>
          <p>Daily/monthly: {metrics.usage?.dailyUsage ?? 0}/{metrics.usage?.monthlyUsage ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-sm text-slate-300">
          <p className="font-semibold text-slate-100">OpenRouter & Models</p>
          <p>Today cost: {formatUsd(metrics.openRouter?.todayCostUsd)}</p>
          <p>Period cost: {formatUsd(metrics.openRouter?.billingPeriodCostUsd)}</p>
          <p>Avg cost/run: {formatUsd(metrics.openRouter?.averageCostPerVerificationUsd)}</p>
          <p>Low balance: {metrics.openRouter?.lowBalanceStatus ? "Yes" : "No"}</p>
          <p>Primary success: {formatPct(metrics.models?.primarySuccessRate)}</p>
          <p>Fallback rate: {formatPct(metrics.models?.fallbackRate)}</p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-sm text-slate-300">
          <p className="font-semibold text-slate-100">Profit & Alerts</p>
          <p>Total cost: {formatUsd(metrics.profit?.totalCostUsd)}</p>
          <p>Fallback cost: {formatUsd(metrics.profit?.fallbackCostUsd)}</p>
          <p>Synthesis retry cost: {formatUsd(metrics.profit?.synthesisRetryCostUsd)}</p>
          <p>Contribution margin: {formatUsd(metrics.profit?.estimatedContributionMarginUsd)}</p>
          <p>Unresolved alerts: {Array.isArray(metrics.alerts) ? metrics.alerts.length : 0}</p>
        </div>
      </div>
    )}
  </AdminSection>
);

