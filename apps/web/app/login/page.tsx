"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { PublicFooter } from "../../components/public-shell";
import { GoogleAuthButton } from "../../components/google-auth-button";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { clearPlanIntent, getPlanIntent, getSession, loginUser, setSession } from "../../lib/client-auth";
import type { UserPlan } from "../../lib/server/store";

type AuthResponse = { ok: boolean; message?: string; verificationRequired?: boolean; email?: string; user?: { email: string; plan: UserPlan; createdAt: string } };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const submitLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) { setMessage("Email and password are required."); return; }
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: normalizedEmail, password })
      });
      const data = (await response.json()) as AuthResponse;
      if (response.ok && data.ok && data.user) {
        finishAuth(data.user.email, data.user.plan, data.user.createdAt);
        return;
      }
      if (data.verificationRequired) {
        const pendingEmail = data.email ?? normalizedEmail;
        sessionStorage.setItem("sva_pending_verification_email", pendingEmail);
        router.push(`/verify-email?email=${encodeURIComponent(pendingEmail)}`);
        return;
      }

      const local = loginUser(normalizedEmail, password);
      if (!local.ok) { setMessage(data.message ?? local.message ?? "Login failed"); return; }
      finishAuth(normalizedEmail, local.plan ?? "free", new Date().toISOString());
    } catch {
      const local = loginUser(normalizedEmail, password);
      if (!local.ok) { setMessage(local.message ?? "Login failed"); return; }
      finishAuth(normalizedEmail, local.plan ?? "free", new Date().toISOString());
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="sva-atmosphere min-h-screen text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-14"><Card className="w-full max-w-md border-emerald-300/15 bg-[#080b10]/90 p-6 sm:p-8" title="Welcome back" subtitle="Log in to continue verifying with SVA.">
      <GoogleAuthButton onError={(error) => setMessage(error || null)} />
      <div className="my-5 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10" /><span>or continue with email</span><span className="h-px flex-1 bg-white/10" /></div>
      <form className="space-y-3" onSubmit={(event)=>{event.preventDefault(); void submitLogin();}}>
        <label className="block text-sm text-slate-300">Email<input className="sva-field mt-2" placeholder="you@example.com" autoComplete="email" type="email" value={email} onChange={(event)=>setEmail(event.target.value)} required /></label>
        <label className="block text-sm text-slate-300">Password<input className="sva-field mt-2" placeholder="Enter your password" autoComplete="current-password" type="password" value={password} onChange={(event)=>setPassword(event.target.value)} required /></label>
        <Button variant="primary" className="w-full" type="submit" disabled={submitting}>{submitting ? "Logging in..." : "Log in"}</Button>
      </form>{message ? <p className="mt-3 text-xs text-amber-300">{message}</p> : <p className="mt-3 text-xs text-emerald-300">Use your email and password to continue.</p>}
      <p className="mt-4 text-xs text-slate-400"><Link href="/forgot-password" className="text-violet-300">Forgot password?</Link> · New here? <Link href="/signup" className="text-violet-300">Create account</Link></p>
    </Card></main><PublicFooter /></div>;
}
