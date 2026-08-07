import { getSvaPlan } from "../plans";
import { hasSuccessfulPaymentRecord, insertPaymentRecord } from "./payments";
import type { PaidPlan } from "./razorpay";
import { fetchPublicUserByEmailFromSupabase } from "./supabase-admin";
import { updateSupabasePaidPlanByEmail } from "./supabase-plan";
import { getUserByEmail, toPublicUser, trackEvent, upgradeUserPlan, type PublicUser } from "./store";

type PaymentActivationInput = {
  user: PublicUser;
  plan: PaidPlan;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
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
  paymentProvider,
  paymentSource
}: PaymentActivationInput): Promise<PaymentActivationResult> => {
  const duplicatePayment = await hasSuccessfulPaymentRecord(razorpayPaymentId);
  if (duplicatePayment) {
    const supabaseUser = await fetchPublicUserByEmailFromSupabase(user.email);
    if (supabaseUser) {
      return { ok: true, user: supabaseUser, message: paymentSuccessMessage(plan) };
    }
    const localUser = await getUserByEmail(user.email);
    if (localUser) {
      return { ok: true, user: toPublicUser(localUser), message: paymentSuccessMessage(plan) };
    }
    return { ok: true, user: verifiedLocalPaymentUser(user, plan), message: paymentSuccessMessage(plan) };
  }
  const supabaseUser = await updateSupabasePaidPlanByEmail(user.email, plan);
  if (supabaseUser) {
    await insertPaymentRecord({
      userId: supabaseUser.userId,
      email: supabaseUser.email,
      plan,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      status: "success",
      provider: paymentProvider,
      source: paymentSource
    });
    await trackEvent("upgraded_to_pro", supabaseUser.userId, { plan, paymentProvider, paymentSource });
    return { ok: true, user: supabaseUser, message: paymentSuccessMessage(plan) };
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
    status: "success",
    provider: paymentProvider,
    source: paymentSource
  });
  await trackEvent("upgraded_to_pro", paidSessionUser.userId, { plan, paymentProvider, paymentSource });

  return { ok: true, user: paidSessionUser, message: paymentSuccessMessage(plan) };
};




