import type { AdminPaymentsResponse } from "../../lib/admin-types";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

type Props = {
  payments: AdminPaymentsResponse["payments"];
  summary: AdminPaymentsResponse["summary"] | null;
  emptyMessage: string | null;
};

export const AdminPaymentsSection = ({ payments, summary, emptyMessage }: Props) => (
  <section>
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-violet-300/90">Payments</h2>
    <div className="grid gap-4 lg:grid-cols-4">
      <Card title="Total Payments"><p className="text-2xl font-semibold text-white">{summary?.totalPayments ?? 0}</p></Card>
      <Card title="Test Revenue"><p className="text-2xl font-semibold text-emerald-200">₹{Math.round((summary?.totalRevenue ?? 0) / 100)}</p></Card>
      <Card title="Pro Upgrades"><p className="text-2xl font-semibold text-violet-200">{summary?.proUpgrades ?? 0}</p></Card>
      <Card title="Ultra Upgrades"><p className="text-2xl font-semibold text-cyan-200">{summary?.ultraUpgrades ?? 0}</p></Card>
    </div>
    <Card className="mt-4" title="Recent Payments">
      {payments.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead><tr className="border-b border-slate-800 text-xs uppercase text-slate-400"><th className="py-2">Email</th><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {payments.slice(0, 10).map((payment) => (
                <tr key={payment.id} className="border-b border-slate-900/80 text-slate-300">
                  <td className="py-3">{payment.email}</td>
                  <td className="capitalize">{payment.plan}</td>
                  <td>₹{Math.round(payment.amount / 100)}</td>
                  <td><Badge variant={payment.status === "success" ? "success" : "danger"}>{payment.status}</Badge></td>
                  <td>{new Date(payment.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-400">{emptyMessage ?? "No payment records yet."}</p>
      )}
    </Card>
  </section>
);
