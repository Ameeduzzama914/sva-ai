import Link from "next/link";
import { MarketingNav } from "../../components/marketing-nav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";

const plans = [
  { name: "Free", price: "₹0", description: "For everyday verification", features: ["10 verifications/day", "3 AI comparisons", "Basic evidence retrieval"] },
  { name: "Pro", price: "₹499/month", featured: true, description: "For serious analysts", features: ["50 verifications/day", "Deeper verification", "Saved history", "Enhanced trust analysis"] },
  { name: "Plus", price: "₹999/month", description: "For teams and power users", features: ["Unlimited verifications", "Advanced AI models", "Priority verification", "Export/share tools", "Advanced evidence engine"] }
];

export default function PricingPage() {
  return <div className="min-h-screen bg-[#070b14] text-slate-100"><MarketingNav />
    <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="mb-10 text-center"><h1 className="text-4xl font-semibold">Pricing for every trust workflow</h1><p className="mt-3 text-slate-300">Simple plans that scale from personal verification to high-volume AI due diligence.</p></div>
      <div className="grid gap-5 md:grid-cols-3">{plans.map((plan)=><Card key={plan.name} className={plan.featured?"border-violet-500/60 shadow-[0_0_40px_rgba(139,92,246,0.2)]":""}>
        <div className="space-y-3">{plan.featured?<Badge variant="violet">Most popular</Badge>:null}<h2 className="text-2xl font-semibold">{plan.name}</h2><p className="text-xl text-violet-200">{plan.price}</p><p className="text-sm text-slate-300">{plan.description}</p><ul className="space-y-2 text-sm text-slate-300">{plan.features.map((f)=><li key={f}>• {f}</li>)}</ul><Link href="/signup"><Button variant={plan.featured?"primary":"secondary"} className="mt-2 w-full">Choose {plan.name}</Button></Link></div>
      </Card>)}</div>
      <section className="mt-10"><Card title="Usage & Subscription Settings"><div className="grid gap-4 md:grid-cols-2"><div><p className="text-sm text-slate-300">Current plan: <span className="font-semibold text-white">Free</span></p><p className="mt-2 text-sm text-slate-400">Daily quota: 10 verifications</p><div className="mt-3 h-2 rounded-full bg-slate-800"><div className="h-2 w-2/5 rounded-full bg-violet-400" /></div><p className="mt-1 text-xs text-slate-400">4/10 used today</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-sm text-slate-200">Need deeper verification?</p><p className="mt-1 text-xs text-slate-400">Upgrade to Pro for higher limits and richer analysis outputs.</p><Link href="/signup"><Button variant="primary" className="mt-3">Upgrade now</Button></Link></div></div></Card></section>
    </main></div>;
}
