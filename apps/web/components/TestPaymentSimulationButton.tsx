"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSession, getSessionHeaders, setPlanIntent, setSession } from "../lib/client-auth";
import type { UserPlan } from "../lib/server/store";
import { Button } from "./ui/button";

type PaidPlan = "pro" | "ultra";

type Props = {
  plan: PaidPlan;
  className?: string;
  onSuccess?: (plan: UserPlan, message: string) => void;
  onFailure?: (message: string) => void;
};

const testPaymentsVisible = (): boolean => {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_PAYMENTS === "true";
};

export const TestPaymentSimulationButton = ({ plan, className, onSuccess, onFailure }: Props) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!testPaymentsVisible()) return null;

  const simulatePayment = async () => {
    const activeSession = getSession();
    if (!activeSession) {
      setPlanIntent(plan);
      router.push("/signup");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/payments/razorpay/simulate-success", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getSessionHeaders() },
        body: JSON.stringify({ plan })
      });
      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        user?: { email: string; plan: UserPlan; createdAt: string };
      };

      if (!response.ok || !result.ok || !result.user) {
        onFailure?.(result.message ?? "Payment verification failed. No plan change was made.");
        return;
      }

      setSession({
        email: result.user.email,
        plan: result.user.plan,
        createdAt: result.user.createdAt,
        planVerified: result.user.plan !== "free"
      });
      onSuccess?.(result.user.plan, result.message ?? `Simulated payment verified. Your ${plan === "pro" ? "SVA Pro" : "SVA Ultra"} plan is now active.`);
    } catch {
      onFailure?.("Payment verification failed due to a network error. No plan change was made.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="secondary" className={className} onClick={() => void simulatePayment()} disabled={loading}>
      {loading ? "Simulating payment..." : "Simulate Successful Test Payment"}
    </Button>
  );
};
