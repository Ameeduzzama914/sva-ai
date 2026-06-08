import { NextResponse } from "next/server";
import { getPaymentSessionUser } from "../../../../../lib/server/payment-session";
import { activatePaidPlanAfterPayment } from "../../../../../lib/server/payment-upgrade";
import { isPaidPlan } from "../../../../../lib/server/razorpay";

type Body = {
  plan?: unknown;
};

const simulationEnabled = (): boolean =>
  process.env.NODE_ENV === "development" && process.env.ENABLE_LOCAL_PAYMENT_SIMULATION === "true";

export async function POST(request: Request) {
  if (!simulationEnabled()) {
    return NextResponse.json({ ok: false, message: "Local payment simulation is disabled." }, { status: 403 });
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
    razorpaySignature: "local_payment_simulation",
    paymentProvider: "local_payment_simulation",
    paymentSource: "local_payment_simulation"
  });

  if (!activation.ok) {
    return NextResponse.json({ ok: false, message: activation.message }, { status: activation.status });
  }

  return NextResponse.json({
    ok: true,
    user: activation.user,
    message: `Local simulated payment verified. Your ${plan === "pro" ? "SVA Pro" : "SVA Ultra"} plan is now active.`
  });
}
