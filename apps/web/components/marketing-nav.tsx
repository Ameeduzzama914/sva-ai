"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession } from "../lib/client-auth";

const actionClass = "inline-flex items-center justify-center rounded-xl border px-3 py-1.5 text-sm font-medium transition";

export const MarketingNav = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => setIsLoggedIn(Boolean(getSession())), []);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#090d18]/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="text-base font-semibold tracking-tight text-white">SVA</Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href={isLoggedIn ? "/app" : "/login"} className="hover:text-white">Dashboard</Link>
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className={`${actionClass} border-slate-700 text-slate-200 hover:bg-slate-800`}>Log in</Link>
          <Link href="/signup" className={`${actionClass} border-violet-400 bg-violet-500 text-white hover:bg-violet-400`}>Start free</Link>
        </div>
      </div>
    </header>
  );
};
