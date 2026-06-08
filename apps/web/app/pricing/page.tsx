"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { ProviderLogo } from "../../components/provider-logo";
import { RazorpayCheckoutButton } from "../../components/RazorpayCheckoutButton";
import { TestPaymentSimulationButton } from "../../components/TestPaymentSimulationButton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { isAdminEmail } from "../../lib/admin";
import { getSession, setPlanIntent } from "../../lib/client-auth";
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

const plans: Plan[] = [
  {
    key: "free",
    name: "Free Beta",
    price: "₹0",
    description: "Best for exploring trusted AI verification.",
    features: ["10 verifications/day", "Compare 3 AI models", "Mistral + Llama + Gemma", "Basic trust analysis", "Evidence retrieval", "Contradiction summary", "Verification history"],
    chips: ["Mistral", "Llama", "Gemma"],
    ctaLabel: "Start Free",
    featured: false
  },
  {
    key: "pro",
    name: "Pro",
    price: "₹499/month",
    description: "For deeper verification and advanced trust workflows.",
    features: ["50 verifications/day", "GPT + Gemini + DeepSeek", "Advanced trust scoring", "Deep evidence verification", "Enhanced contradiction analysis", "Faster verification speed", "Verification history"],
    chips: ["GPT", "Gemini", "DeepSeek"],
    ctaLabel: "Upgrade to Pro",
    featured: true
  },
  {
    key: "ultra",
    name: "Ultra",
    price: "₹999/month",
    description: "For power users who need higher daily verification capacity.",
    features: ["150 verifications/day", "Up to 4,500 verifications/month", "GPT + Gemini + DeepSeek", "Priority verification capacity", "Export-ready reports", "Advanced contradiction review", "Early access to premium verification tools"],
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
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      <MarketingNav />
      <main className="mx-auto max-w-6xl px-4 pb-14 pt-20 sm:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">Pricing</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Pricing for every trust workflow</h1>
          <p className="mt-3 leading-7 text-slate-400">Choose the verification depth, model access, and daily capacity that match how often you need confidence-backed answers.</p>
        </div>

        <div className={`grid gap-5 ${showAdminEntry ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
          {plans.map((plan) => (
            <Card key={plan.name} className={`h-full backdrop-blur transition duration-200 hover:-translate-y-1 hover:border-violet-400/40 ${plan.featured ? "md:scale-[1.02] border-violet-500/70 bg-violet-500/10 shadow-[0_0_50px_rgba(139,92,246,0.24)]" : "bg-slate-900/70 shadow-lg shadow-black/15"}`}>
              <div className="flex h-full flex-col space-y-4">
                <div className="flex min-h-7 flex-wrap gap-2">
                  {plan.featured ? <Badge variant="violet">Most Popular</Badge> : null}
                  {plan.key === "ultra" ? <Badge variant="cyan">Highest Capacity</Badge> : null}
                </div>
                <h2 className="text-2xl font-semibold text-white">{plan.name}</h2>
                <p className="text-3xl font-semibold text-violet-200">{plan.price}</p>
                <p className="text-sm leading-6 text-slate-300">{plan.description}</p>
                <div className="flex flex-wrap gap-2">
                  {plan.chips.map((chip) => (
                    <Badge key={chip} variant="indigo" className="gap-1.5">
                      <ProviderLogo provider={chip} size="sm" className="border-white/20" />{chip}
                    </Badge>
                  ))}
                </div>
                <ul className="space-y-2 text-sm text-slate-300">
                  {plan.features.map((feature) => <li key={feature} className="flex gap-2"><span className="text-emerald-300">✓</span><span>{feature}</span></li>)}
                </ul>
                {plan.key === "free" ? (
                  <Button variant="secondary" className="mt-auto w-full" onClick={chooseFree}>{plan.ctaLabel}</Button>
                ) : (
                  <div className="mt-auto space-y-2">
                    <RazorpayCheckoutButton
                      plan={plan.key}
                      label={plan.ctaLabel}
                      className="w-full"
                      onSuccess={(_, message) => {
                        setMsg(message);
                        router.push("/billing");
                      }}
                      onFailure={(message) => setMsg(message)}
                    />
                    <TestPaymentSimulationButton
                      plan={plan.key}
                      className="w-full"
                      onSuccess={(_, message) => {
                        setMsg(message);
                        router.push("/billing");
                      }}
                      onFailure={(message) => setMsg(message)}
                    />
                  </div>
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
                  <li>• User & plan management</li>
                  <li>• Verification logs</li>
                  <li>• Feedback viewer</li>
                  <li>• System health panel</li>
                </ul>
                <Button variant="primary" className="mt-auto w-full" onClick={() => router.push("/admin")}>Open Admin Dashboard</Button>
              </div>
            </Card>
          ) : null}
        </div>

        <section className="mt-10">
          <Card title="Usage tracker" className="border-slate-700/80 bg-slate-900/70">
            <p className="text-sm leading-6 text-slate-300">Free Beta includes 10 verifications/day, Pro includes 50/day, and Ultra includes 150/day. Usage updates as you run verification.</p>
          </Card>
        </section>
        {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
      </main>
    </div>
  );
}
