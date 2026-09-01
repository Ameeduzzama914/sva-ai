import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const signupRoute = read("app/api/auth/signup/route.ts");
const loginRoute = read("app/api/auth/login/route.ts");
const verifyRoute = read("app/api/auth/verify-email/route.ts");
const resendRoute = read("app/api/auth/resend-email-otp/route.ts");
const authHelper = read("lib/server/auth.ts");
const supabaseAuth = read("lib/server/supabase-auth.ts");
const appPage = read("app/app/page.tsx");
const verifyApi = read("app/api/verify/route.ts");
const logoutRoute = read("app/api/auth/logout/route.ts");
const supabaseAdmin = read("lib/server/supabase-admin.ts");
const svaUsersAuthMigration = read("../../supabase/migrations/20260813_0001_sva_users_auth_schema.sql");

test("signup creates Supabase Auth user and enters verification-required state", () => {
  assert.match(signupRoute, /signUpWithEmailPassword\(email, password\)/);
  assert.match(signupRoute, /verificationRequired: true/);
  assert.doesNotMatch(signupRoute, /cookies\.set\(AUTH_COOKIE/);
});

test("valid OTP verification uses Supabase verifyOtp and then creates SVA session", () => {
  assert.match(supabaseAuth, /verifyOtp\(\{ email, token, type: "email" \}\)/);
  assert.match(verifyRoute, /verifySignupEmailOtp\(email, otp\)/);
  assert.match(verifyRoute, /ensureSupabaseUser\(verified\.user\.id, email\)/);
  assert.match(verifyRoute, /setAuthCookie\(response, verified\.user\.id\)/);
});

test("invalid or expired OTP is rejected without session cookie", () => {
  assert.match(verifyRoute, /invalid or expired/i);
  const failureBlock = verifyRoute.slice(verifyRoute.indexOf("if (!verified.ok)"), verifyRoute.indexOf("const existing"));
  assert.doesNotMatch(failureBlock, /setAuthCookie/);
});

test("resend flow uses Supabase signup resend and returns generic email-safe message", () => {
  assert.match(supabaseAuth, /auth\.resend\(\{ type: "signup", email \}\)/);
  assert.match(resendRoute, /If that email is waiting for verification/);
});

test("unverified users cannot pass shared server auth", () => {
  assert.match(authHelper, /getSupabaseAuthUserById\(userId\)/);
  assert.match(authHelper, /!isSupabaseEmailVerified\(supabaseAuthUser\)/);
  assert.match(authHelper, /readSessionUserId/);
});

test("unverified users cannot trigger OpenRouter-backed verification", () => {
  assert.match(verifyApi, /getAuthenticatedUser\(request\)/);
  assert.match(verifyApi, /Please login first/);
  assert.ok(verifyApi.indexOf("getAuthenticatedUser(request)") < verifyApi.indexOf("await withTimeout(buildResponsesForPrompt"));
});

test("verified users can continue email-password login normally", () => {
  assert.match(loginRoute, /signInWithEmailPassword\(email, password\)/);
  assert.match(loginRoute, /ensureSupabaseUser\(supabaseLogin\.user\.id, email\)/);
  assert.match(loginRoute, /setAuthCookie\(response, supabaseLogin\.user\.id\)/);
  assert.match(loginRoute, /verifyUserCredentials/);
});

test("email-password backend still reports verification-required state", () => {
  assert.match(loginRoute, /emailConfirmationRequired/);
  assert.match(loginRoute, /verificationRequired: true/);
});

test("retained email verification screen does not create an auth redirect loop", () => {
  assert.match(appPage, /\/api\/auth\/me/);
  assert.match(appPage, /router\.replace\("\/login"\)/);
  assert.doesNotMatch(read("app/verify-email/page.tsx"), /router\.replace\("\/login"\)/);
});

test("production session is durable and linked to the Supabase Auth UUID", () => {
  assert.match(supabaseAdmin, /from\("sva_users"\)\.insert/);
  assert.match(supabaseAdmin, /user_id: userId/);
  assert.match(authHelper, /fetchPublicUserByIdFromSupabase\(userId\)/);
  assert.match(authHelper, /ensureSupabaseUser\(userId, supabaseAuthUser\.email\)/);
});

test("sva_users schema supports every field used by auth linkage and session restoration", () => {
  for (const column of [
    "user_id", "email", "plan", "status", "usage_count", "daily_usage", "monthly_usage",
    "credits_remaining", "credits_reset_at", "onboarding_completed", "created_at", "updated_at"
  ]) {
    assert.match(svaUsersAuthMigration, new RegExp(`add column if not exists ${column}\\b`));
  }
  assert.match(svaUsersAuthMigration, /notify pgrst, 'reload schema'/);
});

test("session cookie is signed and has production-safe redirect attributes", () => {
  assert.match(authHelper, /createHmac\("sha256"/);
  assert.match(authHelper, /httpOnly: true/);
  assert.match(authHelper, /sameSite: "lax"/);
  assert.match(authHelper, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(authHelper, /path: "\/"/);
  assert.match(authHelper, /maxAge: AUTH_COOKIE_MAX_AGE/);
});

test("logout clears the same authenticated session cookie", () => {
  assert.match(logoutRoute, /clearAuthCookie\(response\)/);
  assert.match(authHelper, /maxAge: 0/);
});

test("app checks the server session even when browser-local state is absent", () => {
  assert.match(appPage, /fetch\("\/api\/auth\/me", \{ credentials: "include" \}\)/);
  assert.doesNotMatch(appPage, /if \(!session\) \{[\s\S]*?router\.replace\("\/login"\)/);
});

