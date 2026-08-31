"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { PublicFooter } from "../../components/public-shell";
import { GoogleAuthButton } from "../../components/google-auth-button";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { getSession } from "../../lib/client-auth";

type AuthResponse = { ok: boolean; message?: string; verificationRequired?: boolean; email?: string };

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

  const submitSignup = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) { setMessage("Email is required."); return; }
    if (password.length < 6) { setMessage("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setMessage("Password confirmation does not match."); return; }

    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: normalizedEmail, password })
      });
      const data = (await response.json()) as AuthResponse;
      if (response.ok && data.ok && data.verificationRequired) {
        const pendingEmail = data.email ?? normalizedEmail;
        sessionStorage.setItem("sva_pending_verification_email", pendingEmail);
        router.push(`/verify-email?email=${encodeURIComponent(pendingEmail)}`);
        return;
      }
      setMessage(data.message ?? "Signup failed. Please try again.");
    } catch {
      setMessage("Signup is temporarily unavailable. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="sva-atmosphere min-h-screen text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-14"><Card className="w-full max-w-md border-emerald-300/15 bg-[#080b10]/90 p-6 sm:p-8" title="Create your SVA account" subtitle="Start with the free plan and upgrade anytime.">
      <GoogleAuthButton onError={(error) => setMessage(error || null)} />
      <div className="my-5 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10" /><span>or sign up with email</span><span className="h-px flex-1 bg-white/10" /></div>
      <form className="space-y-3" onSubmit={(event)=>{event.preventDefault(); void submitSignup();}}>
        <label className="block text-sm text-slate-300">Email<input className="sva-field mt-2" placeholder="you@example.com" autoComplete="email" type="email" value={email} onChange={(event)=>setEmail(event.target.value)} required /></label>
        <label className="block text-sm text-slate-300">Password<input className="sva-field mt-2" placeholder="At least 6 characters" autoComplete="new-password" type="password" value={password} onChange={(event)=>setPassword(event.target.value)} required /></label>
        <label className="block text-sm text-slate-300">Confirm password<input className="sva-field mt-2" placeholder="Repeat your password" autoComplete="new-password" type="password" value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} required /></label>
        <Button variant="primary" className="w-full" type="submit" disabled={submitting}>{submitting ? "Creating account..." : "Create account"}</Button>
      </form>{message ? <p className="mt-3 text-xs text-amber-300">{message}</p> : null}
      <p className="mt-4 text-xs text-slate-400">Already have an account? <Link href="/login" className="text-violet-300">Log in</Link></p>
    </Card></main><PublicFooter /></div>;
}
