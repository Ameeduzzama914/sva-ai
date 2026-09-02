import { getSvaPlan } from "../plans";
import { hasSuccessfulPaymentRecord, insertPaymentRecord } from "./payments";
import type { PaidPlan } from "./razorpay";
import { fetchPublicUserByEmailFromSupabase, isSupabaseAdminConfigured } from "./supabase-admin";
import { updateSupabasePaidPlanByEmail } from "./supabase-plan";
import { getUserByEmail, toPublicUser, trackEvent, upgradeUserPlan, type PublicUser } from "./store";

type PaymentActivationInput = {
  user: PublicUser;
  plan: PaidPlan;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  paymentAmountPaise: number;
  paymentProvider: string;
  paymentSource: string;
};

type PaymentActivationResult =
  | { ok: true; user: PublicUser; message: string }
  | { ok: false; status: number; message: string };

const paymentSuccessMessage = (plan: PaidPlan): string =>
  `Payment successful. Your ${plan === "pro" ? "SVA Pro" : "SVA Ultra"} plan is now active.`;

const verifiedLocalPaymentUser = (user: PublicUser, plan: PaidPlan): PublicUser => {
  const dailyLimit = getSvaPlan(plan).dailyVerificationLimit;
  return {
    ...user,
    plan,
    dailyLimit,
    creditsRemaining: dailyLimit,
    usedToday: 0,
    dailyUsage: 0,
    monthlyUsage: 0
  };
};

export const activatePaidPlanAfterPayment = async ({
  user,
  plan,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  paymentAmountPaise,
  paymentProvider,
  paymentSource
}: PaymentActivationInput): Promise<PaymentActivationResult> => {
  const duplicatePayment = await hasSuccessfulPaymentRecord(razorpayPaymentId);
  if (duplicatePayment) {
    const supabaseUser = await fetchPublicUserByEmailFromSupabase(user.email);
    if (supabaseUser?.plan === plan) {
      return { ok: true, user: supabaseUser, message: paymentSuccessMessage(plan) };
    }
    if (isSupabaseAdminConfigured()) {
      console.warn("[payment-upgrade] valid payment is missing its durable entitlement; retrying activation.", {
        razorpayPaymentId,
        requestedPlan: plan,
        currentPlan: supabaseUser?.plan ?? "missing"
      });
      const reconciledUser = await updateSupabasePaidPlanByEmail(user.email, plan);
      if (reconciledUser?.plan === plan) {
        return { ok: true, user: reconciledUser, message: paymentSuccessMessage(plan) };
      }
      console.error("[payment-upgrade] duplicate payment entitlement reconciliation failed.", {
        razorpayPaymentId,
        requestedPlan: plan
      });
      return { ok: false, status: 500, message: "Payment is verified, but plan activation is pending. Contact support; do not pay again." };
    }
    const localUser = await getUserByEmail(user.email);
    if (localUser) {
      return { ok: true, user: toPublicUser(localUser), message: paymentSuccessMessage(plan) };
    }
    return { ok: true, user: verifiedLocalPaymentUser(user, plan), message: paymentSuccessMessage(plan) };
  }
  const supabaseUser = await updateSupabasePaidPlanByEmail(user.email, plan);
  if (supabaseUser?.plan === plan) {
    await insertPaymentRecord({
      userId: supabaseUser.userId,
      email: supabaseUser.email,
      plan,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amountPaise: paymentAmountPaise,
      status: "success",
      provider: paymentProvider,
      source: paymentSource
    });
    await trackEvent("upgraded_to_pro", supabaseUser.userId, { plan, paymentProvider, paymentSource });
    return { ok: true, user: supabaseUser, message: paymentSuccessMessage(plan) };
  }

  if (isSupabaseAdminConfigured()) {
    await insertPaymentRecord({
      userId: user.userId,
      email: user.email,
      plan,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amountPaise: paymentAmountPaise,
      status: "failed",
      provider: paymentProvider,
      source: `${paymentSource}_activation_failed`
    });
    console.error("[payment-upgrade] durable entitlement activation failed after payment verification.", {
      razorpayPaymentId,
      requestedPlan: plan
    });
    return { ok: false, status: 500, message: "Payment is verified, but plan activation is pending. Contact support; do not pay again." };
  }

  const localUser = await getUserByEmail(user.email);
  if (localUser) {
    const upgraded = await upgradeUserPlan(localUser.userId, plan);
    if (!upgraded) {
      return { ok: false, status: 500, message: "Payment verified, but plan upgrade failed. Contact support." };
    }

    await insertPaymentRecord({
      userId: upgraded.userId,
      email: upgraded.email,
      plan,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amountPaise: paymentAmountPaise,
      status: "success",
      provider: paymentProvider,
      source: paymentSource
    });
    await trackEvent("upgraded_to_pro", upgraded.userId, { plan, paymentProvider, paymentSource });

    return { ok: true, user: toPublicUser(upgraded), message: paymentSuccessMessage(plan) };
  }

  const paidSessionUser = verifiedLocalPaymentUser(user, plan);
  await insertPaymentRecord({
    userId: paidSessionUser.userId,
    email: paidSessionUser.email,
    plan,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    amountPaise: paymentAmountPaise,
    status: "success",
    provider: paymentProvider,
    source: paymentSource
  });
  await trackEvent("upgraded_to_pro", paidSessionUser.userId, { plan, paymentProvider, paymentSource });

  return { ok: true, user: paidSessionUser, message: paymentSuccessMessage(plan) };
};




