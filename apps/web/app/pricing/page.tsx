"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { getSession, setPlanIntent } from "../../lib/client-auth";

type Plan = {
  key: "free" | "pro" | "plus";
  name: string;
  price: string;
  description: string;
  features: string[];
  ctaLabel: string;
  featured: boolean;
  billingComingSoon: boolean;
};

const plans: Plan[] = [
  { key: "free", name: "Free", price: "₹0", description: "Best for getting started", features: ["10 verifications/day", "3 AI comparisons", "Basic evidence retrieval"], ctaLabel: "Start free", featured: false, billingComingSoon: false },
  { key: "pro", name: "Pro", price: "₹499/month", description: "For deeper verification workflows", features: ["50 verifications/day", "Deeper verification", "Saved history", "Enhanced trust analysis"], ctaLabel: "Join waitlist", featured: true, billingComingSoon: true },
  { key: "plus", name: "Plus", price: "₹999/month", description: "For advanced users and teams", features: ["Unlimited verifications", "Advanced AI models", "Priority verification", "Export/share tools", "Advanced evidence engine"], ctaLabel: "Join waitlist", featured: false, billingComingSoon: true }
];

export default function PricingPage() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const choosePlan = (plan: Plan) => {
    if (plan.billingComingSoon) {
      setMsg("Billing is coming soon. Continue with Free for now.");
      return;
    }
    setPlanIntent(plan.key);
    const session = getSession();
    router.push(session ? "/app" : "/signup");
  };

  return <div className="min-h-screen bg-[#070b14] text-slate-100"><MarketingNav />
    <main className="mx-auto max-w-6xl px-4 pb-14 pt-20 sm:px-6"><div className="mb-10 text-center"><h1 className="text-4xl font-semibold">Pricing for every trust workflow</h1></div>
      <div className="grid gap-5 md:grid-cols-3">{plans.map((plan)=><Card key={plan.name} className={plan.featured?"border-violet-500/60 shadow-[0_0_40px_rgba(139,92,246,0.2)]":""}><div className="space-y-3">{plan.featured?<Badge variant="violet">Most popular</Badge>:null}{plan.billingComingSoon ? <Badge variant="warning">Billing coming soon</Badge> : null}<h2 className="text-2xl font-semibold">{plan.name}</h2><p className="text-xl text-violet-200">{plan.price}</p><p className="text-sm text-slate-300">{plan.description}</p><ul className="space-y-1 text-sm text-slate-300">{plan.features.map((feature)=><li key={feature}>• {feature}</li>)}</ul><Button variant={plan.featured?"primary":"secondary"} className="mt-2 w-full" onClick={()=>choosePlan(plan)}>{plan.ctaLabel}</Button></div></Card>)}</div>
      <section className="mt-10"><Card title="Usage tracker (Free Beta plan)"><p className="text-sm text-slate-300">Free plan includes 10 verifications/day. Usage updates as you run verification.</p></Card></section>
      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
    </main></div>;
}
