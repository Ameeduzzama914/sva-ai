import crypto from "crypto";
import { SVA_PLANS } from "../plans";

export type PaidPlan = "pro" | "ultra";

export const RAZORPAY_PLAN_PRICES: Record<PaidPlan, { amount: number; label: string; dailyLimit: number }> = {
  pro: { amount: SVA_PLANS.pro.razorpayAmountPaise, label: "SVA Pro", dailyLimit: SVA_PLANS.pro.dailyVerificationLimit },
  ultra: { amount: SVA_PLANS.ultra.razorpayAmountPaise, label: "SVA Ultra", dailyLimit: SVA_PLANS.ultra.dailyVerificationLimit }
};

export const isPaidPlan = (value: unknown): value is PaidPlan => value === "pro" || value === "ultra";

export const getRazorpayConfig = (): { keyId: string; keySecret: string } | null => {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
};

export const missingRazorpayKeysMessage =
  "Razorpay keys are missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to apps/web/.env.local.";

export const verifyRazorpaySignature = (input: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean => {
  const expected = crypto
    .createHmac("sha256", input.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");

  const actual = input.signature.trim();
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
};
