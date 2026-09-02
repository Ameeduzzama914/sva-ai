import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../lib/server/admin-auth";
import { activatePaidPlanAfterPayment } from "../../../../../lib/server/payment-upgrade";
import { getRazorpayConfig } from "../../../../../lib/server/razorpay";
import {
  RECONCILIATION_AMOUNT_PAISE,
  RECONCILIATION_CONFIRMATION,
  RECONCILIATION_PAYMENT_ID,
  RECONCILIATION_PLAN,
  validateHistoricalControlledProPayment
} from "../../../../../lib/server/razorpay-reconciliation";
import { fetchPublicUserByEmailFromSupabase, getSupabaseAdminClient } from "../../../../../lib/server/supabase-admin";

type RazorpayReadClient = {
  payments: { fetch(paymentId: string): Promise<Record<string, unknown>> };
  orders: { fetch(orderId: string): Promise<Record<string, unknown>> };
};

const failure = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function POST(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) return admin.response;

  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!configuredOrigin || new URL(configuredOrigin).origin !== requestOrigin || origin !== requestOrigin) {
    return failure("Reconciliation request origin was rejected.", 403);
  }

  const body = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
  if (body?.confirmation !== RECONCILIATION_CONFIRMATION) return failure("Explicit reconciliation confirmation is required.");

  const expectedEmail = process.env.RAZORPAY_CONTROLLED_LIVE_TEST_EMAIL?.trim().toLowerCase();
  const config = getRazorpayConfig();
  const supabase = getSupabaseAdminClient();
  if (!expectedEmail || !config || !supabase) return failure("Production reconciliation configuration is incomplete.", 500);

  const expectedUser = await fetchPublicUserByEmailFromSupabase(expectedEmail);
  if (!expectedUser) return failure("The controlled-test user could not be confirmed.", 409);

  try {
    const Razorpay = (await import("razorpay")).default;
    const razorpay = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret }) as unknown as RazorpayReadClient;
    const payment = await razorpay.payments.fetch(RECONCILIATION_PAYMENT_ID);
    const orderId = typeof payment.order_id === "string" ? payment.order_id.trim() : "";
    if (!orderId) return failure("The captured payment has no associated order.", 409);
    const order = await razorpay.orders.fetch(orderId);

    const before = await supabase.from("payments")
      .select("razorpay_payment_id, razorpay_order_id, user_id, email, plan, amount, currency, status")
      .eq("razorpay_payment_id", RECONCILIATION_PAYMENT_ID)
      .eq("status", "success");
    if (before.error) throw new Error(`payment history read failed: ${before.error.message}`);

    const validation = validateHistoricalControlledProPayment({
      payment,
      order,
      expectedUser,
      expectedEmail,
      existingPayments: before.data ?? []
    });
    if (!validation.ok) {
      console.error("[razorpay-reconciliation] historical payment validation failed", { reason: validation.reason });
      return failure("Historical payment validation failed; no entitlement was changed.", 409);
    }

    const activation = await activatePaidPlanAfterPayment({
      user: expectedUser,
      plan: RECONCILIATION_PLAN,
      razorpayOrderId: validation.orderId,
      razorpayPaymentId: RECONCILIATION_PAYMENT_ID,
      paymentAmountPaise: RECONCILIATION_AMOUNT_PAISE,
      paymentProvider: "razorpay",
      paymentSource: "razorpay_operator_reconciliation"
    });
    if (!activation.ok) return failure(activation.message, activation.status);

    const [userResult, subscriptionResult, balanceResult, after] = await Promise.all([
      supabase.from("sva_users").select("plan").eq("user_id", expectedUser.userId).maybeSingle(),
      supabase.from("subscriptions").select("plan, status").eq("user_id", expectedUser.userId).maybeSingle(),
      supabase.from("usage_balances").select("plan, daily_limit, monthly_limit").eq("user_id", expectedUser.userId).maybeSingle(),
      supabase.from("payments").select("id").eq("razorpay_payment_id", RECONCILIATION_PAYMENT_ID).eq("status", "success")
    ]);

    const durableStateConfirmed =
      !userResult.error && userResult.data?.plan === "pro" &&
      !subscriptionResult.error && subscriptionResult.data?.plan === "pro" && subscriptionResult.data?.status === "active" &&
      !balanceResult.error && balanceResult.data?.plan === "pro" && balanceResult.data?.daily_limit === 8 && balanceResult.data?.monthly_limit === 200 &&
      !after.error && (after.data ?? []).length === (before.data ?? []).length;

    if (!durableStateConfirmed) {
      console.error("[razorpay-reconciliation] post-activation durable-state confirmation failed", {
        userConfirmed: userResult.data?.plan === "pro",
        subscriptionConfirmed: subscriptionResult.data?.plan === "pro" && subscriptionResult.data?.status === "active",
        balanceConfirmed: balanceResult.data?.plan === "pro" && balanceResult.data?.daily_limit === 8 && balanceResult.data?.monthly_limit === 200,
        paymentRowCountUnchanged: (after.data ?? []).length === (before.data ?? []).length
      });
      return failure("Payment was validated, but durable Pro confirmation failed. Do not pay again.", 500);
    }

    return NextResponse.json({
      ok: true,
      paymentId: RECONCILIATION_PAYMENT_ID,
      plan: "pro",
      durableState: { userPlan: "pro", subscriptionStatus: "active", dailyLimit: 8, billingPeriodLimit: 200 },
      paymentHistoryRowsAdded: 0
    });
  } catch (error) {
    console.error("[razorpay-reconciliation] reconciliation failed", {
      paymentId: RECONCILIATION_PAYMENT_ID,
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return failure("Reconciliation could not be completed. No new payment was initiated.", 502);
  }
}
