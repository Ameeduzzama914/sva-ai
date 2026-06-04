"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MarketingNav } from "../components/marketing-nav";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { getSession } from "../lib/client-auth";

const trustPillars = [
  "Multi-model verification",
  "Evidence-weighted answers",
  "Contradiction detection",
  "Trust Score engine"
];

const steps = [
  ["01", "Ask a question", "Submit anything important enough to check before you trust it."],
  ["02", "SVA compares multiple AI models", "Independent model responses are compared for consensus, gaps, and outliers."],
  ["03", "Evidence is retrieved and ranked", "Sources are scored for relevance, credibility, and claim support."],
  ["04", "Contradictions are detected", "SVA surfaces conflicts and generates a clear Trust Score." ]
];

const singleAi = ["One model answer", "Hidden confidence", "No contradiction detection", "Limited evidence weighting"];
const sva = ["Multi-model consensus", "Visible Trust Score", "Contradiction engine", "Source credibility ranking"];

export default function HomePage() {
  const [isAuthed, setIsAuthed] = useState(false);
  useEffect(() => setIsAuthed(Boolean(getSession())), []);
  const ctaHref = isAuthed ? "/app" : "/signup";

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      <MarketingNav />
      <main className="pt-4 sm:pt-6">
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(139,92,246,0.24),transparent_42%),radial-gradient(circle_at_82%_4%,rgba(34,211,238,0.16),transparent_38%)]" />
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-18">
            <div className="relative space-y-6">
              <div className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                AI verification for high-stakes answers
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                Stop trusting a single AI answer.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                Compare multiple AI models, retrieve evidence, detect contradictions, and get confidence-backed answers before you trust anything important.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href={ctaHref}><Button variant="primary">Start Verifying</Button></Link>
                <a href="#how-it-works"><Button>See how it works</Button></a>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {trustPillars.map((item) => (
                  <span key={item} className="rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 shadow-sm shadow-black/20">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <Card id="demo" className="relative border-violet-500/30 bg-slate-950/75 shadow-[0_0_55px_rgba(139,92,246,0.18)] backdrop-blur">
              <p className="text-xs uppercase tracking-wide text-slate-400">Trust score preview</p>
              <div className="mt-3 flex items-end gap-3">
                <p className="text-5xl font-semibold text-violet-200">86</p>
                <p className="pb-2 text-sm text-slate-400">/100 confidence</p>
              </div>
              <div className="mt-5 grid gap-3 text-sm">
                <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3">AI comparison: <span className="text-emerald-300">2 majority, 1 outlier</span></div>
                <div className="rounded-lg border border-sky-400/25 bg-sky-400/10 p-3">Evidence cards: <span className="text-sky-300">12 sources, credibility weighted</span></div>
                <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3">Contradiction engine: <span className="text-amber-300">low conflict detected</span></div>
              </div>
            </Card>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wide text-violet-300">How SVA Works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">From question to confidence in four steps</h2>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map(([number, title, copy]) => (
              <Card key={title} className="border-slate-700/80 bg-slate-900/70 shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:border-violet-400/45">
                <p className="text-xs font-semibold text-cyan-300">{number}</p>
                <h3 className="mt-3 text-base font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{copy}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
          <div className="mb-6 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wide text-cyan-300">Why SVA is different</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Built for verification, not blind generation</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Single AI tools" className="border-slate-700/80 bg-slate-900/65">
              <ul className="space-y-3 text-sm text-slate-300">
                {singleAi.map((item) => <li key={item} className="rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2">{item}</li>)}
              </ul>
            </Card>
            <Card title="SVA" className="border-violet-500/40 bg-violet-500/10 shadow-[0_0_40px_rgba(139,92,246,0.14)]">
              <ul className="space-y-3 text-sm text-slate-100">
                {sva.map((item) => <li key={item} className="rounded-lg border border-violet-400/25 bg-slate-950/45 px-3 py-2 text-violet-100">{item}</li>)}
              </ul>
            </Card>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <Card className="border-slate-700/70 bg-slate-900/70 shadow-xl shadow-black/20">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h3 className="text-xl font-semibold text-white">Ready to verify before you trust?</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">Start free, then upgrade when you need deeper verification capacity and premium model access.</p>
              </div>
              <Link href="/pricing"><Button variant="primary">See pricing</Button></Link>
            </div>
          </Card>
        </section>
      </main>
      <footer className="border-t border-white/10 py-8 text-sm text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 SVA — Verify before you trust.</p>
          <div className="flex flex-wrap gap-5">
            <Link href="/app" className="hover:text-white">Dashboard</Link>
            <Link href="/pricing" className="hover:text-white">Pricing</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
