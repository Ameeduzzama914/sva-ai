"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { PublicFooter } from "../../components/public-shell";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  return <div className="sva-atmosphere min-h-screen text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-14">
      <Card className="w-full max-w-md border-emerald-300/15 bg-[#080b10]/90 p-6 sm:p-8" title="Reset password" subtitle="Demo only — no email will be sent until production auth is connected.">
        <form className="space-y-3" onSubmit={(e)=>{e.preventDefault(); setMessage("Password reset email is not connected in this Beta. For demo testing, create a new account or use Google Demo login.");}}>
          <label className="block text-sm text-slate-300">Email<input className="sva-field mt-2" placeholder="you@example.com" autoComplete="email" type="email" required /></label>
          <Button variant="primary" className="w-full" type="submit">Show demo reset info</Button>
        </form>
        {message ? <p className="mt-3 text-xs text-amber-300">{message}</p> : null}
        <p className="mt-4 text-xs text-slate-400"><Link href="/login" className="text-violet-300">Back to login</Link></p>
      </Card>
    </main><PublicFooter /></div>;
}
