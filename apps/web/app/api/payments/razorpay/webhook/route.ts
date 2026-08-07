import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSvaPlan } from "../../../../../lib/plans";
import { createAdminAlert } from "../../../../../lib/server/admin-alerts";
import { activatePaidPlanAfterPayment } from "../../../../../lib/server/payment-upgrade";
import { hasSuccessfulBillingTransaction, insertPaymentRecord } from "../../../../../lib/server/payments";
import { getRazorpayConfig, isPaidPlan, RAZORPAY_PLAN_PRICES } from "../../../../../lib/server/razorpay";
import { markSupabaseSubscriptionCancellation, renewSupabasePaidPlan } from "../../../../../lib/server/supabase-plan";
import { getSupabaseAdminClient } from "../../../../../lib/server/supabase-admin";
import type { PublicUser } from "../../../../../lib/server/store";

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    order?: { entity?: RazorpayOrderEntity };
    invoice?: { entity?: RazorpayInvoiceEntity };
    subscription?: { entity?: RazorpaySubscriptionEntity };
  };
};

type RazorpayPaymentEntity = { id?: string; order_id?: string; amount?: number; currency?: string; status?: string; notes?: Record<string, unknown> };
type RazorpayOrderEntity = { id?: string; amount?: number; currency?: string; status?: string; notes?: Record<string, unknown> };
type RazorpayInvoiceEntity = { id?: string; payment_id?: string; subscription_id?: string; amount?: number; amount_paid?: number; currency?: string; status?: string; period_start?: number; period_end?: number; notes?: Record<string, unknown> };
type RazorpaySubscriptionEntity = { id?: string; status?: string; current_start?: number; current_end?: number; ended_at?: number; notes?: Record<string, unknown> };

type RazorpayOrdersClient = { orders: { fetch(orderId: string): Promise<RazorpayOrderEntity> } };

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const asEpochIso = (value: unknown): string | undefined => (typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : undefined);

const verifyWebhookSignature = (rawBody: string, signature: string, secret: string): boolean => {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = signature.trim();
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
};

const markWebhookEvent = async (
  eventId: string,
  eventType: string,
  status: "processing" | "completed" | "failed" | "ignored",
  errorMessage?: string
): Promise<"new" | "duplicate" | "updated" | "unavailable"> => {
  const client = getSupabaseAdminClient();
  if (!client || !eventId) return "unavailable";

  const existing = await client.from("webhook_events").select("processing_status").eq("razorpay_event_id", eventId).maybeSingle();
  if (!existing.error && existing.data?.processing_status === "completed") return "duplicate";

  const { error } = await client.from("webhook_events").upsert(
    {
      razorpay_event_id: eventId,
      event_type: eventType,
      processing_status: status,
      error_message: errorMessage ?? null,
      processed_at: status === "completed" || status === "failed" || status === "ignored" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "razorpay_event_id" }
  );

  if (error) {
    console.error("[razorpay-webhook] event mark failed:", error.message);
    return "unavailable";
  }
  return existing.data ? "updated" : "new";
};

const fetchOrder = async (orderId: string): Promise<RazorpayOrderEntity | null> => {
  const config = getRazorpayConfig();
  if (!config || !orderId) return null;
  try {
    const Razorpay = (await import("razorpay")).default;
    const razorpay = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret }) as RazorpayOrdersClient;
    return await razorpay.orders.fetch(orderId);
  } catch (error) {
    console.error("[razorpay-webhook] order fetch failed:", error instanceof Error ? error.message : "Unknown error");
    return null;
  }
};

const buildPaymentUser = (input: { userId: string; email: string; plan: "pro" | "ultra" }): PublicUser => {
  const planConfig = getSvaPlan(input.plan);
  return {
    userId: input.userId,
    email: input.email,
    plan: input.plan,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    usedToday: 0,
    dailyLimit: planConfig.dailyVerificationLimit,
    onboardingCompleted: true,
    creditsRemaining: planConfig.dailyVerificationLimit,
    creditsResetAt: new Date().toISOString(),
    monthlyUsage: 0,
    dailyUsage: 0
  };
};

const metadataFrom = (...records: Array<Record<string, unknown> | undefined>) => Object.assign({}, ...records.filter(Boolean));

const handleRenewalEvent = async (eventId: string, eventType: string, payload: RazorpayWebhookPayload) => {
  const invoice = payload.payload?.invoice?.entity;
  const payment = payload.payload?.payment?.entity;
  const subscription = payload.payload?.subscription?.entity;
  const notes = metadataFrom(subscription?.notes, invoice?.notes, payment?.notes);
  const plan = asString(notes.plan);
  const userId = asString(notes.user_id);
  const email = asString(notes.user_email).toLowerCase();
  const paymentId = asString(invoice?.payment_id) || asString(payment?.id);
  const invoiceId = asString(invoice?.id);
  const billingTransactionId = paymentId || invoiceId || eventId;
  const amount = invoice?.amount_paid ?? invoice?.amount ?? payment?.amount;
  const currency = invoice?.currency ?? payment?.currency;
  const successful = eventType === "subscription.charged" || eventType === "invoice.paid" || invoice?.status === "paid" || payment?.status === "captured";

  if (!successful) {
    await markWebhookEvent(eventId, eventType, "ignored", "Renewal event was not a successful paid invoice/payment.");
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!isPaidPlan(plan) || !userId || !email || !billingTransactionId) {
    await markWebhookEvent(eventId, eventType, "failed", "Renewal payload missing plan, user, or transaction metadata.");
    return NextResponse.json({ ok: false, message: "Renewal payload missing required metadata." }, { status: 400 });
  }

  const expectedPrice = RAZORPAY_PLAN_PRICES[plan];
  if (amount !== expectedPrice.amount || currency !== "INR") {
    await markWebhookEvent(eventId, eventType, "failed", "Renewal amount or currency mismatch.");
    return NextResponse.json({ ok: false, message: "Renewal amount or currency mismatch." }, { status: 400 });
  }

  if (await hasSuccessfulBillingTransaction(billingTransactionId)) {
    await markWebhookEvent(eventId, eventType, "completed");
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await insertPaymentRecord({
    userId,
    email,
    plan,
    razorpayOrderId: invoiceId || asString(subscription?.id) || billingTransactionId,
    razorpayPaymentId: billingTransactionId,
    status: "success",
    provider: "razorpay",
    source: "razorpay_subscription_renewal"
  });

  const user = await renewSupabasePaidPlan({
    userId,
    email,
    plan,
    billingPeriodStart: asEpochIso(invoice?.period_start) ?? asEpochIso(subscription?.current_start),
    billingPeriodEnd: asEpochIso(invoice?.period_end) ?? asEpochIso(subscription?.current_end),
    cancellationAtPeriodEnd: false,
    subscriptionStatus: "active"
  });

  if (!user) {
    await markWebhookEvent(eventId, eventType, "failed", "Renewal plan update failed.");
    return NextResponse.json({ ok: false, message: "Renewal plan update failed." }, { status: 500 });
  }

  await markWebhookEvent(eventId, eventType, "completed");
  return NextResponse.json({ ok: true, user });
};

const handleSubscriptionStateEvent = async (eventId: string, eventType: string, payload: RazorpayWebhookPayload) => {
  const subscription = payload.payload?.subscription?.entity;
  const notes = metadataFrom(subscription?.notes);
  const plan = asString(notes.plan);
  const userId = asString(notes.user_id);
  const email = asString(notes.user_email).toLowerCase();

  if (!isPaidPlan(plan) || !email) {
    await markWebhookEvent(eventId, eventType, "ignored", "Subscription state event missing SVA paid-plan metadata.");
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (eventType === "subscription.halted") {
    await createAdminAlert({
      alertType: "razorpay_subscription_halted",
      severity: "critical",
      source: "razorpay_webhook",
      message: "A paid subscription was halted by Razorpay. Access was not reset from this event.",
      metadata: { user_id: userId || null, email, plan, subscription_id: asString(subscription?.id) || null }
    });
    await markWebhookEvent(eventId, eventType, "completed");
    return NextResponse.json({ ok: true, halted: true });
  }

  const endIso = asEpochIso(subscription?.current_end) ?? asEpochIso(subscription?.ended_at);
  const endsInFuture = endIso ? new Date(endIso).getTime() > Date.now() : false;
  await markSupabaseSubscriptionCancellation({ userId, email, plan, billingPeriodEnd: endIso, cancellationAtPeriodEnd: endsInFuture });
  await markWebhookEvent(eventId, eventType, "completed");
  return NextResponse.json({ ok: true, cancellationAtPeriodEnd: endsInFuture });
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const eventId = request.headers.get("x-razorpay-event-id") ?? crypto.createHash("sha256").update(rawBody).digest("hex");
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) return NextResponse.json({ ok: false, message: "Razorpay webhook secret is not configured." }, { status: 500 });
  if (!signature || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ ok: false, message: "Invalid Razorpay webhook signature." }, { status: 400 });
  }

  const payload = JSON.parse(rawBody || "{}") as RazorpayWebhookPayload;
  const eventType = payload.event ?? "unknown";
  const eventState = await markWebhookEvent(eventId, eventType, "processing");
  if (eventState === "duplicate") return NextResponse.json({ ok: true, duplicate: true });

  if (eventType === "invoice.paid" || eventType === "subscription.charged") {
    return handleRenewalEvent(eventId, eventType, payload);
  }

  if (eventType === "subscription.cancelled" || eventType === "subscription.halted") {
    return handleSubscriptionStateEvent(eventId, eventType, payload);
  }

  if (eventType === "invoice.payment_failed" || eventType === "payment.failed") {
    await createAdminAlert({ alertType: "razorpay_payment_failure", severity: "warning", source: "razorpay_webhook", message: "Razorpay reported a failed paid-plan transaction.", metadata: { event_id: eventId, event_type: eventType } });
    await markWebhookEvent(eventId, eventType, "completed");
    return NextResponse.json({ ok: true, failedPaymentRecorded: true });
  }

  if (eventType !== "payment.captured" && eventType !== "order.paid") {
    await markWebhookEvent(eventId, eventType, "ignored");
    return NextResponse.json({ ok: true, ignored: true });
  }

  const payment = payload.payload?.payment?.entity;
  const orderFromPayload = payload.payload?.order?.entity;
  const orderId = asString(payment?.order_id) || asString(orderFromPayload?.id);
  const paymentId = asString(payment?.id) || orderId;
  const order = orderFromPayload ?? (await fetchOrder(orderId));
  const notes = metadataFrom(order?.notes, payment?.notes);
  const plan = asString(notes.plan);
  const userId = asString(notes.user_id);
  const email = asString(notes.user_email).toLowerCase();

  if (!isPaidPlan(plan) || !userId || !email || !orderId || !paymentId) {
    await markWebhookEvent(eventId, eventType, "failed", "Webhook payload missing plan, user, order, or payment metadata.");
    return NextResponse.json({ ok: false, message: "Webhook payload missing required metadata." }, { status: 400 });
  }

  const expectedPrice = RAZORPAY_PLAN_PRICES[plan];
  const amount = payment?.amount ?? order?.amount;
  const currency = payment?.currency ?? order?.currency;
  if (amount !== expectedPrice.amount || currency !== "INR") {
    await markWebhookEvent(eventId, eventType, "failed", "Webhook amount or currency mismatch.");
    return NextResponse.json({ ok: false, message: "Webhook amount or currency mismatch." }, { status: 400 });
  }

  if (payment?.status && payment.status !== "captured") {
    await markWebhookEvent(eventId, eventType, "ignored", `Payment status ${payment.status} is not captured.`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  const activation = await activatePaidPlanAfterPayment({
    user: buildPaymentUser({ userId, email, plan }),
    plan,
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    paymentProvider: "razorpay",
    paymentSource: "razorpay_webhook"
  });

  if (!activation.ok) {
    await markWebhookEvent(eventId, eventType, "failed", activation.message);
    return NextResponse.json({ ok: false, message: activation.message }, { status: activation.status });
  }

  await markWebhookEvent(eventId, eventType, "completed");
  return NextResponse.json({ ok: true, user: activation.user });
}

