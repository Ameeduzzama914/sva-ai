import Link from "next/link";
import { Badge } from "./ui/badge";

const sectionClass = "space-y-1";
const itemClass = "block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800";
const ctaClass = "mt-3 inline-flex w-full items-center justify-center rounded-xl border border-violet-400 bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400";

type AppSidebarProps = {
  contradictionCount?: number;
  isLoggedIn?: boolean;
  onLogout?: () => void;
  remainingToday?: number;
};

export const AppSidebar = ({ contradictionCount = 0, isLoggedIn = false, onLogout, remainingToday = 10 }: AppSidebarProps) => {
  return (
    <aside className="hidden w-[260px] border-r border-slate-800 bg-[#0b1020] p-4 lg:block">
      <div className="mb-8">
        <Link href="/" className="flex items-center gap-3 transition hover:opacity-90">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/40 bg-gradient-to-br from-violet-600/35 to-cyan-500/15 text-sm font-bold tracking-tight text-violet-100 shadow-[0_0_20px_rgba(139,92,246,0.2)]">
            SVA
          </span>
          <span>
            <span className="block text-xl font-bold tracking-tight text-white">SVA</span>
            <span className="mt-0.5 block text-xs leading-snug text-slate-400">Super Verified AI</span>
          </span>
        </Link>
      </div>
      <div className="space-y-6">
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ask & Verify</p><div className={sectionClass}><Link href="/app" className={`${itemClass} border border-violet-500/40 bg-violet-500/15 text-violet-200`}>New Query</Link><Link href="/app" className={itemClass}>Dashboard</Link></div></div>
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Verify</p><div className={sectionClass}><button className={itemClass}>Multi-AI Comparison</button><button className={itemClass}>Claim Verification</button><button className={`${itemClass} flex items-center justify-between`}>Contradictions {contradictionCount > 0 ? <Badge variant="danger" className="text-xs">{contradictionCount}</Badge> : null}</button></div></div>
        <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Account</p><div className={sectionClass}><Link href="/pricing" className={itemClass}>Usage & Plan</Link></div></div>
      </div>
      <div className="mt-8 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-blue-500/10 p-4"><p className="text-sm font-semibold text-slate-100">Free Beta Plan</p><p className="mt-2 text-xs text-slate-300">{remainingToday} verifications remaining today</p><Link href="/pricing" className={ctaClass}>Upgrade Plan</Link></div>
    </aside>
  );
};
