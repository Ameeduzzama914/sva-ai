"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { getSession, setPlanIntent } from "../../lib/client-auth";

const plans = [
  { key: "free", name: "Free", price: "₹0", featured: false, description: "10 verifications/day · 3 AI comparisons · basic evidence retrieval", comingSoon: false },
  { key: "pro", name: "Pro", price: "₹499/month", featured: true, description: "50 verifications/day · deeper verification · saved history · enhanced trust analysis", comingSoon: true },
  { key: "plus", name: "Plus", price: "₹999/month", featured: false, description: "unlimited verifications · advanced models · priority verification · export/share tools · advanced evidence engine", comingSoon: true }
] as const;

export default function PricingPage() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const choosePlan = (plan: "free" | "pro" | "plus", comingSoon?: boolean) => {
    setPlanIntent(plan);
    const session = getSession();
    if (session) {
      if (comingSoon) setMsg("Billing coming soon — your plan selection has been saved.");
      router.push("/app");
      return;
    }
    router.push("/signup");
  };

  return <div className="min-h-screen bg-[#070b14] text-slate-100"><MarketingNav />
    <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6"><div className="mb-10 text-center"><h1 className="text-4xl font-semibold">Pricing for every trust workflow</h1></div>
      <div className="grid gap-5 md:grid-cols-3">{plans.map((plan)=><Card key={plan.name} className={plan.featured?"border-violet-500/60 shadow-[0_0_40px_rgba(139,92,246,0.2)]":""}><div className="space-y-3">{plan.featured?<Badge variant="violet">Most popular</Badge>:null}{plan.comingSoon ? <Badge variant="warning">Billing coming soon</Badge> : null}<h2 className="text-2xl font-semibold">{plan.name}</h2><p className="text-xl text-violet-200">{plan.price}</p><p className="text-sm text-slate-300">{plan.description}</p><Button variant={plan.featured?"primary":"secondary"} className="mt-2 w-full" onClick={()=>choosePlan(plan.key,plan.comingSoon)}>Choose {plan.name}</Button></div></Card>)}</div>
      <section className="mt-10"><Card title="Usage tracker (Free plan MVP)"><p className="text-sm text-slate-300">Free plan includes 10 verifications/day. Usage updates as you run verification.</p></Card></section>
      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
    </main></div>;
}
