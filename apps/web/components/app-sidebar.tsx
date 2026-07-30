"use client";

import Link from "next/link";
import { Badge } from "./ui/badge";
import { getSession } from "../lib/client-auth";
import type { UserPlan } from "../lib/server/store";

const sectionClass = "space-y-1";
const itemClass = "block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800";
const ctaClass = "mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-emerald-200/60 bg-emerald-300 px-4 py-2 text-sm font-semibold text-[#042016] transition hover:bg-emerald-200";

const planMeta: Record<UserPlan, { label: string; limit: number; accent: string; cta: string }> = {
  free: { label: "Free Beta", limit: 10, accent: "text-slate-100", cta: "Upgrade Plan" },
  pro: { label: "Pro", limit: 50, accent: "text-emerald-100", cta: "Upgrade to Ultra" },
  ultra: { label: "Ultra", limit: 150, accent: "text-cyan-100", cta: "View Billing" }
};

type AppSidebarProps = {
  contradictionCount?: number;
  isLoggedIn?: boolean;
  onLogout?: () => void;
  remainingToday?: number;
  plan?: UserPlan;
};

export const AppSidebar = ({ contradictionCount = 0, isLoggedIn = false, onLogout, remainingToday, plan }: AppSidebarProps) => {
  const sessionPlan = getSession()?.plan;
  const effectivePlan = plan ?? sessionPlan ?? "free";
  const currentPlan = planMeta[effectivePlan];
  const remaining = remainingToday ?? currentPlan.limit;

  return (
    <aside className="hidden min-h-screen w-[260px] shrink-0 border-r border-slate-800 bg-[#0b1020] p-4 lg:block">
      <div className="mb-8">
        <Link href="/" aria-label="Go to SVA home" className="flex items-center gap-3 rounded-xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 text-sm font-bold tracking-tight text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.12)]">SVA</span>
          <span><span className="block text-xl font-bold tracking-tight text-white">SVA</span><span className="mt-0.5 block text-xs leading-snug text-slate-400">Super Verified AI</span></span>
        </Link>
      </div>
      <div className="space-y-6">
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ask & Verify</p><div className={sectionClass}><Link href="/app" className={`${itemClass} border border-emerald-300/25 bg-emerald-300/10 text-emerald-100`}>New Query</Link><Link href="/app" className={itemClass}>Dashboard</Link></div></div>
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Verify</p><div className={sectionClass}><button className={itemClass}>Multi-AI Comparison</button><button className={itemClass}>Claim Verification</button><button className={`${itemClass} flex items-center justify-between`}>Contradictions {contradictionCount > 0 ? <Badge variant="danger" className="text-xs">{contradictionCount}</Badge> : null}</button></div></div>
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Account</p><div className={sectionClass}><Link href="/billing" className={itemClass}>Usage & Plan</Link>{isLoggedIn && onLogout ? <button className={itemClass} type="button" onClick={onLogout}>Logout</button> : null}</div></div>
      </div>
      <div className="mt-8 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.055] p-4 shadow-lg shadow-black/20">
        <p className={`text-sm font-semibold ${currentPlan.accent}`}>{currentPlan.label} Plan</p>
        <p className="mt-2 text-xs leading-5 text-slate-300">{remaining} of {currentPlan.limit} verifications remaining today</p>
        <Link href={effectivePlan === "ultra" ? "/billing" : "/pricing"} className={ctaClass}>{currentPlan.cta}</Link>
      </div>
    </aside>
  );
};
