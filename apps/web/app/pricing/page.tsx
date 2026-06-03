"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { ProviderLogo } from "../../components/provider-logo";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { isAdminEmail } from "../../lib/admin";
import { getSession, getSessionHeaders, setPlanIntent, setSession } from "../../lib/client-auth";

type Plan = {
  key: "free" | "pro" | "ultra";
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
    description: "Best for exploring trusted AI verification",
    features: ["10 verifications/day", "Compare 3 AI models", "Access to Mistral AI", "Access to Llama", "Access to Gemma", "Basic trust analysis", "Basic evidence retrieval", "Community-speed verification"],
    chips: ["Mistral", "Llama", "Gemma"],
    ctaLabel: "Start Free",
    featured: false
  },
  {
    key: "pro",
    name: "Pro",
    price: "₹499/month",
    description: "For deeper verification and advanced trust workflows",
    features: ["50 verifications/day", "Access to GPT", "Access to Gemini", "Access to DeepSeek", "Advanced trust scoring", "Deep evidence verification", "Enhanced contradiction analysis", "Faster verification speed", "Verification history"],
    chips: ["GPT", "Gemini", "DeepSeek"],
    ctaLabel: "Upgrade to Pro (Test)",
    featured: true
  },
  {
    key: "ultra",
    name: "Ultra",
    price: "₹999/month",
    description: "For power users who need higher daily verification capacity",
    features: ["150 verifications/day", "Up to 4,500 verifications/month", "Access to GPT", "Access to Gemini", "Access to DeepSeek", "Power User Access", "⚡ Priority Processing (Coming Soon)", "📄 Export Reports (Coming Soon)", "🚀 Early Access Features (Coming Soon)"],
    chips: ["GPT", "Gemini", "DeepSeek"],
    ctaLabel: "Upgrade to Ultra (Test)",
    featured: false
  }
];

export default function PricingPage() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<Plan["key"] | null>(null);
  const session = getSession();
  const showAdminEntry = isAdminEmail(session?.email);

  const choosePlan = async (plan: Plan) => {
    if ((plan.key === "pro" || plan.key === "ultra") && session) {
      try {
        setUpgradingPlan(plan.key);
        const response = await fetch("/api/upgrade", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getSessionHeaders() },
          body: JSON.stringify({ plan: plan.key, sessionEmail: session.email })
        });
        const data = (await response.json()) as { ok: boolean; message?: string; user?: { plan?: "free" | "pro" | "ultra" } };
        if (!response.ok || !data.ok || data.user?.plan !== plan.key) {
          setMsg(data.message ?? "Unable to upgrade right now. Please try again.");
          return;
        }
        setSession({
          email: session.email,
          plan: plan.key,
          createdAt: session.createdAt
        });
        setMsg(`Test/dev upgrade applied. Your account is now on ${plan.name}.`);
        router.push("/app");
        return;
      } catch {
        setMsg("Unable to upgrade right now. Please try again.");
        return;
      } finally {
        setUpgradingPlan(null);
      }
    }

    setPlanIntent(plan.key);
    router.push(session ? "/app" : "/signup");
  };

  return <div className="min-h-screen bg-[#070b14] text-slate-100"><MarketingNav />
    <main className="mx-auto max-w-6xl px-4 pb-14 pt-20 sm:px-6"><div className="mb-10 text-center"><h1 className="text-4xl font-semibold tracking-tight">Pricing for every trust workflow</h1><p className="mt-3 text-slate-400">Choose a plan designed for your verification depth and AI confidence needs.</p></div>
      <div className={`grid gap-5 ${showAdminEntry ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
        {plans.map((plan)=><Card key={plan.name} className={`h-full backdrop-blur transition duration-200 hover:-translate-y-1 hover:border-violet-400/40 ${plan.featured?"md:scale-[1.02] border-violet-500/70 bg-violet-500/10 shadow-[0_0_50px_rgba(139,92,246,0.28)]":"bg-slate-900/70"}`}><div className="flex h-full flex-col space-y-4">{plan.featured?<Badge variant="violet">Most Popular</Badge>:null}{plan.key === "ultra" ? <Badge variant="cyan">Premium</Badge> : null}<h2 className="text-2xl font-semibold">{plan.name}</h2><p className="text-2xl font-semibold text-violet-200">{plan.price}</p><p className="text-sm text-slate-300">{plan.description}</p><div className="flex flex-wrap gap-2">{plan.chips.map((chip)=><Badge key={chip} variant="indigo" className="gap-1.5"><ProviderLogo provider={chip} size="sm" className="border-white/20" />{chip}</Badge>)}</div><ul className="space-y-2 text-sm text-slate-300">{plan.features.map((feature)=><li key={feature}>• {feature}</li>)}</ul><Button variant={plan.featured?"primary":"secondary"} className="mt-auto w-full" onClick={()=>void choosePlan(plan)} disabled={upgradingPlan === plan.key}>{upgradingPlan === plan.key ? "Upgrading..." : plan.ctaLabel}</Button></div></Card>)}
        {showAdminEntry ? (
          <Card className="h-full border-cyan-500/40 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 backdrop-blur">
            <div className="flex h-full flex-col space-y-4">
              <Badge variant="cyan">Founder only</Badge>
              <h2 className="text-2xl font-semibold">Admin</h2>
              <p className="text-2xl font-semibold text-cyan-200">Private</p>
              <p className="text-sm text-slate-300">Founder control center for users, plans, usage, feedback, and system health.</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">Not a plan</Badge>
                <Badge variant="neutral">No billing</Badge>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• User & plan management</li>
                <li>• Verification logs</li>
                <li>• Feedback viewer</li>
                <li>• System health panel</li>
              </ul>
              <Button variant="primary" className="mt-auto w-full" onClick={() => router.push("/admin")}>
                Open Admin Dashboard
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
      <section className="mt-10"><Card title="Usage tracker"><p className="text-sm text-slate-300">Free Beta includes 10 verifications/day, Pro includes 50/day, and Ultra includes 150/day. Usage updates as you run verification.</p></Card></section>
      {msg ? <p className="mt-4 text-sm text-amber-300">{msg}</p> : null}
    </main></div>;
}
