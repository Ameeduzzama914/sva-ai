import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const compileModule = (source, requireModule) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  const factory = vm.runInNewContext(`(function (require, module, exports) { ${compiled}\n})`, { console });
  factory(requireModule, module, module.exports);
  return module.exports;
};

const makeUser = (plan = "free") => ({
  userId: "user-123",
  email: "owner@example.com",
  plan,
  usageCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  usedToday: 0,
  dailyLimit: plan === "ultra" ? 15 : plan === "pro" ? 8 : 2,
  onboardingCompleted: true,
  creditsRemaining: plan === "ultra" ? 15 : plan === "pro" ? 8 : 2,
  creditsResetAt: "2026-02-01T00:00:00.000Z",
  monthlyUsage: 0,
  dailyUsage: 0
});

const createHarness = ({ duplicate = false, durableUser = null, reconciledUser = null } = {}) => {
  const calls = { inserts: [], updates: 0, tracks: 0, localUpgrades: 0 };
  const module = compileModule(read("lib/server/payment-upgrade.ts"), (specifier) => {
    if (specifier === "../plans") {
      return { getSvaPlan: (plan) => ({ dailyVerificationLimit: plan === "ultra" ? 15 : plan === "pro" ? 8 : 2 }) };
    }
    if (specifier === "./payments") {
      return {
        hasSuccessfulPaymentRecord: async () => duplicate,
        insertPaymentRecord: async (input) => { calls.inserts.push(input); return true; }
      };
    }
    if (specifier === "./supabase-admin") {
      return {
        fetchPublicUserByEmailFromSupabase: async () => durableUser,
        isSupabaseAdminConfigured: () => true
      };
    }
    if (specifier === "./supabase-plan") {
      return { updateSupabasePaidPlanByEmail: async () => { calls.updates += 1; return reconciledUser; } };
    }
    if (specifier === "./store") {
      return {
        getUserByEmail: async () => null,
        toPublicUser: (user) => user,
        trackEvent: async () => { calls.tracks += 1; },
        upgradeUserPlan: async () => { calls.localUpgrades += 1; return null; }
      };
    }
    throw new Error(`Unexpected dependency: ${specifier}`);
  });
  return { activate: module.activatePaidPlanAfterPayment, calls };
};

const activationInput = (plan = "pro") => ({
  user: makeUser("free"),
  plan,
  razorpayOrderId: "order_existing",
  razorpayPaymentId: "pay_existing",
  razorpaySignature: "verified_signature",
  paymentAmountPaise: plan === "ultra" ? 200 : 100,
  paymentProvider: "razorpay",
  paymentSource: "razorpay_webhook"
});

test("Supabase activation failure is fail-closed and never returns synthetic paid success", async () => {
  const { activate, calls } = createHarness({ duplicate: false, reconciledUser: null });
  const result = await activate(activationInput("pro"));
  assert.equal(result.ok, false);
  assert.match(result.message, /activation is pending/i);
  assert.equal(calls.localUpgrades, 0);
  assert.equal(calls.tracks, 0);
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.inserts[0].status, "failed");
  assert.equal(calls.inserts[0].source, "razorpay_webhook_activation_failed");
});

test("durably confirmed Pro and Ultra activation persists success with unchanged quotas", async () => {
  for (const [plan, daily, monthly] of [["pro", 8, 200], ["ultra", 15, 450]]) {
    const paidUser = makeUser(plan);
    const { activate, calls } = createHarness({ reconciledUser: paidUser });
    const result = await activate(activationInput(plan));
    assert.equal(result.ok, true);
    assert.equal(result.user.plan, plan);
    assert.equal(result.user.dailyLimit, daily);
    assert.equal(calls.inserts.length, 1);
    assert.equal(calls.inserts[0].status, "success");
    assert.equal(calls.inserts[0].amountPaise, plan === "pro" ? 100 : 200);
    assert.equal(monthly, plan === "pro" ? 200 : 450);
  }
});

test("duplicate valid payment with active entitlement returns idempotent success", async () => {
  const { activate, calls } = createHarness({ duplicate: true, durableUser: makeUser("pro") });
  const result = await activate(activationInput("pro"));
  assert.equal(result.ok, true);
  assert.equal(calls.updates, 0);
  assert.equal(calls.inserts.length, 0);
});

test("duplicate valid payment with missing entitlement retries activation without another charge or payment row", async () => {
  const { activate, calls } = createHarness({ duplicate: true, durableUser: makeUser("free"), reconciledUser: makeUser("pro") });
  const result = await activate(activationInput("pro"));
  assert.equal(result.ok, true);
  assert.equal(calls.updates, 1);
  assert.equal(calls.inserts.length, 0);
  assert.equal(calls.localUpgrades, 0);
});

test("duplicate reconciliation failure leaves the durable user Free and reports failure", async () => {
  const freeUser = makeUser("free");
  const { activate, calls } = createHarness({ duplicate: true, durableUser: freeUser, reconciledUser: null });
  const result = await activate(activationInput("pro"));
  assert.equal(result.ok, false);
  assert.equal(freeUser.plan, "free");
  assert.equal(calls.inserts.length, 0);
});

test("sva_users activation avoids duplicate quota authority and confirms all durable entitlement tables", () => {
  const source = read("lib/server/supabase-plan.ts");
  const userPayload = source.match(/const userPayload = \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  assert.doesNotMatch(userPayload, /daily_limit|monthly_limit|active_verifications/);
  assert.match(source, /from\("subscriptions"\)\.select\("plan, status"\)/);
  assert.match(source, /from\("usage_balances"\)\.select\("plan, daily_limit, monthly_limit"\)/);
  assert.match(source, /confirmedSubscription\.data\?\.status === "active"/);
  assert.match(source, /confirmedBalance\.data\?\.daily_limit === planConfig\.dailyVerificationLimit/);
  assert.match(source, /confirmedBalance\.data\?\.monthly_limit === planConfig\.monthlyVerificationLimit/);
  assert.ok(source.indexOf('from("usage_balances").upsert') < source.indexOf(".update(userPayload)"));
});

test("reconciliation path contains no Razorpay charge or order creation capability", () => {
  const source = read("lib/server/payment-upgrade.ts");
  assert.doesNotMatch(source, /new Razorpay|orders\.create|payments\.capture|paymentLink/);
  assert.match(source, /duplicate payment entitlement reconciliation failed/);
  assert.match(source, /do not pay again/i);
});
