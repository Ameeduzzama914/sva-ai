"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  return <div className="min-h-screen bg-[#070b14] text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-10">
      <Card className="w-full max-w-md border-violet-500/30 bg-slate-950/80" title="Reset password" subtitle="Demo only — no email will be sent until production auth is connected.">
        <form className="space-y-3" onSubmit={(e)=>{e.preventDefault(); setMessage("Password reset email is not connected in this MVP. For demo testing, create a new account or use Google Demo login.");}}>
          <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" placeholder="Email" type="email" required />
          <Button variant="primary" className="w-full" type="submit">Demo reset info</Button>
        </form>
        {message ? <p className="mt-3 text-xs text-amber-300">{message}</p> : null}
        <p className="mt-4 text-xs text-slate-400"><Link href="/login" className="text-violet-300">Back to login</Link></p>
      </Card>
    </main></div>;
}
