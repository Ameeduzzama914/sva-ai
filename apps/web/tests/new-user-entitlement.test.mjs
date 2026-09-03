import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const compileModule = (source, requireModule, context = {}) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  const factory = vm.runInNewContext(`(function (require, module, exports) { ${compiled}\n})`, context);
  factory(requireModule, module, module.exports);
  return module.exports;
};

const supabaseAdminSource = read("lib/server/supabase-admin.ts");
const supabasePlanSource = read("lib/server/supabase-plan.ts");
const clientAuthSource = read("lib/client-auth.ts");
const dashboardSource = read("components/saas-dashboard.tsx");
const oauthRoute = read("app/api/auth/oauth/session/route.ts");
const loginRoute = read("app/api/auth/login/route.ts");
const paymentUpgrade = read("lib/server/payment-upgrade.ts");

const supabaseAdmin = compileModule(supabaseAdminSource, (specifier) => {
  if (specifier === "@supabase/supabase-js") return { createClient: () => null };
  if (specifier === "../plans") {
    return { getSvaPlan: (plan) => ({ dailyVerificationLimit: plan === "ultra" ? 15 : plan === "pro" ? 8 : 2, monthlyVerificationLimit: plan === "ultra" ? 450 : plan === "pro" ? 200 : 30 }) };
  }
  if (specifier === "./store") return {};
  throw new Error(`Unexpected dependency: ${specifier}`);
}, { console, process });

test("email relinking preserves only a matching active durable paid entitlement", () => {
  const resolve = supabaseAdmin.resolveEmailRelinkPlan;
  assert.equal(resolve("pro", { plan: "pro", status: "active" }), "pro");
  assert.equal(resolve("ultra", { plan: "ultra", status: "active" }), "ultra");
  assert.equal(resolve("pro", null), "free");
  assert.equal(resolve("ultra", { plan: "ultra", status: "inactive" }), "free");
  assert.equal(resolve("pro", { plan: "ultra", status: "active" }), "free");
});

test("valid cancellation-at-period-end access is preserved only before period expiry", () => {
  const resolve = supabaseAdmin.resolveEmailRelinkPlan;
  assert.equal(resolve("pro", { plan: "pro", status: "cancel_at_period_end", current_period_end: "2035-01-01T00:00:00.000Z" }, Date.parse("2030-01-01")), "pro");
  assert.equal(resolve("pro", { plan: "pro", status: "cancel_at_period_end", current_period_end: "2025-01-01T00:00:00.000Z" }, Date.parse("2030-01-01")), "free");
});

test("new OAuth and email-password users enter the same durable Free initializer", () => {
  assert.match(oauthRoute, /ensureSupabaseUser\(authUser\.id, authUser\.email\)/);
  assert.match(loginRoute, /ensureSupabaseUser\(supabaseLogin\.user\.id, email\)/);
  assert.match(supabaseAdminSource, /const plan: UserPlan = "free"/);
  assert.match(supabaseAdminSource, /user_id: userId,[\s\S]*?plan,[\s\S]*?credits_remaining: planConfig\.dailyVerificationLimit/);
});

test("new Free users receive durable 2/day and 30/billing-period authority", () => {
  assert.match(supabaseAdminSource, /from\("usage_balances"\)\.upsert/);
  assert.match(supabaseAdminSource, /plan: "free"/);
  assert.match(supabaseAdminSource, /daily_limit: planConfig\.dailyVerificationLimit/);
  assert.match(supabaseAdminSource, /monthly_limit: planConfig\.monthlyVerificationLimit/);
  const plans = read("lib/plans.ts");
  assert.match(plans, /free:[\s\S]*?dailyVerificationLimit: 2[\s\S]*?monthlyVerificationLimit: 30/);
});

test("no server or browser email identity automatically grants a paid plan", () => {
  assert.doesNotMatch(supabaseAdminSource, /mohammed\.ameeduzzama|FOUNDER_EMAIL/);
  assert.doesNotMatch(supabasePlanSource, /mohammed\.ameeduzzama|FOUNDER_EMAIL/);
  assert.doesNotMatch(clientAuthSource, /mohammed\.ameeduzzama|FOUNDER_EMAIL|isFounderEmail/);
});

test("browser localStorage cannot grant Pro or Ultra access", () => {
  const storage = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  };
  const clientAuth = compileModule(clientAuthSource, (specifier) => {
    if (specifier === "./plans") return { SVA_PLANS: { free: { dailyVerificationLimit: 2 }, pro: { dailyVerificationLimit: 8 }, ultra: { dailyVerificationLimit: 15 } } };
    throw new Error(`Unexpected dependency: ${specifier}`);
  }, { window: {}, localStorage, Date, JSON });

  for (const plan of ["pro", "ultra"]) {
    storage.set("sva_session", JSON.stringify({ email: "new@example.com", plan, planVerified: true, createdAt: "2026-01-01T00:00:00.000Z" }));
    assert.equal(clientAuth.getSession().plan, "free");
  }
});

test("dashboard plan synchronization fails closed to Free", () => {
  assert.match(dashboardSource, /setDisplayPlan\("free"\)/);
  assert.doesNotMatch(dashboardSource, /setDisplayPlan\(session\?\.plan \?\? "free"\)/);
});

test("valid Razorpay Pro and Ultra activation remains unchanged", () => {
  assert.match(paymentUpgrade, /updateSupabasePaidPlanByEmail\(user\.email, plan\)/);
  assert.match(paymentUpgrade, /supabaseUser\?\.plan === plan/);
  assert.match(paymentUpgrade, /amountPaise: paymentAmountPaise/);
  const activationTests = read("tests/razorpay-entitlement-activation.test.mjs");
  assert.match(activationTests, /durably confirmed Pro and Ultra activation persists success with unchanged quotas/);
  assert.match(activationTests, /\["pro", 8, 200\], \["ultra", 15, 450\]/);
});
