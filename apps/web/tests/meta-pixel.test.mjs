import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const pixel = read("components/meta-pixel.tsx");
const pixelClient = read("lib/meta-pixel.ts");
const layout = read("app/layout.tsx");
const verification = read("app/verify-email/page.tsx");
const checkout = read("components/RazorpayCheckoutButton.tsx");
const oauthCallback = read("app/auth/callback/page.tsx");
const oauthSession = read("app/api/auth/oauth/session/route.ts");
const supabaseAdmin = read("lib/server/supabase-admin.ts");

test("Meta Pixel is rooted once and loads only after explicit consent", () => {
  assert.match(layout, /<MetaPixel \/>/);
  assert.match(pixel, /consent === "granted"/);
  assert.match(pixel, /strategy="afterInteractive"/);
  assert.match(pixelClient, /1993876124619806/);
});

test("PageView tracks URL changes with a duplicate guard", () => {
  assert.match(pixel, /usePathname\(\)/);
  assert.match(pixel, /shouldTrackMetaPageView\(pathname\)/);
  assert.match(pixel, /lastPageView\.current === pathname/);
  assert.match(pixel, /window\.fbq\("track", "PageView"\)/);
});

test("PageView excludes private and query-bearing routes", () => {
  assert.match(pixelClient, /PUBLIC_PAGEVIEW_PATHS/);
  assert.match(pixelClient, /window\.location\.search === ""/);
  for (const privateRoute of ["/app", "/admin", "/billing", "/nexus", "/verify-email", "/auth/callback"]) {
    const pageViewAllowlist = pixelClient.slice(pixelClient.indexOf("PUBLIC_PAGEVIEW_PATHS"), pixelClient.indexOf("]);", pixelClient.indexOf("PUBLIC_PAGEVIEW_PATHS")));
    assert.doesNotMatch(pageViewAllowlist, new RegExp(`"${privateRoute}"`));
  }
});

test("registration tracks only after successful OTP verification", () => {
  assert.match(verification, /if \(response\.ok && data\.ok && data\.user\) \{ finish\(data\.user\); return; \}/);
  assert.match(verification, /const finish =[\s\S]*queueMetaCompleteRegistration\(\)/);
  assert.match(pixel, /flushMetaCompleteRegistration\(\)/);
  assert.doesNotMatch(read("app/signup/page.tsx"), /CompleteRegistration/);
});

test("Google registration uses a server-authoritative new-user signal", () => {
  assert.match(supabaseAdmin, /ensureSupabaseUserWithStatus/);
  assert.match(supabaseAdmin, /created: true/);
  assert.match(supabaseAdmin, /created: false/);
  assert.match(oauthSession, /registrationCompleted: ensured\.created/);
  assert.match(oauthCallback, /if \(data\.registrationCompleted\) queueMetaCompleteRegistration\(\)/);
});

test("purchase tracks only after verified payment success and excludes sensitive fields", () => {
  assert.ok(checkout.indexOf("!verifyResponse.ok || !verified.ok || !verified.user") < checkout.indexOf('trackMetaEvent("Purchase"'));
  const eventBlock = checkout.slice(checkout.indexOf('trackMetaEvent("Purchase"'), checkout.indexOf("onSuccess?.", checkout.indexOf('trackMetaEvent("Purchase"')));
  assert.doesNotMatch(eventBlock, /email|password|razorpay_payment_id|razorpay_order_id|signature|prompt|response/i);
  assert.match(eventBlock, /value: verifiedOrderAmount \/ 100/);
  assert.match(eventBlock, /currency: verifiedOrderCurrency/);
  assert.match(checkout, /&& trackMetaEvent\("Purchase"/);
});

