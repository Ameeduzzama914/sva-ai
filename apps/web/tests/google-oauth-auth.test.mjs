import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const googleButton = read("components/google-auth-button.tsx");
const browserAuth = read("lib/supabase-browser.ts");
const callbackPage = read("app/auth/callback/page.tsx");
const sessionRoute = read("app/api/auth/oauth/session/route.ts");

test("login and signup offer Google without replacing email-password forms", () => {
  for (const path of ["app/login/page.tsx", "app/signup/page.tsx"]) {
    const page = read(path);
    assert.match(page, /GoogleAuthButton/);
    assert.match(page, /type="password"/);
  }
  assert.match(googleButton, /Continue with Google/);
});

test("Google OAuth uses Supabase PKCE and the canonical callback URL", () => {
  assert.match(googleButton, /signInWithOAuth\(\{/);
  assert.match(googleButton, /provider: "google"/);
  assert.match(browserAuth, /flowType: "pkce"/);
  assert.match(browserAuth, /NEXT_PUBLIC_SITE_URL/);
  assert.match(browserAuth, /\/auth\/callback/);
});

test("OAuth callback validates the Supabase token server-side before creating an SVA session", () => {
  assert.match(callbackPage, /exchangeCodeForSession\(code\)/);
  assert.match(callbackPage, /\/api\/auth\/oauth\/session/);
  assert.match(sessionRoute, /auth\.getUser\(accessToken\)/);
  assert.match(sessionRoute, /isSupabaseEmailVerified\(authUser\)/);
  assert.match(sessionRoute, /ensureSupabaseUser\(authUser\.id, authUser\.email\)/);
  assert.match(sessionRoute, /setAuthCookie\(response, authUser\.id\)/);
});

test("successful Google OAuth preserves plan intent and enters the normal SVA experience", () => {
  assert.match(callbackPage, /setSession\(\{/);
  assert.match(callbackPage, /getPlanIntent\(\)/);
  assert.match(callbackPage, /"\/billing" : "\/app"/);
});
