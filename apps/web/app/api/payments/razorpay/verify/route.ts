import { NextResponse } from "next/server";
import { getPaymentSessionUser } from "../../../../../lib/server/payment-session";
import { activatePaidPlanAfterPayment } from "../../../../../lib/server/payment-upgrade";
import { insertPaymentRecord } from "../../../../../lib/server/payments";
import {
  getRazorpayConfig,
  isPaidPlan,
  missingRazorpayKeysMessage,
  RAZORPAY_PLAN_PRICES,
  verifyRazorpaySignature
} from "../../../../../lib/server/razorpay";

type Body = {
  razorpay_payment_id?: unknown;
  razorpay_order_id?: unknown;
  razorpay_signature?: unknown;
  plan?: unknown;
};

type RazorpayOrdersClient = {
  orders: {
    fetch(orderId: string): Promise<{
      amount?: number;
      currency?: string;
      notes?: Record<string, unknown>;
    }>;
  };
};

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  const user = await getPaymentSessionUser(request);
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
      status: "failed",
      provider: "razorpay",
      source: "razorpay_checkout"
    });
    return NextResponse.json({ ok: false, message: "Payment verification failed. No plan change was made." }, { status: 400 });
  }

  try {
    const Razorpay = (await import("razorpay")).default;
    const razorpay = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret }) as RazorpayOrdersClient;
    const order = await razorpay.orders.fetch(orderId);
    const orderPlan = asString(order.notes?.plan);
    const expectedPrice = RAZORPAY_PLAN_PRICES[plan];

    if (orderPlan !== plan || order.amount !== expectedPrice.amount || order.currency !== "INR") {
      await insertPaymentRecord({
        userId: user.userId,
        email: user.email,
        plan,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
        status: "failed",
        provider: "razorpay",
        source: "razorpay_checkout"
      });
      return NextResponse.json({ ok: false, message: "Payment order did not match the selected plan. No plan change was made." }, { status: 400 });
    }
  } catch (error) {
    console.error("[razorpay] order validation failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ok: false, message: "Unable to confirm Razorpay order. No plan change was made." }, { status: 502 });
  }

  const activation = await activatePaidPlanAfterPayment({
    user,
    plan,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    paymentProvider: "razorpay",
    paymentSource: "razorpay_checkout"
  });

  if (!activation.ok) {
    return NextResponse.json({ ok: false, message: activation.message }, { status: activation.status });
  }

  return NextResponse.json({ ok: true, user: activation.user, message: activation.message });
}
