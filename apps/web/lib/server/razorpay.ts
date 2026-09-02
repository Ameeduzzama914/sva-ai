import crypto from "crypto";
import { SVA_PLANS } from "../plans";

export type PaidPlan = "pro" | "ultra";
export type RazorpayPricingContext = "standard" | "controlled_live_test_v1";

export const CONTROLLED_LIVE_TEST_PRICING_CONTEXT = "controlled_live_test_v1" as const;
export const CONTROLLED_LIVE_TEST_AMOUNTS: Record<PaidPlan, number> = { pro: 100, ultra: 200 };

export const RAZORPAY_PLAN_PRICES: Record<PaidPlan, { amount: number; label: string; dailyLimit: number }> = {
  pro: { amount: SVA_PLANS.pro.razorpayAmountPaise, label: "SVA Pro", dailyLimit: SVA_PLANS.pro.dailyVerificationLimit },
  ultra: { amount: SVA_PLANS.ultra.razorpayAmountPaise, label: "SVA Ultra", dailyLimit: SVA_PLANS.ultra.dailyVerificationLimit }
};

export const isPaidPlan = (value: unknown): value is PaidPlan => value === "pro" || value === "ultra";

const normalizedEmail = (value: unknown): string => (typeof value === "string" ? value.trim().toLowerCase() : "");
const noteValue = (notes: Record<string, unknown> | undefined, key: string): string => {
  const value = notes?.[key];
  return typeof value === "string" ? value.trim() : "";
};

export const isControlledLiveTestPricingEligible = (email: string, nowMs = Date.now()): boolean => {
  if (process.env.RAZORPAY_CONTROLLED_LIVE_TEST_ENABLED?.trim().toLowerCase() !== "true") return false;
  const allowlistedEmail = normalizedEmail(process.env.RAZORPAY_CONTROLLED_LIVE_TEST_EMAIL);
  if (!allowlistedEmail || normalizedEmail(email) !== allowlistedEmail) return false;
  const expiresAt = process.env.RAZORPAY_CONTROLLED_LIVE_TEST_EXPIRES_AT?.trim();
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
};

export const resolveRazorpayPriceForUser = (plan: PaidPlan, email: string, nowMs = Date.now()): {
  amount: number;
  label: string;
  dailyLimit: number;
  pricingContext: RazorpayPricingContext;
} => {
  const standard = RAZORPAY_PLAN_PRICES[plan];
  if (!isControlledLiveTestPricingEligible(email, nowMs)) return { ...standard, pricingContext: "standard" };
  return { ...standard, amount: CONTROLLED_LIVE_TEST_AMOUNTS[plan], pricingContext: CONTROLLED_LIVE_TEST_PRICING_CONTEXT };
};

export const validateRazorpayOrderPricing = (input: {
  plan: PaidPlan;
  authenticatedUserId: string;
  authenticatedEmail: string;
  amount: unknown;
  currency: unknown;
  notes?: Record<string, unknown>;
  nowMs?: number;
}): { ok: true; amount: number; pricingContext: RazorpayPricingContext } | { ok: false } => {
  const notePlan = noteValue(input.notes, "plan");
  const noteUserId = noteValue(input.notes, "user_id");
  const noteEmail = normalizedEmail(noteValue(input.notes, "user_email"));
  const pricingContext = noteValue(input.notes, "pricing_context");
  if (notePlan !== input.plan || noteUserId !== input.authenticatedUserId || noteEmail !== normalizedEmail(input.authenticatedEmail) || input.currency !== "INR") {
    return { ok: false };
  }

  if (pricingContext === CONTROLLED_LIVE_TEST_PRICING_CONTEXT) {
    if (!isControlledLiveTestPricingEligible(input.authenticatedEmail, input.nowMs)) return { ok: false };
    return input.amount === CONTROLLED_LIVE_TEST_AMOUNTS[input.plan]
      ? { ok: true, amount: CONTROLLED_LIVE_TEST_AMOUNTS[input.plan], pricingContext: CONTROLLED_LIVE_TEST_PRICING_CONTEXT }
      : { ok: false };
  }

  if (pricingContext && pricingContext !== "standard") return { ok: false };
  return input.amount === RAZORPAY_PLAN_PRICES[input.plan].amount
    ? { ok: true, amount: RAZORPAY_PLAN_PRICES[input.plan].amount, pricingContext: "standard" }
    : { ok: false };
};

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
