"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SaasDashboard } from "../../components/saas-dashboard";
import { getSession } from "../../lib/client-auth";

export default function AppPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return <main className="grid min-h-screen place-items-center bg-[#070b14] text-slate-300">Checking session…</main>;
  return <SaasDashboard />;
}
