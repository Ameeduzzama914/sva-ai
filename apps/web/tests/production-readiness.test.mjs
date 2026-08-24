import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const readinessSql = read("../../supabase/production-readiness-check.sql");
const envManifest = read("lib/server/env-manifest.ts");
const envHealthRoute = read("app/api/admin/env-health/route.ts");
const smokeScript = read("scripts/production-smoke-test.mjs");
const runbook = read("../../docs/FINAL_LAUNCH_RUNBOOK.md");

test("production readiness SQL is read-only and checks launch-critical structures", () => {
  const executableSql = readinessSql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(executableSql, /\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i);
  assert.match(readinessSql, /sva_users/);
  assert.match(readinessSql, /subscriptions/);
  assert.match(readinessSql, /usage_balances/);
  assert.match(readinessSql, /verification_reservations/);
  assert.match(readinessSql, /provider_usage/);
  assert.match(readinessSql, /webhook_events/);
  assert.match(readinessSql, /admin_alerts/);
  assert.match(readinessSql, /payments/);
  assert.match(readinessSql, /sva_reserve_verification/);
  assert.match(readinessSql, /sva_finalize_verification/);
  assert.match(readinessSql, /sva_refund_verification/);
  assert.match(readinessSql, /cancel_at_period_end/);
  assert.match(readinessSql, /synthesis_retry/);
  assert.match(readinessSql, /already_reserved/);
});

test("environment manifest documents required production variables without public server secrets", () => {
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SVA_SESSION_SECRET",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "OPENROUTER_API_KEY",
    "SVA_GPT_PRIMARY",
    "SVA_GEMINI_PRIMARY",
    "SVA_DEEPSEEK_PRIMARY",
    "SVA_SYNTHESIS_PRIMARY",
    "ADMIN_EMAIL",
    "NEXT_PUBLIC_ADMIN_EMAIL"
  ]) {
    assert.match(envManifest, new RegExp(`name: "${name}"`));
  }

  assert.doesNotMatch(envManifest, /NEXT_PUBLIC_(SUPABASE_SERVICE_ROLE_KEY|RAZORPAY_KEY_SECRET|OPENROUTER_API_KEY|OPENROUTER_MANAGEMENT_KEY|SVA_SESSION_SECRET)/);
});

test("admin env health is server-authorized and reports configured booleans only", () => {
  assert.match(envHealthRoute, /requireAdminSession\(request\)/);
  assert.match(envHealthRoute, /getEnvironmentHealth/);
  assert.match(envManifest, /configured: configured\(variable\.name\)/);
  assert.doesNotMatch(envManifest, /value:/);
});

test("production smoke script is non-destructive and documented", () => {
  assert.match(smokeScript, /auth me rejects unauthenticated/);
  assert.match(smokeScript, /admin health protected/);
  assert.match(smokeScript, /admin env health protected/);
  assert.match(smokeScript, /SVA_SMOKE_SESSION_COOKIE/);
  assert.doesNotMatch(smokeScript, /razorpay|payment|charge/i);
  assert.doesNotMatch(smokeScript, /OPENROUTER_API_KEY|RAZORPAY_KEY_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(runbook, /node scripts\/production-smoke-test\.mjs/);
});
