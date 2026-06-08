import { NextResponse } from "next/server";
import { getPaymentSessionUser } from "../../../../../lib/server/payment-session";
import { activatePaidPlanAfterPayment } from "../../../../../lib/server/payment-upgrade";
import { isPaidPlan } from "../../../../../lib/server/razorpay";

type Body = {
  plan?: unknown;
};

const simulationEnabled = (): boolean => {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_PAYMENTS === "true";
};

export async function POST(request: Request) {
  if (!simulationEnabled()) {
    return NextResponse.json({ ok: false, message: "Test payment simulation is disabled in production." }, { status: 403 });
  }

  const user = await getPaymentSessionUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const plan = body.plan;
  if (!isPaidPlan(plan)) {
    return NextResponse.json({ ok: false, message: "Invalid simulated payment plan." }, { status: 400 });
  }

  const now = Date.now();
  const activation = await activatePaidPlanAfterPayment({
    user,
    plan,
    razorpayOrderId: `sim_order_${plan}_${now}`,
    razorpayPaymentId: `sim_payment_${plan}_${now}`,
    razorpaySignature: "razorpay_test_simulation",
    paymentProvider: "razorpay_test_simulation",
    paymentSource: "razorpay_test_simulation"
  });

  if (!activation.ok) {
    return NextResponse.json({ ok: false, message: activation.message }, { status: activation.status });
  }

  return NextResponse.json({
    ok: true,
    user: activation.user,
    message: `Simulated payment verified. Your ${plan === "pro" ? "SVA Pro" : "SVA Ultra"} plan is now active.`
  });
}
