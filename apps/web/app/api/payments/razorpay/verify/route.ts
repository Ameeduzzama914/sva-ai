import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/server/auth";
import { insertPaymentRecord } from "../../../../../lib/server/payments";
import {
  getRazorpayConfig,
  isPaidPlan,
  missingRazorpayKeysMessage,
  verifyRazorpaySignature
} from "../../../../../lib/server/razorpay";
import { updateSupabasePaidPlanByEmail } from "../../../../../lib/server/supabase-plan";
import { getUserByEmail, toPublicUser, trackEvent, upgradeUserPlan } from "../../../../../lib/server/store";

type Body = {
  razorpay_payment_id?: unknown;
  razorpay_order_id?: unknown;
  razorpay_signature?: unknown;
  plan?: unknown;
};

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const plan = body.plan;
  const paymentId = asString(body.razorpay_payment_id);
  const orderId = asString(body.razorpay_order_id);
  const signature = asString(body.razorpay_signature);

  if (!isPaidPlan(plan) || !paymentId || !orderId || !signature) {
    return NextResponse.json({ ok: false, message: "Invalid payment verification payload." }, { status: 400 });
  }

  const config = getRazorpayConfig();
  if (!config) {
    return NextResponse.json({ ok: false, message: missingRazorpayKeysMessage }, { status: 500 });
  }

  const signatureValid = verifyRazorpaySignature({
    orderId,
    paymentId,
    signature,
    keySecret: config.keySecret
  });

  if (!signatureValid) {
    await insertPaymentRecord({
      userId: user.userId,
      email: user.email,
      plan,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      status: "failed"
    });
    return NextResponse.json({ ok: false, message: "Payment verification failed. No plan change was made." }, { status: 400 });
  }

  const supabaseUser = await updateSupabasePaidPlanByEmail(user.email, plan);
  if (supabaseUser) {
    await insertPaymentRecord({
      userId: supabaseUser.userId,
      email: supabaseUser.email,
      plan,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
      status: "success"
    });
    await trackEvent("upgraded_to_pro", supabaseUser.userId, { plan, paymentProvider: "razorpay" });
    return NextResponse.json({ ok: true, user: supabaseUser, message: `Payment successful. Your ${plan === "pro" ? "SVA Pro" : "SVA Ultra"} plan is now active.` });
  }

  const localUser = await getUserByEmail(user.email);
  if (!localUser) {
    return NextResponse.json({ ok: false, message: "Unable to find account for plan upgrade." }, { status: 404 });
  }

  const upgraded = await upgradeUserPlan(localUser.userId, plan);
  if (!upgraded) {
    return NextResponse.json({ ok: false, message: "Payment verified, but plan upgrade failed. Contact support." }, { status: 500 });
  }

  await insertPaymentRecord({
    userId: upgraded.userId,
    email: upgraded.email,
    plan,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    status: "success"
  });
  await trackEvent("upgraded_to_pro", upgraded.userId, { plan, paymentProvider: "razorpay" });

  return NextResponse.json({ ok: true, user: toPublicUser(upgraded), message: `Payment successful. Your ${plan === "pro" ? "SVA Pro" : "SVA Ultra"} plan is now active.` });
}
