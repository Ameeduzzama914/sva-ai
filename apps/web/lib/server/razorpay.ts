import crypto from "crypto";

export type PaidPlan = "pro" | "ultra";

// TEMPORARY LIVE PAYMENT TESTING PRICES
// TODO: Revert Pro→499 and Ultra→999 after successful payment verification
export const RAZORPAY_PLAN_PRICES: Record<PaidPlan, { amount: number; label: string; dailyLimit: number }> = {
  pro: { amount: 100, label: "SVA Pro", dailyLimit: 50 },
  ultra: { amount: 200, label: "SVA Ultra", dailyLimit: 150 }
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
