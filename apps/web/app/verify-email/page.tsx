"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { MarketingNav } from "../../components/marketing-nav";
import { PublicFooter } from "../../components/public-shell";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { clearPlanIntent, getPlanIntent, setSession } from "../../lib/client-auth";
import type { UserPlan } from "../../lib/server/store";

type VerifyResponse = { ok: boolean; message?: string; user?: { email: string; plan: UserPlan; createdAt: string } };

const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
};

const VerificationInner = () => {
  const router = useRouter();
  const params = useSearchParams();
  const initialEmail = params.get("email") ?? (typeof window !== "undefined" ? sessionStorage.getItem("sva_pending_verification_email") ?? "" : "");
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(45);
  const maskedEmail = useMemo(() => maskEmail(email), [email]);

  useEffect(() => {
    if (email) sessionStorage.setItem("sva_pending_verification_email", email);
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const finish = (user: NonNullable<VerifyResponse["user"]>) => {
    const intent = getPlanIntent();
    setSession({ email: user.email, plan: user.plan, createdAt: user.createdAt, planVerified: user.plan !== "free" });
    sessionStorage.removeItem("sva_pending_verification_email");
    setSuccess(true);
    window.setTimeout(() => {
      if (intent === "pro" || intent === "ultra") {
        clearPlanIntent();
        router.replace("/billing");
        return;
      }
      clearPlanIntent();
      router.replace("/app");
    }, 650);
  };

  const verify = async () => {
    const code = otp.replace(/\D/g, "");
    if (!email || code.length !== 6) { setMessage("Enter the 6-digit verification code."); return; }
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email, otp: code }) });
      const data = (await response.json()) as VerifyResponse;
      if (response.ok && data.ok && data.user) { finish(data.user); return; }
      setMessage(data.message ?? "That code is invalid or expired. Request a new code and try again.");
    } catch {
      setMessage("Unable to verify right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!email || cooldown > 0) return;
    setResending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/resend-email-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = (await response.json()) as { ok: boolean; message?: string };
      setMessage(data.message ?? (response.ok ? "A new code has been sent." : "Please wait before requesting another code."));
      setCooldown(45);
    } catch {
      setMessage("Unable to resend right now. Please try again later.");
    } finally {
      setResending(false);
    }
  };

  return <div className="sva-atmosphere min-h-screen text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-14">
      <Card className="w-full max-w-md border-emerald-300/15 bg-[#080b10]/90 p-6 sm:p-8" title="Verify your email" subtitle={email ? `Enter the 6-digit code sent to ${maskedEmail}.` : "Enter the email you used to create your SVA account."}>
        <div className="space-y-4">
          <label className="block text-sm text-slate-300">Email
            <input className="sva-field mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value.trim().toLowerCase())} autoComplete="email" />
          </label>
          <label className="block text-sm text-slate-300">Verification code
            <input className="sva-field mt-2 text-center text-xl tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} onPaste={(event) => { event.preventDefault(); setOtp(event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)); }} />
          </label>
          <Button variant="primary" className="w-full" type="button" disabled={loading || success} onClick={() => void verify()}>{success ? "Verified" : loading ? "Verifying..." : "Verify email"}</Button>
          <Button className="w-full" type="button" disabled={resending || cooldown > 0 || !email} onClick={() => void resend()}>{cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? "Sending..." : "Resend code"}</Button>
          {message ? <p className={`text-xs ${success ? "text-emerald-300" : "text-amber-300"}`}>{message}</p> : null}
          <p className="text-xs text-slate-400">Wrong email? <Link href="/signup" className="text-violet-300">Go back and correct it</Link>.</p>
        </div>
      </Card>
    </main><PublicFooter /></div>;
};

export default function VerifyEmailPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#05070A] text-slate-300">Loading verification...</main>}><VerificationInner /></Suspense>;
}
