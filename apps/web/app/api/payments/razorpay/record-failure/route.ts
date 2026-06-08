import { NextResponse } from "next/server";
import { getPaymentSessionUser } from "../../../../../lib/server/payment-session";
import { insertPaymentRecord } from "../../../../../lib/server/payments";
import { isPaidPlan } from "../../../../../lib/server/razorpay";

type Body = {
  plan?: unknown;
  razorpay_order_id?: unknown;
  razorpay_payment_id?: unknown;
  reason?: unknown;
};

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  const user = await getPaymentSessionUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const plan = body.plan;
  const orderId = asString(body.razorpay_order_id);
  const paymentId = asString(body.razorpay_payment_id);

  if (!isPaidPlan(plan) || !orderId) {
    return NextResponse.json({ ok: false, message: "Invalid failed payment payload." }, { status: 400 });
  }

  await insertPaymentRecord({
    userId: user.userId,
    email: user.email,
    plan,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId || undefined,
    razorpaySignature: asString(body.reason) || "razorpay_payment_failed",
    status: "failed",
    provider: "razorpay",
    source: "razorpay_checkout"
  });

  return NextResponse.json({ ok: true, message: "Payment failure recorded. No plan change was made." });
}
