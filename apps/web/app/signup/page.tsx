"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { getPlanIntent, setSession, signupUser } from "../../lib/client-auth";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return <div className="min-h-screen bg-[#070b14] text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-10"><Card className="w-full max-w-md border-violet-500/30 bg-slate-950/80" title="Create your SVA account" subtitle="Start with the free plan and upgrade anytime.">
      <form className="space-y-3" onSubmit={(e)=>{e.preventDefault(); if(!email){setMessage("Email is required."); return;} if(password.length < 6){setMessage("Password must be at least 6 characters."); return;} if(password!==confirmPassword){setMessage("Password confirmation does not match."); return;} const r=signupUser(email,password); if(!r.ok){setMessage(r.message??'Signup failed'); return;} const plan=getPlanIntent()??'free'; setSession({email,plan,createdAt:new Date().toISOString()}); setMessage(plan==='free'?null:'Billing coming soon — your plan selection has been saved.'); setTimeout(()=>router.push('/app'),300);}}>
        <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" placeholder="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" placeholder="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
        <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" placeholder="Confirm password" type="password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} required />
        <Button variant="primary" className="w-full" type="submit">Create account</Button>
        <Button className="w-full" type="button" onClick={()=>{setSession({email:"demo.google@sva.app",plan:"free",createdAt:new Date().toISOString()}); router.push("/app");}}>Continue with Google (Demo)</Button>
      </form>{message ? <p className="mt-3 text-xs text-amber-300">{message}</p> : null}
      <p className="mt-4 text-xs text-slate-400">Already have an account? <Link href="/login" className="text-violet-300">Log in</Link></p>
    </Card></main></div>;
}
