"use client";

import { useState } from "react";
import { getSession, getSessionHeaders, setSession } from "../lib/client-auth";
import type { UserPlan } from "../lib/server/store";
import { Button } from "./ui/button";

type PaidPlan = "pro" | "ultra";

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { email?: string; name?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

type Props = {
  plan: PaidPlan;
  className?: string;
  label?: string;
  onSuccess?: (plan: UserPlan, message: string) => void;
  onFailure?: (message: string) => void;
};

const descriptions: Record<PaidPlan, string> = {
  pro: "SVA Pro - 50 verifications/day",
  ultra: "SVA Ultra - 150 verifications/day"
};

const loadRazorpayScript = async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  if (window.Razorpay) return true;

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const RazorpayCheckoutButton = ({ plan, className, label, onSuccess, onFailure }: Props) => {
  const [loading, setLoading] = useState(false);
  const session = getSession();

  const fail = (message: string) => {
    onFailure?.(message);
  };

  const startCheckout = async () => {
    if (!session) {
      fail("Please login first to upgrade your plan.");
      return;
    }

    setLoading(true);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        fail("Unable to load Razorpay checkout. Please try again.");
        return;
      }

      const orderResponse = await fetch("/api/payments/razorpay/create-order", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getSessionHeaders() },
        body: JSON.stringify({ plan })
      });
      const order = (await orderResponse.json()) as {
        ok?: boolean;
        message?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        key_id?: string;
        user?: { email?: string; name?: string };
      };

      if (!orderResponse.ok || !order.ok || !order.order_id || !order.key_id || !order.amount || !order.currency) {
        fail(order.message ?? "Unable to create payment order. Please try again.");
        return;
      }

      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "SVA",
        description: descriptions[plan],
        order_id: order.order_id,
        prefill: { email: order.user?.email ?? session.email, name: order.user?.name },
        notes: { plan, product: "SVA" },
        theme: { color: "#8b5cf6" },
        modal: {
          ondismiss: () => {
            setLoading(false);
            fail("Payment was not completed. No plan change was made.");
          }
        },
        handler: async (paymentResponse) => {
          try {
            const verifyResponse = await fetch("/api/payments/razorpay/verify", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json", ...getSessionHeaders() },
              body: JSON.stringify({ ...paymentResponse, plan })
            });
            const verified = (await verifyResponse.json()) as {
              ok?: boolean;
              message?: string;
              user?: { email: string; plan: UserPlan; createdAt: string };
            };

            if (!verifyResponse.ok || !verified.ok || !verified.user) {
              fail(verified.message ?? "Payment verification failed. No plan change was made.");
              return;
            }

            setSession({ email: verified.user.email, plan: verified.user.plan, createdAt: verified.user.createdAt });
            onSuccess?.(verified.user.plan, verified.message ?? `Payment successful. Your ${plan === "pro" ? "SVA Pro" : "SVA Ultra"} plan is now active.`);
          } catch {
            fail("Payment verification failed due to a network error. No plan change was made.");
          } finally {
            setLoading(false);
          }
        }
      });

      checkout.open();
    } catch {
      fail("Payment was not completed. No plan change was made.");
    } finally {
      if (!window.Razorpay) setLoading(false);
    }
  };

  return (
    <Button variant={plan === "pro" ? "primary" : "secondary"} className={className} onClick={() => void startCheckout()} disabled={loading}>
      {loading ? "Opening checkout..." : label ?? (plan === "pro" ? "Upgrade to Pro" : "Upgrade to Ultra")}
    </Button>
  );
};
