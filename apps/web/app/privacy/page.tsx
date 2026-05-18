import { MarketingNav } from "../../components/marketing-nav";
import { Card } from "../../components/ui/card";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      <MarketingNav />
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold">Privacy Policy (MVP)</h1>
        <Card title="What SVA stores"><p className="text-sm text-slate-300">SVA stores account email, selected plan, usage counters, verification queries, and generated results to support core product functionality.</p></Card>
        <Card title="Verification queries and results"><p className="text-sm text-slate-300">Your prompts and verification outputs may be persisted for history and product-quality improvements during MVP launch testing.</p></Card>
        <Card title="Account email and usage counters"><p className="text-sm text-slate-300">We track daily verification usage limits for Free plan accounts and maintain minimal auth data for demo access control.</p></Card>
        <Card title="Local/demo datastore warning"><p className="text-sm text-slate-300">Current MVP environments may run on local/demo datastores and are not intended for regulated or highly sensitive workloads.</p></Card>
        <Card title="Sensitive data warning"><p className="text-sm text-slate-300">Do not submit sensitive personal, medical, legal, or financial information. SVA responses are assistive and must be independently validated.</p></Card>
        <Card title="Billing status"><p className="text-sm text-slate-300">Paid billing flows are not fully connected in MVP mode. Pro/Plus plan selection can be captured, but payment processing is coming soon.</p></Card>
        <Card title="Contact"><p className="text-sm text-slate-300">Contact placeholder: support@sva.app (MVP inbox).</p></Card>
              <Card title="Terms"><p className="text-sm text-slate-300">MVP terms coming soon.</p></Card>
        <Card title="Last updated"><p className="text-sm text-slate-300">May 2026</p></Card>
      </main>
    </div>
  );
}
