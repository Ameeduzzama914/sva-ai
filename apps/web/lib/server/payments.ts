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
  createdAt: string;
};

type Row = Record<string, unknown>;

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
    createdAt: pickString(row, "created_at") || new Date().toISOString()
  };
};

export const insertPaymentRecord = async (input: {
  userId: string;
  email: string;
  plan: PaidPlan;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: PaymentStatus;
}): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const { error } = await client.from("payments").insert({
    id: randomUUID(),
    user_id: input.userId,
    email: input.email,
    plan: input.plan,
    amount: RAZORPAY_PLAN_PRICES[input.plan].amount,
    currency: "INR",
    razorpay_order_id: input.razorpayOrderId,
    razorpay_payment_id: input.razorpayPaymentId ?? null,
    razorpay_signature: input.razorpaySignature ?? null,
    status: input.status,
    created_at: new Date().toISOString()
  });

  if (error) {
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
