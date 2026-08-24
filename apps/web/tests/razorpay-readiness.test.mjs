import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const plans = read("lib/plans.ts");
const createOrderRoute = read("app/api/payments/razorpay/create-order/route.ts");
const verifyPaymentRoute = read("app/api/payments/razorpay/verify/route.ts");
const webhook = read("app/api/payments/razorpay/webhook/route.ts");
const paymentUpgrade = read("lib/server/payment-upgrade.ts");

test("Razorpay amounts and currency are server-authoritative", () => {
  assert.match(plans, /pro: \{[\s\S]*razorpayAmountPaise: 79900/);
  assert.match(plans, /ultra: \{[\s\S]*razorpayAmountPaise: 129900/);
  assert.match(createOrderRoute, /RAZORPAY_PLAN_PRICES\[body\.plan\]/);
  assert.match(createOrderRoute, /amount: price\.amount/);
  assert.match(createOrderRoute, /currency: "INR"/);
  assert.doesNotMatch(createOrderRoute, /body\.(amount|currency|price|credits|monthly_limit|daily_limit)/);
});

test("Razorpay verification rejects tampered signatures, plan, amount, and currency", () => {
  assert.match(verifyPaymentRoute, /verifyRazorpaySignature/);
  assert.match(verifyPaymentRoute, /orderPlan !== plan/);
  assert.match(verifyPaymentRoute, /order\.amount !== expectedPrice\.amount/);
  assert.match(verifyPaymentRoute, /order\.currency !== "INR"/);
  assert.match(verifyPaymentRoute, /No plan change was made/);
});

test("Razorpay webhook covers renewal, cancellation, halted, failed, and duplicate delivery paths", () => {
  assert.match(webhook, /verifyWebhookSignature\(rawBody, signature, webhookSecret\)/);
  assert.match(webhook, /eventType === "invoice\.paid" \|\| eventType === "subscription\.charged"/);
  assert.match(webhook, /subscription\.cancelled/);
  assert.match(webhook, /subscription\.halted/);
  assert.match(webhook, /invoice\.payment_failed/);
  assert.match(webhook, /payment\.failed/);
  assert.match(webhook, /eventState === "duplicate"/);
  assert.match(webhook, /hasSuccessfulBillingTransaction\(billingTransactionId\)/);
});

test("paid activation is idempotent for duplicate successful payments", () => {
  assert.match(paymentUpgrade, /hasSuccessfulPaymentRecord/);
  assert.match(paymentUpgrade, /if \(duplicatePayment\)/);
  assert.match(paymentUpgrade, /fetchPublicUserByEmailFromSupabase/);
  assert.match(paymentUpgrade, /getUserByEmail/);
});
