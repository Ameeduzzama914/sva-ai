"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { PublicFooter } from "../../components/public-shell";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { clearPlanIntent, getPlanIntent, getSession, setSession, signupUser } from "../../lib/client-auth";
import type { UserPlan } from "../../lib/server/store";

type AuthResponse = {
  ok: boolean;
  message?: string;
  user?: { email: string; plan: UserPlan; createdAt: string };
};

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (getSession()) router.replace("/app");
  }, [router]);

  const finishAuth = (userEmail: string, plan: UserPlan, createdAt: string) => {
    const intent = getPlanIntent();
    setSession({ email: userEmail, plan, createdAt, planVerified: plan !== "free" });
    if (intent === "pro" || intent === "ultra") {
      clearPlanIntent();
      router.push("/billing");
      return;
    }
    clearPlanIntent();
    router.push("/app");
  };

  const submitSignup = async () => {
    if (!email) { setMessage("Email is required."); return; }
    if (password.length < 6) { setMessage("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setMessage("Password confirmation does not match."); return; }

    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });
      const data = (await response.json()) as AuthResponse;
      if (response.ok && data.ok && data.user) {
        finishAuth(data.user.email, data.user.plan, data.user.createdAt);
        return;
      }

      const local = signupUser(email, password);
      if (!local.ok) { setMessage(data.message ?? local.message ?? "Signup failed"); return; }
      finishAuth(email, "free", new Date().toISOString());
    } catch {
      const local = signupUser(email, password);
      if (!local.ok) { setMessage(local.message ?? "Signup failed"); return; }
      finishAuth(email, "free", new Date().toISOString());
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="sva-atmosphere min-h-screen text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-14"><Card className="w-full max-w-md border-emerald-300/15 bg-[#080b10]/90 p-6 sm:p-8" title="Create your SVA account" subtitle="Start with the free plan and upgrade anytime.">
      <form className="space-y-3" onSubmit={(e)=>{e.preventDefault(); void submitSignup();}}>
        <label className="block text-sm text-slate-300">Email<input className="sva-field mt-2" placeholder="you@example.com" autoComplete="email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></label>
        <label className="block text-sm text-slate-300">Password<input className="sva-field mt-2" placeholder="At least 6 characters" autoComplete="new-password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></label>
        <label className="block text-sm text-slate-300">Confirm password<input className="sva-field mt-2" placeholder="Repeat your password" autoComplete="new-password" type="password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} required /></label>
        <Button variant="primary" className="w-full" type="submit" disabled={submitting}>{submitting ? "Creating account..." : "Create account"}</Button>
        <Button className="w-full" type="button" onClick={()=>{finishAuth("demo.google@sva.app","free",new Date().toISOString());}}>Continue with Google (Demo)</Button>
      </form>{message ? <p className="mt-3 text-xs text-amber-300">{message}</p> : null}
      <p className="mt-4 text-xs text-slate-400">Already have an account? <Link href="/login" className="text-violet-300">Log in</Link></p>
    </Card></main><PublicFooter /></div>;
}
