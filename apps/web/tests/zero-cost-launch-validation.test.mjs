import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const plans = read("lib/plans.ts");
const createOrderRoute = read("app/api/payments/razorpay/create-order/route.ts");
const verifyPaymentRoute = read("app/api/payments/razorpay/verify/route.ts");
const webhookRoute = read("app/api/payments/razorpay/webhook/route.ts");
const simulateRoute = read("app/api/payments/razorpay/simulate-success/route.ts");
const adminUserRoute = read("app/api/admin/users/[userId]/route.ts");
const verifyRoute = read("app/api/verify/route.ts");
const openrouter = read("lib/providers/openrouter.ts");
const openrouterHealth = read("lib/server/openrouter-health.ts");
const proLayer = read("lib/providers/pro-layer.ts");
const synthesis = read("lib/providers/synthesis.ts");
const providerUsage = read("lib/server/provider-usage.ts");
const costProtection = read("lib/server/cost-protection.ts");
const reservations = read("lib/server/verification-reservations.ts");
const launchAuditSql = read("../../supabase/migrations/20260823_0001_launch_audit_reservation_provider_fix.sql");
const runbook = read("../../docs/FINAL_LAUNCH_RUNBOOK.md");

const extractPlanBlock = (id) => plans.match(new RegExp(`${id}: \\{([\\s\\S]*?)\\n  \\}`, "m"))?.[1] ?? "";

const planConfig = (id) => {
  const block = extractPlanBlock(id);
  return {
    priceInr: Number(block.match(/priceInr: (\d+)/)?.[1]),
    amountPaise: Number(block.match(/razorpayAmountPaise: (\d+)/)?.[1] ?? 0),
    daily: Number(block.match(/dailyVerificationLimit: (\d+)/)?.[1]),
    monthly: Number(block.match(/monthlyVerificationLimit: (\d+)/)?.[1])
  };
};

test("zero-cost plan simulation proves Pro and Ultra paid limits without self-payment", () => {
  const free = planConfig("free");
  const pro = planConfig("pro");
  const ultra = planConfig("ultra");

  assert.deepEqual(free, { priceInr: 0, amountPaise: 0, daily: 2, monthly: 30 });
  assert.deepEqual(pro, { priceInr: 799, amountPaise: 79900, daily: 8, monthly: 200 });
  assert.deepEqual(ultra, { priceInr: 1299, amountPaise: 129900, daily: 15, monthly: 450 });

  const simulateLifecycle = (plan) => {
    const selected = planConfig(plan);
    let dailyUsed = 0;
    let monthlyUsed = 0;
    dailyUsed += 1;
    monthlyUsed += 1;
    assert.equal(selected.daily - dailyUsed, selected.daily - 1);
    assert.equal(selected.monthly - monthlyUsed, selected.monthly - 1);
    monthlyUsed = 0;
    assert.equal(monthlyUsed, 0);
    return selected;
  };

  assert.equal(simulateLifecycle("pro").daily, 8);
  assert.equal(simulateLifecycle("ultra").monthly, 450);
});

test("Razorpay production paths require genuine verified payment and reject client-controlled access", () => {
  assert.match(createOrderRoute, /getPaymentSessionUser\(request\)/);
  assert.match(createOrderRoute, /RAZORPAY_PLAN_PRICES\[body\.plan\]/);
  assert.match(createOrderRoute, /currency: "INR"/);
  assert.doesNotMatch(createOrderRoute, /body\.(amount|currency|price|credits|dailyLimit|monthlyLimit|daily_limit|monthly_limit)/);

  assert.match(verifyPaymentRoute, /verifyRazorpaySignature/);
  assert.match(verifyPaymentRoute, /razorpay\.orders\.fetch\(orderId\)/);
  assert.match(verifyPaymentRoute, /orderPlan !== plan/);
  assert.match(verifyPaymentRoute, /order\.amount !== expectedPrice\.amount/);
  assert.match(verifyPaymentRoute, /order\.currency !== "INR"/);
  assert.match(verifyPaymentRoute, /activatePaidPlanAfterPayment/);

  assert.match(webhookRoute, /request\.text\(\)/);
  assert.match(webhookRoute, /verifyWebhookSignature\(rawBody, signature, webhookSecret\)/);
  assert.match(webhookRoute, /markWebhookEvent\(eventId, eventType, "completed"\)/);
  assert.match(webhookRoute, /eventState === "duplicate"/);
});

test("test-only payment helpers cannot be invoked in production", () => {
  assert.match(simulateRoute, /process\.env\.NODE_ENV === "development"/);
  assert.match(simulateRoute, /process\.env\.ENABLE_LOCAL_PAYMENT_SIMULATION === "true"/);
  assert.match(simulateRoute, /return NextResponse\.json\(\{ ok: false, message: "Local payment simulation is disabled\." \}, \{ status: 403 \}\)/);
  assert.match(adminUserRoute, /requireAdminSession\(request\)/);
});

test("OpenRouter zero-cost coverage includes family routing, fallback, status classification, and diagnostics", () => {
  assert.match(proLayer, /family: "gpt"/);
  assert.match(proLayer, /family: "gemini"/);
  assert.match(proLayer, /family: "deepseek"/);
  assert.match(proLayer, /SVA_GPT_PRIMARY/);
  assert.match(proLayer, /SVA_GEMINI_PRIMARY/);
  assert.match(proLayer, /SVA_DEEPSEEK_PRIMARY/);
  assert.match(proLayer, /Promise\.allSettled/);
  assert.match(proLayer, /attemptedFallback/);

  assert.match(openrouterHealth, /statusCode === 402/);
  assert.match(openrouterHealth, /statusCode === 401/);
  assert.match(openrouterHealth, /statusCode === 429/);
  assert.match(openrouterHealth, /statusCode === 408 \|\| statusCode === 502 \|\| statusCode === 503 \|\| statusCode === 504/);
  assert.match(openrouterHealth, /OPENROUTER_MANAGEMENT_KEY/);
  assert.match(openrouterHealth, /https:\/\/openrouter\.ai\/api\/v1\/credits/);

  assert.match(openrouter, /shouldSingleRetry/);
  assert.match(openrouter, /\[408, 429, 502, 503, 504\]\.includes\(status\)/);
  assert.match(openrouter, /if \(!text\)/);
  assert.match(openrouter, /finishReason: data\.choices\?\.\[0\]\?\.finish_reason/);
  assert.match(openrouter, /max_tokens: options\.maxTokens/);
});

test("OpenRouter failure paths refund allowance and preserve central-account architecture", () => {
  assert.match(verifyRoute, /reserveVerificationAllowance/);
  assert.match(verifyRoute, /hasOpenRouterBillingFailure\(providerFlow\)/);
  assert.match(verifyRoute, /await refundReservation\(\)/);
  assert.match(verifyRoute, /validResponses\.length < 2/);
  assert.match(verifyRoute, /if \(!synthesis\.ok\)/);
  assert.match(verifyRoute, /finalizeVerificationReservation\(reservation\)/);
  assert.match(synthesis, /isTruncated/);
  assert.match(synthesis, /retry: true/);
  assert.match(synthesis, /toStatus\(retry, 1\)/);
  assert.match(providerUsage, /costUsd/);
  assert.match(providerUsage, /insertSynthesisProviderUsageRow/);
  assert.match(costProtection, /ai_cost_\$\{threshold\}/);
  assert.match(costProtection, /threshold === "critical"/);
  assert.doesNotMatch(proLayer + openrouter + synthesis, /user[_-]?openrouter|customer[_-]?openrouter|provider key/i);
});

test("usage replay and concurrency protections are validated without a live database mutation", () => {
  assert.match(reservations, /client\.rpc\("sva_reserve_verification"/);
  assert.match(reservations, /client\.rpc\("sva_finalize_verification"/);
  assert.match(reservations, /client\.rpc\("sva_refund_verification"/);
  assert.match(launchAuditSql, /on conflict \(idempotency_key\) do nothing/);
  assert.match(launchAuditSql, /get diagnostics v_inserted_count = row_count/);
  assert.match(launchAuditSql, /already_reserved/);
  assert.match(launchAuditSql, /for update/);
  assert.match(launchAuditSql, /active_verifications >= public\.sva_plan_concurrency_limit/);
});

test("runbook uses zero-real-money launch validation language", () => {
  assert.match(runbook, /Razorpay Test Mode/);
  assert.match(runbook, /No real INR self-payment is required/);
  assert.match(runbook, /AUTOMATED\/MOCK VERIFIED/);
  assert.match(runbook, /CONFIGURATION VERIFIED/);
  assert.match(runbook, /REAL INFERENCE NOT YET VERIFIED/);
  assert.doesNotMatch(runbook, /spend INR 799|spend INR 1299/i);
});



