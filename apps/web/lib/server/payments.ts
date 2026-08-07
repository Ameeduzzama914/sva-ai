import { randomUUID } from "crypto";
import type { PaidPlan } from "./razorpay";
import { RAZORPAY_PLAN_PRICES } from "./razorpay";
import { getSupabaseAdminClient } from "./supabase-admin";

export type PaymentStatus = "success" | "failed";

export type PaymentRecord = {
  id: string;
  userId: string | null;
  email: string;
  plan: PaidPlan;
  amount: number;
  currency: "INR";
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  status: PaymentStatus;
  provider: string | null;
  source: string | null;
  createdAt: string;
};

type Row = Record<string, unknown>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toNullableUuid = (value: string): string | null => (uuidPattern.test(value) ? value : null);

const pickString = (row: Row, key: string): string => {
  const value = row[key];
  return typeof value === "string" ? value : "";
};

const pickNumber = (row: Row, key: string): number => {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return 0;
};

const mapPaymentRow = (row: Row): PaymentRecord | null => {
  const plan = pickString(row, "plan");
  if (plan !== "pro" && plan !== "ultra") return null;

  return {
    id: pickString(row, "id"),
    userId: pickString(row, "user_id") || null,
    email: pickString(row, "email"),
    plan,
    amount: pickNumber(row, "amount"),
    currency: "INR",
    razorpayOrderId: pickString(row, "razorpay_order_id"),
    razorpayPaymentId: pickString(row, "razorpay_payment_id") || null,
    status: pickString(row, "status") === "failed" ? "failed" : "success",
    provider: pickString(row, "provider") || null,
    source: pickString(row, "source") || null,
    createdAt: pickString(row, "created_at") || new Date().toISOString()
  };
};

const isMissingOptionalColumnError = (message: string): boolean => {
  const lower = message.toLowerCase();
  return lower.includes("provider") || lower.includes("source") || lower.includes("schema cache");
};

export const insertPaymentRecord = async (input: {
  userId: string;
  email: string;
  plan: PaidPlan;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: PaymentStatus;
  provider?: string;
  source?: string;
  billingTransactionId?: string;
  razorpayInvoiceId?: string;
  razorpaySubscriptionId?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
}): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const basePayload = {
    id: randomUUID(),
    user_id: toNullableUuid(input.userId),
    email: input.email,
    plan: input.plan,
    amount: RAZORPAY_PLAN_PRICES[input.plan].amount,
    currency: "INR",
    razorpay_order_id: input.razorpayOrderId,
    razorpay_payment_id: input.razorpayPaymentId ?? null,
    razorpay_signature: input.razorpaySignature ?? null,
    status: input.status,
    created_at: new Date().toISOString()
  };
  const payload = {
    ...basePayload,
    provider: input.provider ?? "razorpay",
    source: input.source ?? "razorpay_checkout",
    billing_transaction_id: input.billingTransactionId ?? input.razorpayPaymentId ?? null,
    razorpay_invoice_id: input.razorpayInvoiceId ?? null,
    razorpay_subscription_id: input.razorpaySubscriptionId ?? null,
    billing_period_start: input.billingPeriodStart ?? null,
    billing_period_end: input.billingPeriodEnd ?? null
  };

  const { error } = await client.from("payments").insert(payload);

  if (error) {
    if (isMissingOptionalColumnError(error.message)) {
      const retry = await client.from("payments").insert(basePayload);
      if (!retry.error) return true;
      console.error("[payments] insert skipped:", retry.error.message);
      return false;
    }

    console.error("[payments] insert skipped:", error.message);
    return false;
  }

  return true;
};

export const listPaymentsForUser = async (email: string): Promise<PaymentRecord[]> => {
  const client = getSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  if (!client || !normalizedEmail) return [];

  const { data, error } = await client
    .from("payments")
    .select("*")
    .ilike("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("[payments] list user payments skipped:", error.message);
    return [];
  }

  return ((data ?? []) as Row[]).map(mapPaymentRow).filter((row): row is PaymentRecord => row !== null);
};

export const listRecentPayments = async (): Promise<PaymentRecord[]> => {
  const client = getSupabaseAdminClient();
  if (!client) return [];

  const { data, error } = await client
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[payments] list recent payments skipped:", error.message);
    return [];
  }

  return ((data ?? []) as Row[]).map(mapPaymentRow).filter((row): row is PaymentRecord => row !== null);
};
export const hasSuccessfulPaymentRecord = async (razorpayPaymentId: string): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  const paymentId = razorpayPaymentId.trim();
  if (!client || !paymentId) return false;

  const { data, error } = await client
    .from("payments")
    .select("id")
    .eq("razorpay_payment_id", paymentId)
    .eq("status", "success")
    .limit(1);

  if (error) {
    console.error("[payments] duplicate payment check skipped:", error.message);
    return false;
  }

  return (data ?? []).length > 0;
};
export const hasSuccessfulBillingTransaction = async (billingTransactionId: string): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  const transactionId = billingTransactionId.trim();
  if (!client || !transactionId) return false;

  const { data, error } = await client
    .from("payments")
    .select("id")
    .or("razorpay_payment_id.eq." + transactionId + ",billing_transaction_id.eq." + transactionId)
    .eq("status", "success")
    .limit(1);

  if (error) {
    const fallback = await client.from("payments").select("id").eq("razorpay_payment_id", transactionId).eq("status", "success").limit(1);
    if (!fallback.error) return (fallback.data ?? []).length > 0;
    console.error("[payments] billing transaction check skipped:", error.message);
    return false;
  }

  return (data ?? []).length > 0;
};



