"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { PublicFooter } from "../../components/public-shell";
import { ProviderLogo } from "../../components/provider-logo";
import { RazorpayCheckoutButton } from "../../components/RazorpayCheckoutButton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { isAdminEmail } from "../../lib/admin";
import { getSession, setPlanIntent } from "../../lib/client-auth";
import { SVA_PLANS } from "../../lib/plans";
import type { UserPlan } from "../../lib/server/store";

type Plan = {
  key: UserPlan;
  name: string;
  price: string;
  description: string;
  features: string[];
  chips: string[];
  ctaLabel: string;
  featured: boolean;
};

const formatPrice = (plan: UserPlan) => {
  const price = SVA_PLANS[plan].priceInr;
  return price === 0 ? "Rs 0" : `Rs ${price}/month`;
};

const allowanceFeature = (plan: UserPlan) => {
  const config = SVA_PLANS[plan];
  return `${config.dailyVerificationLimit} Verified Mode runs/day, ${config.monthlyVerificationLimit}/billing period`;
};

const plans: Plan[] = [
  {
    key: "free",
    name: "Free Beta",
    price: formatPrice("free"),
    description: "Best for exploring trusted AI verification.",
    features: [allowanceFeature("free"), "Verified Mode only", "Three-model comparison", "Basic confidence and disagreement display", "Evidence retrieval when configured", "Verification history"],
    chips: ["GPT", "Gemini", "DeepSeek"],
    ctaLabel: "Start Free",
    featured: false
  },
  {
    key: "pro",
    name: "Pro",
    price: formatPrice("pro"),
    description: "For deeper verification and advanced trust workflows.",
    features: [allowanceFeature("pro"), "Verified Mode only", "GPT + Gemini + DeepSeek", "Final verified synthesis", "Confidence and disagreement analysis", "Saved history", "Standard priority"],
    chips: ["GPT", "Gemini", "DeepSeek"],
    ctaLabel: "Upgrade to Pro",
    featured: true
  },
  {
    key: "ultra",
    name: "Ultra",
    price: formatPrice("ultra"),
    description: "For power users who need higher verification capacity.",
    features: [allowanceFeature("ultra"), "Verified Mode only", "GPT + Gemini + DeepSeek", "Final verified synthesis", "Longer questions", "Priority processing", "Saved history"],
    chips: ["GPT", "Gemini", "DeepSeek"],
    ctaLabel: "Upgrade to Ultra",
    featured: false
  }
];

export default function PricingPage() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const session = getSession();
  const showAdminEntry = isAdminEmail(session?.email);

  const chooseFree = () => {
    setPlanIntent("free");
    router.push(session ? "/app" : "/signup");
  };

  return (
    <div className="sva-atmosphere min-h-screen text-slate-100">
      <MarketingNav />
      <main className="mx-auto max-w-6xl px-4 pb-14 pt-20 sm:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/75">Pricing</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Pricing for Verified Mode</h1>
          <p className="mt-3 leading-7 text-slate-400">Every plan uses SVA's shared verification pipeline with central model access and one clear allowance.</p>
        </div>

        <div className={`grid gap-5 ${showAdminEntry ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
          {plans.map((plan) => (
            <Card key={plan.name} className={`h-full backdrop-blur transition duration-200 hover:-translate-y-1 hover:border-emerald-300/25 ${plan.featured ? "md:scale-[1.02] border-emerald-300/35 bg-emerald-300/[0.055] shadow-[0_0_50px_rgba(16,185,129,0.10)]" : ""}`}>
              <div className="flex h-full flex-col space-y-4">
                <div className="flex min-h-7 flex-wrap gap-2">
                  {plan.featured ? <Badge variant="success">Most Popular</Badge> : null}
                  {plan.key === "ultra" ? <Badge variant="cyan">Highest Capacity</Badge> : null}
                </div>
                <h2 className="text-2xl font-semibold text-white">{plan.name}</h2>
                <p className="text-3xl font-semibold text-emerald-100">{plan.price}</p>
                <p className="text-sm leading-6 text-slate-300">{plan.description}</p>
                <div className="flex flex-wrap gap-2">
                  {plan.chips.map((chip) => (
                    <Badge key={chip} variant="neutral" className="gap-1.5">
                      <ProviderLogo provider={chip} size="sm" className="border-white/20" />{chip}
                    </Badge>
                  ))}
                </div>
                <ul className="space-y-2 text-sm text-slate-300">
                  {plan.features.map((feature) => <li key={feature} className="flex gap-2"><span className="text-emerald-300">-</span><span>{feature}</span></li>)}
                </ul>
                {plan.key === "free" ? (
                  <Button variant="secondary" className="mt-auto w-full" onClick={chooseFree}>{plan.ctaLabel}</Button>
                ) : (
                  <RazorpayCheckoutButton
                    plan={plan.key}
                    label={plan.ctaLabel}
                    className="mt-auto w-full"
                    onSuccess={(_, message) => {
                      setMsg(message);
                      router.push("/billing");
                    }}
                    onFailure={(message) => setMsg(message)}
                  />
                )}
              </div>
            </Card>
          ))}

          {showAdminEntry ? (
            <Card className="h-full border-cyan-500/40 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 backdrop-blur">
              <div className="flex h-full flex-col space-y-4">
                <Badge variant="cyan">Founder only</Badge>
                <h2 className="text-2xl font-semibold">Admin</h2>
                <p className="text-2xl font-semibold text-cyan-200">Private</p>
                <p className="text-sm text-slate-300">Founder control center for users, plans, usage, feedback, and system health.</p>
                <div className="flex flex-wrap gap-2"><Badge variant="neutral">Not a customer plan</Badge><Badge variant="neutral">No billing</Badge></div>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li>User & plan management</li>
                  <li>Verification logs</li>
                  <li>Feedback viewer</li>
                  <li>System health panel</li>
                </ul>
                <Button variant="primary" className="mt-auto w-full" onClick={() => router.push("/admin")}>Open Admin Dashboard</Button>
              </div>
            </Card>
          ) : null}
        </div>

        <section className="mt-10">
          <Card title="Usage tracker" className="border-slate-700/80 bg-slate-900/70">
            <p className="text-sm leading-6 text-slate-300">Free includes {SVA_PLANS.free.dailyVerificationLimit}/day, Pro includes {SVA_PLANS.pro.dailyVerificationLimit}/day, and Ultra includes {SVA_PLANS.ultra.dailyVerificationLimit}/day. Successful verifications use exactly one allowance unit.</p>
          </Card>
        </section>
        {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
      </main>
      <PublicFooter />
    </div>
  );
}
