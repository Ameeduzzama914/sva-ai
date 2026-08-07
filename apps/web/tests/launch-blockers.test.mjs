import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const plans = read("lib/plans.ts");
const webhook = read("app/api/payments/razorpay/webhook/route.ts");
const verifyRoute = read("app/api/verify/route.ts");
const shaping = read("lib/response-shaping.ts");
const synthesis = read("lib/providers/synthesis.ts");
const cost = read("lib/server/cost-protection.ts");
const reservationsSql = read("../../supabase/migrations/20260804_phase_1_29_billing_usage.sql");
const launchSql = read("../../supabase/migrations/20260805_0001_launch_blockers_renewal_costs.sql");
const adminMetrics = read("app/api/admin/metrics/route.ts");

const extractPlanBlock = (id) => plans.match(new RegExp(`${id}: \\{([\\s\\S]*?)\\n  \\}`, "m"))?.[1] ?? "";

test("approved plan values are centralized", () => {
  const free = extractPlanBlock("free");
  const pro = extractPlanBlock("pro");
  const ultra = extractPlanBlock("ultra");
  assert.match(free, /priceInr: 0/);
  assert.match(free, /dailyVerificationLimit: 2/);
  assert.match(free, /monthlyVerificationLimit: 30/);
  assert.match(pro, /priceInr: 799/);
  assert.match(pro, /razorpayAmountPaise: 79900/);
  assert.match(pro, /dailyVerificationLimit: 8/);
  assert.match(pro, /monthlyVerificationLimit: 200/);
  assert.match(ultra, /priceInr: 1299/);
  assert.match(ultra, /razorpayAmountPaise: 129900/);
  assert.match(ultra, /dailyVerificationLimit: 15/);
  assert.match(ultra, /monthlyVerificationLimit: 450/);
});

test("response limits are present for each plan", () => {
  assert.match(extractPlanBlock("free"), /promptTokenLimit: 1200[\s\S]*recentConversationLimit: 3[\s\S]*comparisonOutputTokenLimit: 160[\s\S]*synthesisOutputTokenLimit: 220/);
  assert.match(extractPlanBlock("pro"), /promptTokenLimit: 3000[\s\S]*recentConversationLimit: 6[\s\S]*comparisonOutputTokenLimit: 250[\s\S]*synthesisOutputTokenLimit: 400/);
  assert.match(extractPlanBlock("ultra"), /promptTokenLimit: 5000[\s\S]*recentConversationLimit: 10[\s\S]*comparisonOutputTokenLimit: 300[\s\S]*synthesisOutputTokenLimit: 550/);
});

test("Razorpay renewal webhook verifies signature and supported renewal events", () => {
  assert.match(webhook, /request\.text\(\)/);
  assert.match(webhook, /verifyWebhookSignature\(rawBody, signature, webhookSecret\)/);
  assert.match(webhook, /eventType === "invoice\.paid" \|\| eventType === "subscription\.charged"/);
  assert.match(webhook, /hasSuccessfulBillingTransaction\(billingTransactionId\)/);
  assert.match(webhook, /renewSupabasePaidPlan/);
  assert.match(webhook, /subscription\.halted/);
  assert.match(webhook, /subscription\.cancelled/);
});

test("duplicate transaction ids and webhook event ids are constrained", () => {
  assert.match(launchSql, /payments_success_billing_transaction_unique_idx/);
  assert.match(launchSql, /payments_success_razorpay_payment_unique_idx/);
  assert.match(launchSql, /webhook_events_razorpay_event_id_unique_idx/);
});

test("reservation finalize and refund are idempotent and counters are protected", () => {
  assert.match(reservationsSql, /sva_finalize_verification/);
  assert.match(reservationsSql, /sva_refund_verification/);
  assert.match(reservationsSql, /v_res\.status = 'finalized'/);
  assert.match(reservationsSql, /v_res\.status = 'refunded'/);
  assert.match(reservationsSql, /greatest\(0/);
  assert.match(reservationsSql, /for update/);
});

test("client cannot override max tokens or mode", () => {
  assert.doesNotMatch(verifyRoute, /body\.(max_tokens|maxTokens|plan|responseLength|mode)/);
  assert.match(verifyRoute, /resolveResponseShape\(usage\.plan, prompt\)/);
  assert.match(verifyRoute, /buildResponsesForPrompt\(prompt, mode, usage\.plan, responseShape\.comparisonMaxTokens\)/);
});

test("adaptive shaping applies simple normal complex ceilings", () => {
  assert.match(shaping, /simple/);
  assert.match(shaping, /normal/);
  assert.match(shaping, /complex/);
  assert.match(shaping, /Math\.min\(100, planConfig\.comparisonOutputTokenLimit\)/);
  assert.match(shaping, /Math\.min\(140, planConfig\.synthesisOutputTokenLimit\)/);
  assert.match(shaping, /Math\.min\(220, planConfig\.comparisonOutputTokenLimit\)/);
  assert.match(shaping, /Math\.min\(350, planConfig\.synthesisOutputTokenLimit\)/);
});

test("synthesis retries once on truncation and refund path exists", () => {
  assert.match(synthesis, /finishReason/);
  assert.match(synthesis, /retry: true/);
  assert.match(synthesis, /toStatus\(retry, 1\)/);
  assert.match(verifyRoute, /if \(!synthesis\.ok\)/);
  assert.match(verifyRoute, /await refundReservation\(\)/);
});

test("provider cost recording and cost alerts exist", () => {
  assert.match(cost, /INR_THRESHOLDS/);
  assert.match(cost, /pro: \{ warning: 180, critical: 240 \}/);
  assert.match(cost, /ultra: \{ warning: 400, critical: 520 \}/);
  assert.match(cost, /cost_usd/);
  assert.match(cost, /abnormal_usage_flagged/);
  assert.match(verifyRoute, /evaluateProfitProtection/);
});

test("admin metrics route requires server-side admin authorization", () => {
  assert.match(adminMetrics, /requireAdminSession\(request\)/);
  assert.match(adminMetrics, /provider_usage/);
  assert.match(adminMetrics, /admin_alerts/);
  assert.doesNotMatch(adminMetrics, /authorization/i);
});



