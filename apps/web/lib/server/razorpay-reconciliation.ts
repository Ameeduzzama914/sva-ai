import type { PublicUser } from "./store";

export const RECONCILIATION_PAYMENT_ID = "pay_TX8Ih5tVa40U6N" as const;
export const RECONCILIATION_PLAN = "pro" as const;
export const RECONCILIATION_AMOUNT_PAISE = 100 as const;
export const RECONCILIATION_CURRENCY = "INR" as const;
export const RECONCILIATION_PRICING_CONTEXT = "controlled_live_test_v1" as const;
export const RECONCILIATION_CONFIRMATION = "RECONCILE_CAPTURED_PRO_PAYMENT" as const;

type RazorpayPayment = { id?: string; order_id?: string; status?: string; amount?: number | string; currency?: string };
type RazorpayOrder = { id?: string; status?: string; amount?: number | string; currency?: string; notes?: Record<string, unknown> };
type ExistingPayment = {
  razorpay_payment_id?: unknown;
  razorpay_order_id?: unknown;
  user_id?: unknown;
  email?: unknown;
  plan?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const email = (value: unknown): string => text(value).toLowerCase();
const amount = (value: unknown): number => typeof value === "number" ? value : Number(value);
const note = (order: RazorpayOrder, key: string): string => text(order.notes?.[key]);

export const validateHistoricalControlledProPayment = (input: {
  payment: RazorpayPayment;
  order: RazorpayOrder;
  expectedUser: PublicUser;
  expectedEmail: string;
  existingPayments: ExistingPayment[];
}): { ok: true; orderId: string } | { ok: false; reason: string } => {
  const { payment, order, expectedUser, existingPayments } = input;
  const expectedEmail = email(input.expectedEmail);
  const orderId = text(payment.order_id);

  if (text(payment.id) !== RECONCILIATION_PAYMENT_ID) return { ok: false, reason: "payment_id_mismatch" };
  if (payment.status !== "captured") return { ok: false, reason: "payment_not_captured" };
  if (amount(payment.amount) !== RECONCILIATION_AMOUNT_PAISE) return { ok: false, reason: "payment_amount_mismatch" };
  if (payment.currency !== RECONCILIATION_CURRENCY) return { ok: false, reason: "payment_currency_mismatch" };
  if (!orderId || text(order.id) !== orderId) return { ok: false, reason: "payment_order_mismatch" };
  if (amount(order.amount) !== RECONCILIATION_AMOUNT_PAISE) return { ok: false, reason: "order_amount_mismatch" };
  if (order.currency !== RECONCILIATION_CURRENCY) return { ok: false, reason: "order_currency_mismatch" };
  if (order.status && order.status !== "paid") return { ok: false, reason: "order_not_paid" };
  if (note(order, "plan") !== RECONCILIATION_PLAN) return { ok: false, reason: "order_plan_mismatch" };
  if (note(order, "pricing_context") !== RECONCILIATION_PRICING_CONTEXT) return { ok: false, reason: "pricing_context_mismatch" };
  if (!expectedEmail || email(expectedUser.email) !== expectedEmail || email(note(order, "user_email")) !== expectedEmail) {
    return { ok: false, reason: "controlled_email_mismatch" };
  }
  if (!expectedUser.userId || note(order, "user_id") !== expectedUser.userId) return { ok: false, reason: "order_user_mismatch" };
  if (existingPayments.length !== 1) return { ok: false, reason: "existing_payment_row_count_mismatch" };

  const existing = existingPayments[0];
  const paymentRowMatches =
    text(existing.razorpay_payment_id) === RECONCILIATION_PAYMENT_ID &&
    text(existing.razorpay_order_id) === orderId &&
    text(existing.user_id) === expectedUser.userId &&
    email(existing.email) === expectedEmail &&
    existing.plan === RECONCILIATION_PLAN &&
    amount(existing.amount) === RECONCILIATION_AMOUNT_PAISE &&
    existing.currency === RECONCILIATION_CURRENCY &&
    existing.status === "success";

  return paymentRowMatches ? { ok: true, orderId } : { ok: false, reason: "existing_payment_row_mismatch" };
};
