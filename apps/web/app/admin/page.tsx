"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminDashboard } from "../../components/admin/admin-dashboard";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { isAdminEmail } from "../../lib/admin";
import { getSession } from "../../lib/client-auth";

type AccessState = "loading" | "allowed" | "unauthorized";

export default function AdminPage() {
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>("loading");

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/app");
      return;
    }
    if (!isAdminEmail(session.email)) {
      setAccess("unauthorized");
      return;
    }
    setAccess("allowed");
  }, [router]);

  if (access === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#070b14] text-slate-300">
        Checking admin access…
      </main>
    );
  }

  if (access === "unauthorized") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#070b14] px-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-950/70 p-8 text-center shadow-[0_0_40px_rgba(15,23,42,0.6)] backdrop-blur-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-violet-300">SVA Admin</p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-50">Unauthorized</h1>
          <p className="mt-2 text-sm text-slate-400">You do not have permission to view this area.</p>
          <Button variant="primary" className="mt-6 w-full" onClick={() => router.replace("/app")}>
            Back to app
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.12),transparent_55%)]" />
      <header className="relative border-b border-slate-800/80 bg-slate-950/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-violet-300/90">SVA Trust Engine</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-50 sm:text-2xl">Founder Control Center</h1>
            <p className="mt-1 text-xs text-slate-400">Private admin — not linked in user navigation</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="violet">Admin</Badge>
            <Link href="/app">
              <Button variant="ghost" type="button">
                Exit admin
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <AdminDashboard />
      </main>
    </div>
  );
}
