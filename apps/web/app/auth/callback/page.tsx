"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MarketingNav } from "../../../components/marketing-nav";
import { PublicFooter } from "../../../components/public-shell";
import { Card } from "../../../components/ui/card";
import { clearPlanIntent, getPlanIntent, setSession } from "../../../lib/client-auth";
import { getSupabaseBrowserClient } from "../../../lib/supabase-browser";
import type { UserPlan } from "../../../lib/server/store";

type SessionResponse = { ok: boolean; message?: string; user?: { email: string; plan: UserPlan; createdAt: string } };

export default function OAuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing Google sign-in...");

  useEffect(() => {
    let active = true;

    const completeOAuth = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Authentication is temporarily unavailable.");

      const code = new URLSearchParams(window.location.search).get("code");
      const result = code ? await supabase.auth.exchangeCodeForSession(code) : await supabase.auth.getSession();
      if (result.error || !result.data.session?.access_token) throw new Error("Google authentication could not be verified.");

      const response = await fetch("/api/auth/oauth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accessToken: result.data.session.access_token })
      });
      const data = (await response.json()) as SessionResponse;
      if (!response.ok || !data.ok || !data.user) throw new Error(data.message ?? "Unable to open your SVA account.");

      setSession({
        email: data.user.email,
        plan: data.user.plan,
        createdAt: data.user.createdAt,
        planVerified: data.user.plan !== "free"
      });

      const intent = getPlanIntent();
      clearPlanIntent();
      router.replace(intent === "pro" || intent === "ultra" ? "/billing" : "/app");
    };

    void completeOAuth().catch((error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : "Google sign-in failed. Please return to login and try again.");
    });

    return () => { active = false; };
  }, [router]);

  return <div className="sva-atmosphere min-h-screen text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-14"><Card className="w-full max-w-md border-emerald-300/15 bg-[#080b10]/90 p-6 text-center sm:p-8" title="Signing you in" subtitle={message} /></main>
    <PublicFooter />
  </div>;
}
