import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/server/auth";
import {
  getRazorpayConfig,
  isPaidPlan,
  missingRazorpayKeysMessage,
  RAZORPAY_PLAN_PRICES
} from "../../../../../lib/server/razorpay";

type RazorpayOrdersClient = {
  orders: {
    create(input: {
      amount: number;
      currency: "INR";
      receipt: string;
      notes: Record<string, string>;
    }): Promise<{ id: string; amount: number; currency: string }>;
  };
};

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  if (!isPaidPlan(body.plan)) {
    return NextResponse.json({ ok: false, message: "Invalid plan." }, { status: 400 });
  }

  const config = getRazorpayConfig();
  if (!config) {
    return NextResponse.json({ ok: false, message: missingRazorpayKeysMessage }, { status: 500 });
  }

  const price = RAZORPAY_PLAN_PRICES[body.plan];
  const receipt = `sva_${body.plan}_${user.userId}_${Date.now()}`.slice(0, 40);

  try {
    const Razorpay = (await import("razorpay")).default;
    const razorpay = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret }) as RazorpayOrdersClient;
    const order = await razorpay.orders.create({
      amount: price.amount,
      currency: "INR",
      receipt,
      notes: {
        user_id: user.userId,
        user_email: user.email,
        plan: body.plan,
        product: "SVA"
      }
    });

    return NextResponse.json({
      ok: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: config.keyId,
      plan: body.plan,
      user: { email: user.email, name: user.email.split("@")[0] }
    });
  } catch (error) {
    console.error("[razorpay] create order failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ok: false, message: "Unable to create Razorpay order. Please try again." }, { status: 500 });
  }
}
