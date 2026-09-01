"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { PublicFooter } from "../../components/public-shell";
import { GoogleAuthButton } from "../../components/google-auth-button";
import { Card } from "../../components/ui/card";
import { getSession } from "../../lib/client-auth";

export default function SignUpPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (getSession()) router.replace("/app");
  }, [router]);

  return <div className="sva-atmosphere min-h-screen text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-14"><Card className="w-full max-w-md border-emerald-300/15 bg-[#080b10]/90 p-6 sm:p-8" title="Create your SVA account" subtitle="Start securely with Google. Your Free plan is ready immediately.">
      <GoogleAuthButton onError={(error) => setMessage(error || null)} />
      {message ? <p className="mt-4 text-center text-xs text-amber-300">{message}</p> : <p className="mt-4 text-center text-xs text-slate-400">No password to remember. Google securely confirms your identity.</p>}
      <p className="mt-6 text-center text-xs text-slate-400">Already use SVA? <Link href="/login" className="text-violet-300">Log in</Link></p>
    </Card></main><PublicFooter /></div>;
}
