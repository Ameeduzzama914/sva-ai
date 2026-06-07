"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "../../components/app-sidebar";
import { RazorpayCheckoutButton } from "../../components/RazorpayCheckoutButton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { getSession, getSessionHeaders, getUsage, setSession } from "../../lib/client-auth";
import type { UserPlan } from "../../lib/server/store";

type PaymentRecord = {
  id: string;
  plan: "pro" | "ultra";
  amount: number;
  currency: "INR";
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  status: "success" | "failed";
  createdAt: string;
};

const planMeta: Record<UserPlan, { label: string; limit: number; price: string; description: string }> = {
  free: { label: "Free Beta", limit: 10, price: "₹0", description: "Explore trusted AI verification." },
  pro: { label: "Pro", limit: 50, price: "₹499/month", description: "For deeper verification workflows." },
  ultra: { label: "Ultra", limit: 150, price: "₹999/month", description: "For higher daily verification capacity." }
};

export default function BillingPage() {
  const [plan, setPlan] = useState<UserPlan>("free");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const session = getSession();

  const usage = useMemo(() => (email ? getUsage(email, plan) : null), [email, plan]);

  useEffect(() => {
    const loadBilling = async () => {
      if (!session) return;
      setEmail(session.email);
      setPlan(session.plan);

      try {
        const meResponse = await fetch("/api/auth/me", { headers: getSessionHeaders(), credentials: "include" });
        const me = (await meResponse.json()) as { ok: boolean; user?: { email: string; plan: UserPlan; createdAt: string } | null };
        if (meResponse.ok && me.user) {
          setEmail(me.user.email);
          setPlan(me.user.plan);
          setSession({ email: me.user.email, plan: me.user.plan, createdAt: me.user.createdAt, planVerified: me.user.plan !== "free" });
        }
      } catch {
        setStatus({ tone: "warning", message: "Unable to refresh account details. Showing local session data." });
      }

      try {
        const historyResponse = await fetch("/api/payments/history", { headers: getSessionHeaders(), credentials: "include" });
        const history = (await historyResponse.json()) as { ok: boolean; payments?: PaymentRecord[] };
        if (historyResponse.ok && history.ok) setPayments(history.payments ?? []);
      } catch {
        /* Payment history is optional because the payments table may not exist yet. */
      }
    };

    void loadBilling();
  }, [session?.email, session?.plan]);

  if (!session) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#070b14] px-4 text-slate-100">
        <Card className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Login required</h1>
          <p className="mt-2 text-sm text-slate-300">Please login before upgrading your SVA plan.</p>
          <Link href="/login"><Button variant="primary" className="mt-5 w-full">Login</Button></Link>
        </Card>
      </main>
    );
  }

  const toneClass = status?.tone === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : status?.tone === "error" ? "border-rose-500/40 bg-rose-500/10 text-rose-100" : "border-amber-500/40 bg-amber-500/10 text-amber-100";

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-slate-100">
      <div className="mx-auto flex max-w-[1600px]">
        <AppSidebar isLoggedIn remainingToday={usage?.remaining ?? planMeta[plan].limit} plan={plan} />
        <main className="min-w-0 flex-1 space-y-6 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">Billing</p>
              <h1 className="mt-1 text-3xl font-semibold text-white">Usage & Plan</h1>
            </div>
            <Link href="/app"><Button variant="ghost">Go to Dashboard</Button></Link>
          </div>

          {status ? <div className={`rounded-xl border px-4 py-3 text-sm ${toneClass}`}>{status.message}</div> : null}

          <section className="grid gap-4 lg:grid-cols-3">
            <Card title="Current Account" className="lg:col-span-1">
              <div className="space-y-3 text-sm text-slate-300">
                <p>Email: <span className="text-slate-100">{email}</span></p>
                <p>Plan: <Badge variant={plan === "ultra" ? "cyan" : plan === "pro" ? "violet" : "neutral"}>{planMeta[plan].label}</Badge></p>
                <p>Daily limit: <span className="text-slate-100">{planMeta[plan].limit}</span></p>
                <p>Remaining today: <span className="text-slate-100">{usage?.remaining ?? planMeta[plan].limit}</span></p>
              </div>
            </Card>

            {(["free", "pro", "ultra"] as UserPlan[]).map((item) => (
              <Card key={item} title={planMeta[item].label} className={item === "pro" ? "border-violet-500/60 bg-violet-500/10" : ""}>
                <div className="flex h-full flex-col gap-3 text-sm text-slate-300">
                  <p className="text-2xl font-semibold text-violet-200">{planMeta[item].price}</p>
                  <p>{planMeta[item].description}</p>
                  <p>{planMeta[item].limit} verifications/day</p>
                  {item === "free" ? (
                    <Link href="/app" className="mt-auto"><Button className="w-full">Start Free</Button></Link>
                  ) : plan === item ? (
                    <Button className="mt-auto w-full" disabled>Current Plan</Button>
                  ) : item === "pro" && plan === "ultra" ? (
                    <Button className="mt-auto w-full" disabled>Included in Ultra</Button>
                  ) : (
                    <RazorpayCheckoutButton
                      plan={item}
                      className="mt-auto w-full"
                      onSuccess={(nextPlan, message) => {
                        setPlan(nextPlan);
                        setStatus({ tone: "success", message });
                      }}
                      onFailure={(message) => setStatus({ tone: "error", message })}
                    />
                  )}
                </div>
              </Card>
            ))}
          </section>

          <Card title="Payment Status">
            <p className="text-sm text-slate-300">
              {status?.message ?? "Choose Pro or Ultra to open Razorpay Standard Checkout. Your plan changes only after server-side signature verification succeeds."}
            </p>
          </Card>

          <Card title="Payment History">
            {payments.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead><tr className="border-b border-slate-800 text-xs uppercase text-slate-400"><th className="py-2">Plan</th><th>Amount</th><th>Status</th><th>Date</th><th>Payment ID</th></tr></thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-slate-900/80 text-slate-300">
                        <td className="py-3 capitalize">{payment.plan}</td>
                        <td>₹{Math.round(payment.amount / 100)}</td>
                        <td><Badge variant={payment.status === "success" ? "success" : "danger"}>{payment.status}</Badge></td>
                        <td>{new Date(payment.createdAt).toLocaleString()}</td>
                        <td>{payment.razorpayPaymentId ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No payment records found. If the Supabase payments table has not been created yet, checkout still works and history will appear after the migration is applied.</p>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}
