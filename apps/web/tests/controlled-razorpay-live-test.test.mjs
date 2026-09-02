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
  const factory = vm.runInNewContext(`(function (require, module, exports) { ${compiled}\n})`, { process, Buffer });
  factory(requireModule, module, module.exports);
  return module.exports;
};

const plansModule = compileModule(read("lib/plans.ts"), () => {
  throw new Error("Unexpected plans dependency");
});
const razorpayModule = compileModule(read("lib/server/razorpay.ts"), (specifier) => {
  if (specifier === "crypto") return {};
  if (specifier === "../plans") return plansModule;
  throw new Error(`Unexpected dependency: ${specifier}`);
});

const {
  CONTROLLED_LIVE_TEST_PRICING_CONTEXT,
  RAZORPAY_PLAN_PRICES,
  resolveRazorpayPriceForUser,
  validateRazorpayOrderPricing
} = razorpayModule;

const envNames = [
  "RAZORPAY_CONTROLLED_LIVE_TEST_ENABLED",
  "RAZORPAY_CONTROLLED_LIVE_TEST_EMAIL",
  "RAZORPAY_CONTROLLED_LIVE_TEST_EXPIRES_AT"
];
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const resetEnv = () => {
  for (const name of envNames) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
};
const enableControlledPricing = () => {
  process.env.RAZORPAY_CONTROLLED_LIVE_TEST_ENABLED = "true";
  process.env.RAZORPAY_CONTROLLED_LIVE_TEST_EMAIL = "owner@example.com";
  process.env.RAZORPAY_CONTROLLED_LIVE_TEST_EXPIRES_AT = "2035-01-01T00:00:00.000Z";
};
const notes = (overrides = {}) => ({
  user_id: "user-123",
  user_email: "owner@example.com",
  plan: "pro",
  pricing_context: CONTROLLED_LIVE_TEST_PRICING_CONTEXT,
  ...overrides
});

test.after(resetEnv);

test("controlled pricing is available only to the enabled, unexpired allowlisted account", () => {
  enableControlledPricing();
  assert.equal(resolveRazorpayPriceForUser("pro", "owner@example.com", Date.parse("2030-01-01")).amount, 100);
  assert.equal(resolveRazorpayPriceForUser("ultra", "OWNER@example.com", Date.parse("2030-01-01")).amount, 200);
  assert.equal(resolveRazorpayPriceForUser("pro", "other@example.com", Date.parse("2030-01-01")).amount, 79900);

  process.env.RAZORPAY_CONTROLLED_LIVE_TEST_ENABLED = "false";
  assert.equal(resolveRazorpayPriceForUser("pro", "owner@example.com", Date.parse("2030-01-01")).amount, 79900);
  delete process.env.RAZORPAY_CONTROLLED_LIVE_TEST_ENABLED;
  assert.equal(resolveRazorpayPriceForUser("ultra", "owner@example.com", Date.parse("2030-01-01")).amount, 129900);

  enableControlledPricing();
  process.env.RAZORPAY_CONTROLLED_LIVE_TEST_EXPIRES_AT = "2020-01-01T00:00:00.000Z";
  assert.equal(resolveRazorpayPriceForUser("pro", "owner@example.com", Date.parse("2030-01-01")).amount, 79900);
  process.env.RAZORPAY_CONTROLLED_LIVE_TEST_EXPIRES_AT = "not-a-date";
  assert.equal(resolveRazorpayPriceForUser("pro", "owner@example.com", Date.parse("2030-01-01")).amount, 79900);
});

test("controlled order validation rejects missing or mismatched server authority", () => {
  enableControlledPricing();
  const base = {
    plan: "pro",
    authenticatedUserId: "user-123",
    authenticatedEmail: "owner@example.com",
    amount: 100,
    currency: "INR",
    notes: notes(),
    nowMs: Date.parse("2030-01-01")
  };

  const valid = validateRazorpayOrderPricing(base);
  assert.equal(valid.ok, true);
  assert.equal(valid.amount, 100);
  assert.equal(valid.pricingContext, CONTROLLED_LIVE_TEST_PRICING_CONTEXT);
  assert.equal(validateRazorpayOrderPricing({ ...base, notes: notes({ pricing_context: undefined }) }).ok, false);
  assert.equal(validateRazorpayOrderPricing({ ...base, authenticatedUserId: "wrong-user" }).ok, false);
  assert.equal(validateRazorpayOrderPricing({ ...base, plan: "ultra" }).ok, false);
  assert.equal(validateRazorpayOrderPricing({ ...base, amount: 200 }).ok, false);
  assert.equal(validateRazorpayOrderPricing({ ...base, currency: "USD" }).ok, false);
});

test("normal production pricing and plan entitlements remain unchanged", () => {
  delete process.env.RAZORPAY_CONTROLLED_LIVE_TEST_ENABLED;
  assert.equal(RAZORPAY_PLAN_PRICES.pro.amount, 79900);
  assert.equal(RAZORPAY_PLAN_PRICES.ultra.amount, 129900);
  assert.equal(plansModule.SVA_PLANS.pro.dailyVerificationLimit, 8);
  assert.equal(plansModule.SVA_PLANS.pro.monthlyVerificationLimit, 200);
  assert.equal(plansModule.SVA_PLANS.ultra.dailyVerificationLimit, 15);
  assert.equal(plansModule.SVA_PLANS.ultra.monthlyVerificationLimit, 450);
});

test("routes enforce controlled metadata, actual amount persistence, and canonical renewals", () => {
  const createOrder = read("app/api/payments/razorpay/create-order/route.ts");
  const verify = read("app/api/payments/razorpay/verify/route.ts");
  const webhook = read("app/api/payments/razorpay/webhook/route.ts");
  const activation = read("lib/server/payment-upgrade.ts");
  const payments = read("lib/server/payments.ts");

  assert.match(createOrder, /pricing_context: price\.pricingContext/);
  assert.doesNotMatch(createOrder, /body\.(amount|currency|price|pricing_context|test)/);
  assert.match(verify, /razorpay\.orders\.fetch\(orderId\)/);
  assert.match(verify, /paymentAmountPaise: validatedAmount/);
  assert.match(webhook, /requiresAuthoritativeOrder/);
  assert.match(webhook, /validateRazorpayOrderPricing/);
  assert.match(webhook, /paymentAmountPaise: pricing\.amount/);
  assert.match(webhook, /const expectedPrice = RAZORPAY_PLAN_PRICES\[plan\]/);
  assert.match(webhook, /amount !== expectedPrice\.amount \|\| currency !== "INR"/);
  assert.match(activation, /amountPaise: paymentAmountPaise/g);
  assert.match(payments, /amount: Number\.isInteger\(input\.amountPaise\)/);
});

test("controlled switches are server-only and documented without an allowlisted value", () => {
  const envExample = read(".env.example");
  const manifest = read("lib/server/env-manifest.ts");
  for (const name of envNames) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
    assert.match(manifest, new RegExp(`name: "${name}"[\\s\\S]{0,220}clientVisible: false`));
    assert.doesNotMatch(name, /^NEXT_PUBLIC_/);
  }
  assert.match(envExample, /^RAZORPAY_CONTROLLED_LIVE_TEST_EMAIL=$/m);
});
