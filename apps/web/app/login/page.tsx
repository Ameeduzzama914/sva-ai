"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { loginUser, setSession } from "../../lib/client-auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return <div className="min-h-screen bg-[#070b14] text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-10"><Card className="w-full max-w-md border-violet-500/30 bg-slate-950/80" title="Welcome back" subtitle="Log in to continue verifying with SVA.">
      <form className="space-y-3" onSubmit={(e)=>{e.preventDefault(); if(!email || !password){setMessage("Email and password are required."); return;} const r=loginUser(email,password); if(!r.ok){setMessage(r.message??"Login failed");return;} setSession({email,plan:r.plan??"free",createdAt:new Date().toISOString()}); router.push('/app');}}>
        <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" placeholder="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" placeholder="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
        <Button variant="primary" className="w-full" type="submit">Log in</Button>
        <Button className="w-full" type="button" onClick={()=>{setSession({email:'demo.google@sva.app',plan:'free',createdAt:new Date().toISOString()}); router.push('/app');}}>Continue with Google (Demo)</Button>
      </form>{message ? <p className="mt-3 text-xs text-amber-300">{message}</p> : <p className="mt-3 text-xs text-emerald-300">Use your demo account or Google Demo login.</p>}
      <p className="mt-4 text-xs text-slate-400"><Link href="/forgot-password" className="text-violet-300">Forgot password?</Link> · New here? <Link href="/signup" className="text-violet-300">Create account</Link></p>
    </Card></main></div>;
}
