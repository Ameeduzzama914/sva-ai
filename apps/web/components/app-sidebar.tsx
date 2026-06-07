"use client";

import Link from "next/link";
import { Badge } from "./ui/badge";
import { getSession } from "../lib/client-auth";
import type { UserPlan } from "../lib/server/store";

const sectionClass = "space-y-1";
const itemClass = "block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800";
const ctaClass = "mt-3 inline-flex w-full items-center justify-center rounded-xl border border-violet-400 bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400";

const planMeta: Record<UserPlan, { label: string; limit: number; accent: string; cta: string }> = {
  free: { label: "Free Beta", limit: 10, accent: "text-slate-100", cta: "Upgrade Plan" },
  pro: { label: "Pro", limit: 50, accent: "text-violet-100", cta: "Upgrade to Ultra" },
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
        <Link href="/" className="flex items-center gap-3 transition hover:opacity-90">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/40 bg-gradient-to-br from-violet-600/35 to-cyan-500/15 text-sm font-bold tracking-tight text-violet-100 shadow-[0_0_20px_rgba(139,92,246,0.2)]">SVA</span>
          <span><span className="block text-xl font-bold tracking-tight text-white">SVA</span><span className="mt-0.5 block text-xs leading-snug text-slate-400">Super Verified AI</span></span>
        </Link>
      </div>
      <div className="space-y-6">
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ask & Verify</p><div className={sectionClass}><Link href="/app" className={`${itemClass} border border-violet-500/40 bg-violet-500/15 text-violet-200`}>New Query</Link><Link href="/app" className={itemClass}>Dashboard</Link></div></div>
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Verify</p><div className={sectionClass}><button className={itemClass}>Multi-AI Comparison</button><button className={itemClass}>Claim Verification</button><button className={`${itemClass} flex items-center justify-between`}>Contradictions {contradictionCount > 0 ? <Badge variant="danger" className="text-xs">{contradictionCount}</Badge> : null}</button></div></div>
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Account</p><div className={sectionClass}><Link href="/billing" className={itemClass}>Usage & Plan</Link>{isLoggedIn && onLogout ? <button className={itemClass} type="button" onClick={onLogout}>Logout</button> : null}</div></div>
      </div>
      <div className="mt-8 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-blue-500/10 p-4 shadow-lg shadow-black/20">
        <p className={`text-sm font-semibold ${currentPlan.accent}`}>{currentPlan.label} Plan</p>
        <p className="mt-2 text-xs leading-5 text-slate-300">{remaining} of {currentPlan.limit} verifications remaining today</p>
        <Link href="/billing" className={ctaClass}>{currentPlan.cta}</Link>
      </div>
    </aside>
  );
};
