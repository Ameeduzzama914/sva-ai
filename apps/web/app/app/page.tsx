"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SaasDashboard } from "../../components/saas-dashboard";
import { getSession, logout, setSession } from "../../lib/client-auth";
import type { UserPlan } from "../../lib/server/store";

type MeResponse = { ok: boolean; user?: { email: string; plan: UserPlan; createdAt: string; emailVerified?: boolean } | null; verificationRequired?: boolean; email?: string };

export default function AppPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = getSession();
    const checkServerSession = async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" });
        const data = (await response.json()) as MeResponse;
        if (response.status === 403 || data.verificationRequired) {
          logout();
          const pendingEmail = data.email ?? session?.email ?? "";
          sessionStorage.setItem("sva_pending_verification_email", pendingEmail);
          router.replace(`/verify-email?email=${encodeURIComponent(pendingEmail)}`);
          return;
        }
        if (!response.ok || !data.user) {
          logout();
          router.replace("/login");
          return;
        }
        setSession({ email: data.user.email, plan: data.user.plan, createdAt: data.user.createdAt, planVerified: data.user.plan !== "free" });
        setReady(true);
      } catch {
        logout();
        router.replace("/login");
      }
    };

    void checkServerSession();
  }, [router]);

  if (!ready) return <main className="grid min-h-screen place-items-center bg-[#05070A] text-slate-300">Checking session...</main>;
  return <SaasDashboard />;
}
