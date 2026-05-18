import Link from "next/link";
import { MarketingNav } from "../components/marketing-nav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

const features = [
  { title: "Multi-AI verification", description: "Cross-checks outputs across Fast, Balanced, and Research models." },
  { title: "Evidence engine", description: "Retrieves web evidence and scores source credibility and relevance." },
  { title: "Contradiction analysis", description: "Flags disagreement patterns and highlights risk before you trust." },
  { title: "Trust scoring", description: "Produces a confidence-backed answer with transparent rationale." }
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      <MarketingNav />
      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(139,92,246,0.25),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.2),transparent_40%)]" />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
            <div className="relative space-y-6">
              <Badge variant="violet">Commercial Launch Preview</Badge>
              <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">Stop trusting a single AI answer.</h1>
              <p className="max-w-xl text-base text-slate-300 sm:text-lg">SVA compares multiple AI models, retrieves evidence, analyzes contradictions, and generates confidence-backed verified answers.</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/app"><Button variant="primary">Start Verifying</Button></Link>
                <Link href="/pricing"><Button>View Demo</Button></Link>
              </div>
            </div>
            <Card className="border-violet-500/30 bg-slate-950/70">
              <p className="text-xs uppercase tracking-wide text-slate-400">Trust score preview</p>
              <p className="mt-2 text-3xl font-semibold text-violet-200">86/100</p>
              <div className="mt-4 grid gap-3 text-sm">
                <div className="rounded-lg border border-slate-700/80 p-3">AI comparison: <span className="text-emerald-300">2 majority · 1 outlier</span></div>
                <div className="rounded-lg border border-slate-700/80 p-3">Evidence cards: <span className="text-sky-300">12 sources · credibility weighted</span></div>
                <div className="rounded-lg border border-slate-700/80 p-3">Contradiction engine: <span className="text-amber-300">low conflict detected</span></div>
              </div>
            </Card>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold">How SVA works</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {features.map((item) => (
              <Card key={item.title} title={item.title} className="transition hover:border-violet-400/40">
                <p className="text-sm text-slate-300">{item.description}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
          <Card className="border-slate-700/70">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h3 className="text-xl font-semibold text-white">Commercial pricing designed for trust-heavy workflows</h3>
                <p className="mt-2 text-sm text-slate-300">Start free, then scale with Pro and Plus plans for deeper verification and team workflows.</p>
              </div>
              <Link href="/pricing"><Button variant="primary">See pricing</Button></Link>
            </div>
          </Card>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8 text-center text-sm text-slate-400">© 2026 SVA · Verify before you trust.</footer>
    </div>
  );
}
