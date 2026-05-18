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
  chips: string[];
  ctaLabel: string;
  featured: boolean;
  launchingSoon: boolean;
};

const plans: Plan[] = [
  {
    key: "free",
    name: "Free Beta",
    price: "₹0",
    description: "Best for exploring trusted AI verification",
    features: ["10 verifications/day", "Compare 3 AI models", "Access to Mistral AI", "Access to Llama", "Access to Gemma", "Basic trust analysis", "Basic evidence retrieval", "Community-speed verification"],
    chips: ["Mistral", "Llama", "Gemma"],
    ctaLabel: "Start Free",
    featured: false,
    launchingSoon: false
  },
  {
    key: "pro",
    name: "Pro",
    price: "₹499/month",
    description: "For deeper verification and advanced trust workflows",
    features: ["100 verifications/day", "Access to GPT", "Access to Gemini", "Access to DeepSeek", "Advanced trust scoring", "Deep evidence verification", "Enhanced contradiction analysis", "Faster verification speed", "Verification history", "Export verification results"],
    chips: ["GPT", "Gemini", "DeepSeek"],
    ctaLabel: "Join Waitlist",
    featured: true,
    launchingSoon: true
  },
  {
    key: "plus",
    name: "Ultra",
    price: "₹999/month",
    description: "For advanced research and professional verification workflows",
    features: ["Expanded verification capacity", "Access to GPT", "Access to Gemini", "Access to Claude", "Access to Perplexity", "Access to DeepSeek", "Premium AI routing", "Advanced evidence engine", "Long-context verification", "Research workflows", "Team/workspace support", "Priority verification queue", "Early access features"],
    chips: ["GPT", "Claude", "Gemini", "Perplexity", "DeepSeek"],
    ctaLabel: "Join Waitlist",
    featured: false,
    launchingSoon: true
  }
];

export default function PricingPage() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const choosePlan = (plan: Plan) => {
    if (plan.launchingSoon) {
      setMsg("Waitlist open — paid plans are launching soon. Continue with Free for now.");
      return;
    }
    setPlanIntent(plan.key);
    const session = getSession();
    router.push(session ? "/app" : "/signup");
  };

  return <div className="min-h-screen bg-[#070b14] text-slate-100"><MarketingNav />
    <main className="mx-auto max-w-6xl px-4 pb-14 pt-20 sm:px-6"><div className="mb-10 text-center"><h1 className="text-4xl font-semibold tracking-tight">Pricing for every trust workflow</h1><p className="mt-3 text-slate-400">Choose a plan designed for your verification depth and AI confidence needs.</p></div>
      <div className="grid gap-5 md:grid-cols-3">{plans.map((plan)=><Card key={plan.name} className={`h-full backdrop-blur transition duration-200 hover:-translate-y-1 hover:border-violet-400/40 ${plan.featured?"md:scale-[1.02] border-violet-500/70 bg-violet-500/10 shadow-[0_0_50px_rgba(139,92,246,0.28)]":"bg-slate-900/70"}`}><div className="flex h-full flex-col space-y-4">{plan.featured?<Badge variant="violet">Most Popular</Badge>:null}{plan.launchingSoon ? <Badge variant="warning">Waitlist open</Badge> : null}<h2 className="text-2xl font-semibold">{plan.name}</h2><p className="text-2xl font-semibold text-violet-200">{plan.price}</p><p className="text-sm text-slate-300">{plan.description}</p><div className="flex flex-wrap gap-2">{plan.chips.map((chip)=><Badge key={chip} variant="indigo">{chip}</Badge>)}</div><ul className="space-y-2 text-sm text-slate-300">{plan.features.map((feature)=><li key={feature}>• {feature}</li>)}</ul><Button variant={plan.featured?"primary":"secondary"} className="mt-auto w-full" onClick={()=>choosePlan(plan)}>{plan.ctaLabel}</Button></div></Card>)}</div>
      <section className="mt-10"><Card title="Usage tracker (Free Beta plan)"><p className="text-sm text-slate-300">Free Beta includes 10 verifications/day. Usage updates as you run verification.</p></Card></section>
      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
    </main></div>;
}
