#!/usr/bin/env node
const baseUrl = process.argv[2] || process.env.SVA_PRODUCTION_URL || process.env.NEXT_PUBLIC_SITE_URL;
const sessionCookie = process.env.SVA_SMOKE_SESSION_COOKIE;

if (!baseUrl) {
  console.error("Usage: node scripts/production-smoke-test.mjs https://your-production-domain");
  console.error("Optional: set SVA_SMOKE_SESSION_COOKIE to run authenticated admin checks without hard-coding credentials.");
  process.exit(2);
}

const base = new URL(baseUrl);
const checks = [
  { name: "home", path: "/", expect: [200] },
  { name: "login", path: "/login", expect: [200] },
  { name: "signup", path: "/signup", expect: [200] },
  { name: "pricing", path: "/pricing", expect: [200] },
  { name: "auth me rejects unauthenticated", path: "/api/auth/me", expect: [401] },
  { name: "provider status exists", path: "/api/provider-status", expect: [200] },
  { name: "admin health protected", path: "/api/admin/health", expect: [401, 403] },
  { name: "admin env health protected", path: "/api/admin/env-health", expect: [401, 403] }
];

if (sessionCookie) {
  checks.push(
    { name: "admin health authenticated", path: "/api/admin/health", expect: [200], cookie: sessionCookie },
    { name: "admin env health authenticated", path: "/api/admin/env-health", expect: [200], cookie: sessionCookie }
  );
}

let failed = 0;

for (const check of checks) {
  const url = new URL(check.path, base);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: check.cookie ? { Cookie: check.cookie } : undefined,
      redirect: "manual"
    });
    const ok = check.expect.includes(response.status);
    const elapsed = Date.now() - started;
    console.log(`${ok ? "PASS" : "FAIL"} ${check.name} ${response.status} ${elapsed}ms ${url.pathname}`);
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${check.name} request_error ${url.pathname} ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

if (!sessionCookie) {
  console.log("INFO authenticated admin smoke checks skipped; set SVA_SMOKE_SESSION_COOKIE with a safe test-session cookie to run them.");
}

process.exit(failed === 0 ? 0 : 1);
