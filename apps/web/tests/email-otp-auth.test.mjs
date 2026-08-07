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
const signupPage = read("app/signup/page.tsx");
const verifyApi = read("app/api/verify/route.ts");

test("signup creates Supabase Auth user and enters verification-required state", () => {
  assert.match(signupRoute, /signUpWithEmailPassword\(email, password\)/);
  assert.match(signupRoute, /verificationRequired: true/);
  assert.doesNotMatch(signupRoute, /cookies\.set\(AUTH_COOKIE/);
});

test("valid OTP verification uses Supabase verifyOtp and then creates SVA session", () => {
  assert.match(supabaseAuth, /verifyOtp\(\{ email, token, type: "email" \}\)/);
  assert.match(verifyRoute, /verifySignupEmailOtp\(email, otp\)/);
  assert.match(verifyRoute, /cookies\.set\(AUTH_COOKIE/);
});

test("invalid or expired OTP is rejected without session cookie", () => {
  assert.match(verifyRoute, /invalid or expired/i);
  const failureBlock = verifyRoute.slice(verifyRoute.indexOf("if (!verified.ok)"), verifyRoute.indexOf("const existing"));
  assert.doesNotMatch(failureBlock, /cookies\.set/);
});

test("resend flow uses Supabase signup resend and returns generic email-safe message", () => {
  assert.match(supabaseAuth, /auth\.resend\(\{ type: "signup", email \}\)/);
  assert.match(resendRoute, /If that email is waiting for verification/);
});

test("unverified users cannot pass shared server auth", () => {
  assert.match(authHelper, /getSupabaseAuthUserById\(userId\)/);
  assert.match(authHelper, /!isSupabaseEmailVerified\(supabaseAuthUser\)/);
  assert.match(authHelper, /return null/);
});

test("unverified users cannot trigger OpenRouter-backed verification", () => {
  assert.match(verifyApi, /getAuthenticatedUser\(request\)/);
  assert.match(verifyApi, /Please login first/);
  assert.ok(verifyApi.indexOf("getAuthenticatedUser(request)") < verifyApi.indexOf("await withTimeout(buildResponsesForPrompt"));
});

test("verified users can continue email-password login normally", () => {
  assert.match(loginRoute, /signInWithEmailPassword\(email, password\)/);
  assert.match(loginRoute, /cookies\.set\(AUTH_COOKIE/);
  assert.match(loginRoute, /verifyUserCredentials/);
});

test("unverified login redirects to email verification instead of app", () => {
  assert.match(loginRoute, /emailConfirmationRequired/);
  assert.match(loginRoute, /verificationRequired: true/);
  assert.match(read("app/login/page.tsx"), /\/verify-email\?email=/);
});

test("auth redirects avoid loops by keeping signup separate from verification screen", () => {
  assert.match(signupPage, /\/verify-email\?email=/);
  assert.match(appPage, /\/api\/auth\/me/);
  assert.match(appPage, /router\.replace\("\/login"\)/);
  assert.doesNotMatch(read("app/verify-email/page.tsx"), /router\.replace\("\/login"\)/);
});

