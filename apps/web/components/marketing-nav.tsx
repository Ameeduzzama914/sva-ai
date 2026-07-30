"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, logout } from "../lib/client-auth";

const actionClass = "inline-flex min-h-10 items-center justify-center rounded-xl border px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50";

export const MarketingNav = () => {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => setIsLoggedIn(Boolean(getSession())), []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#05070a]/88 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Go to SVA home" className="flex min-w-0 items-center gap-2.5 rounded-xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 text-xs font-bold text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.10)]">SVA</span>
          <span><span className="block text-base font-semibold tracking-tight text-white">SVA</span><span className="hidden text-[10px] text-slate-500 sm:block">Super Verified AI</span></span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          {isLoggedIn ? <Link href="/app" className="hover:text-white">Dashboard</Link> : null}
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {isLoggedIn ? (
            <>
              <Link href="/app" className={`${actionClass} border-emerald-200/60 bg-emerald-300 text-[#042016] hover:bg-emerald-200`}>Open Dashboard</Link>
              <button type="button" className={`${actionClass} hidden border-white/[0.09] text-slate-300 hover:bg-white/[0.05] sm:inline-flex`} onClick={() => { logout(); setIsLoggedIn(false); router.push("/login"); }}>Logout</button>
            </>
          ) : (
            <>
              <Link href="/login" className={`${actionClass} border-white/[0.09] text-slate-200 hover:bg-white/[0.05]`}>Login</Link>
              <Link href="/signup" className={`${actionClass} border-emerald-200/60 bg-emerald-300 text-[#042016] hover:bg-emerald-200`}>Sign Up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
