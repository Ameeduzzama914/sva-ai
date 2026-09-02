import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const compileModule = (source) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function (module, exports) { ${compiled}\n})`)(module, module.exports);
  return module.exports;
};

const reconciliation = compileModule(read("lib/server/razorpay-reconciliation.ts"));
const route = read("app/api/admin/razorpay/reconcile-pro-test/route.ts");
const expectedUser = { userId: "user-123", email: "owner@example.com" };
const payment = { id: "pay_TX8Ih5tVa40U6N", order_id: "order-123", status: "captured", amount: 100, currency: "INR" };
const order = {
  id: "order-123",
  status: "paid",
  amount: 100,
  currency: "INR",
  notes: { plan: "pro", pricing_context: "controlled_live_test_v1", user_email: "owner@example.com", user_id: "user-123" }
};
const existingPayment = {
  razorpay_payment_id: "pay_TX8Ih5tVa40U6N",
  razorpay_order_id: "order-123",
  user_id: "user-123",
  email: "owner@example.com",
  plan: "pro",
  amount: 100,
  currency: "INR",
  status: "success"
};
const validate = (overrides = {}) => reconciliation.validateHistoricalControlledProPayment({
  payment,
  order,
  expectedUser,
  expectedEmail: "owner@example.com",
  existingPayments: [existingPayment],
  ...overrides
});

test("historical reconciliation accepts only the exact captured controlled Pro payment", () => {
  const valid = validate();
  assert.equal(valid.ok, true);
  assert.equal(valid.orderId, "order-123");
  assert.equal(validate({ payment: { ...payment, id: "pay_other" } }).ok, false);
  assert.equal(validate({ payment: { ...payment, status: "authorized" } }).ok, false);
  assert.equal(validate({ payment: { ...payment, amount: 200 } }).ok, false);
  assert.equal(validate({ payment: { ...payment, currency: "USD" } }).ok, false);
});

test("historical reconciliation validates order ownership and controlled metadata", () => {
  assert.equal(validate({ order: { ...order, id: "order_other" } }).ok, false);
  assert.equal(validate({ order: { ...order, amount: 79900 } }).ok, false);
  assert.equal(validate({ order: { ...order, currency: "USD" } }).ok, false);
  assert.equal(validate({ order: { ...order, notes: { ...order.notes, plan: "ultra" } } }).ok, false);
  assert.equal(validate({ order: { ...order, notes: { ...order.notes, pricing_context: "standard" } } }).ok, false);
  assert.equal(validate({ order: { ...order, notes: { ...order.notes, user_email: "other@example.com" } } }).ok, false);
  assert.equal(validate({ order: { ...order, notes: { ...order.notes, user_id: "other-user" } } }).ok, false);
});

test("historical reconciliation requires one matching existing payment row", () => {
  assert.equal(validate({ existingPayments: [] }).ok, false);
  assert.equal(validate({ existingPayments: [existingPayment, existingPayment] }).ok, false);
  assert.equal(validate({ existingPayments: [{ ...existingPayment, amount: 79900 }] }).ok, false);
  assert.equal(validate({ existingPayments: [{ ...existingPayment, razorpay_order_id: "order_other" }] }).ok, false);
});

test("temporary endpoint is admin-only, fixed-purpose, idempotent, and has no charge capability", () => {
  assert.match(route, /requireAdminSession\(request\)/);
  assert.match(route, /RECONCILIATION_CONFIRMATION/);
  assert.match(route, /razorpay\.payments\.fetch\(RECONCILIATION_PAYMENT_ID\)/);
  assert.match(route, /razorpay\.orders\.fetch\(orderId\)/);
  assert.match(route, /activatePaidPlanAfterPayment/);
  assert.match(route, /paymentHistoryRowsAdded: 0/);
  assert.doesNotMatch(route, /isControlledLiveTestPricingEligible|RAZORPAY_CONTROLLED_LIVE_TEST_EXPIRES_AT/);
  assert.doesNotMatch(route, /orders\.create|payments\.capture|payments\.refund|paymentLink|subscriptions\.create|checkout/);
  assert.equal(reconciliation.RECONCILIATION_PAYMENT_ID, "pay_TX8Ih5tVa40U6N");
  assert.equal(reconciliation.RECONCILIATION_PLAN, "pro");
  assert.equal(reconciliation.RECONCILIATION_AMOUNT_PAISE, 100);
});

test("temporary endpoint requires durable Pro state and unchanged payment-row count", () => {
  assert.match(route, /userResult\.data\?\.plan === "pro"/);
  assert.match(route, /subscriptionResult\.data\?\.status === "active"/);
  assert.match(route, /balanceResult\.data\?\.daily_limit === 8/);
  assert.match(route, /balanceResult\.data\?\.monthly_limit === 200/);
  assert.match(route, /after\.data \?\? \[\]\)\.length === \(before\.data \?\? \[\]\)\.length/);
});
