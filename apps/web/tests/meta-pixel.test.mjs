import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const pixel = read("components/meta-pixel.tsx");
const pixelClient = read("lib/meta-pixel.ts");
const layout = read("app/layout.tsx");
const verification = read("app/verify-email/page.tsx");
const checkout = read("components/RazorpayCheckoutButton.tsx");
const paymentVerification = read("app/api/payments/razorpay/verify/route.ts");
const oauthCallback = read("app/auth/callback/page.tsx");
const oauthSession = read("app/api/auth/oauth/session/route.ts");
const supabaseAdmin = read("lib/server/supabase-admin.ts");

const compilePixelClient = (windowValue) => {
  const compiled = ts.transpileModule(pixelClient, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function (module, exports) { ${compiled}\n})`, { window: windowValue, CustomEvent: class CustomEvent {} })(module, module.exports);
  return module.exports;
};

test("Meta Pixel is rooted once and loads only after explicit consent", () => {
  assert.match(layout, /<MetaPixel \/>/);
  assert.match(pixel, /consent === "granted"/);
  assert.match(pixel, /strategy="afterInteractive"/);
  assert.match(pixel, /id="meta-pixel-library"/);
  assert.match(pixel, /onLoad=\{\(\) => setPixelReady\(true\)\}/);
  assert.match(pixelClient, /1993876124619806/);
});

test("consent rejection prevents PageView before the Meta library is ready", () => {
  const { shouldSendMetaPageView } = compilePixelClient({ location: { pathname: "/", search: "" } });
  assert.equal(shouldSendMetaPageView({ consentGranted: false, pixelReady: true, pathname: "/", search: "", lastPageView: null }), false);
  assert.equal(shouldSendMetaPageView({ consentGranted: true, pixelReady: false, pathname: "/", search: "", lastPageView: null }), false);
});

test("consent approval enables one PageView after the real library load", () => {
  const { shouldSendMetaPageView } = compilePixelClient({ location: { pathname: "/", search: "" } });
  assert.equal(shouldSendMetaPageView({ consentGranted: true, pixelReady: true, pathname: "/", search: "", lastPageView: null }), true);
  assert.equal(shouldSendMetaPageView({ consentGranted: true, pixelReady: true, pathname: "/", search: "", lastPageView: "/" }), false);
});

test("persisted approval sends PageView after refresh and navigation without duplicates", () => {
  const { shouldSendMetaPageView } = compilePixelClient({ location: { pathname: "/", search: "" } });
  assert.equal(shouldSendMetaPageView({ consentGranted: true, pixelReady: true, pathname: "/", search: "", lastPageView: null }), true);
  assert.equal(shouldSendMetaPageView({ consentGranted: true, pixelReady: true, pathname: "/pricing", search: "", lastPageView: "/" }), true);
  assert.equal(shouldSendMetaPageView({ consentGranted: true, pixelReady: true, pathname: "/pricing", search: "", lastPageView: "/pricing" }), false);
});

test("consent withdrawal blocks later page views and conversions", () => {
  const localStorage = new Map([["sva_meta_analytics_consent", "granted"]]);
  const calls = [];
  const windowValue = {
    location: { pathname: "/pricing", search: "" },
    localStorage: {
      getItem: (key) => localStorage.get(key) ?? null,
      setItem: (key, value) => localStorage.set(key, value)
    },
    dispatchEvent: () => {},
    fbq: (...args) => calls.push(args)
  };
  const { setMetaConsent, shouldSendMetaPageView, trackMetaEvent } = compilePixelClient(windowValue);
  setMetaConsent(false);
  assert.equal(localStorage.get("sva_meta_analytics_consent"), "denied");
  assert.equal(shouldSendMetaPageView({ consentGranted: false, pixelReady: true, pathname: "/pricing", search: "", lastPageView: null }), false);
  assert.equal(trackMetaEvent("Purchase", { value: 799, currency: "INR" }), false);
  assert.equal(calls.length, 0);
});

test("PageView waits for library readiness and tracks URL changes with a duplicate guard", () => {
  assert.match(pixel, /usePathname\(\)/);
  assert.match(pixel, /shouldSendMetaPageView/);
  assert.match(pixel, /getMetaPageViewKey/);
  assert.match(pixel, /window\.fbq\("track", "PageView"\)/);
});

test("PageView excludes private and query-bearing routes", () => {
  assert.match(pixelClient, /PUBLIC_PAGEVIEW_PATHS/);
  assert.match(pixelClient, /window\.location\.search === ""/);
  for (const privateRoute of ["/app", "/admin", "/billing", "/nexus", "/verify-email", "/auth/callback"]) {
    const pageViewAllowlist = pixelClient.slice(pixelClient.indexOf("PUBLIC_PAGEVIEW_PATHS"), pixelClient.indexOf("]);", pixelClient.indexOf("PUBLIC_PAGEVIEW_PATHS")));
    assert.doesNotMatch(pageViewAllowlist, new RegExp(`"${privateRoute}"`));
  }
  const { getMetaPageViewKey } = compilePixelClient({ location: { pathname: "/pricing", search: "?email=private@example.com" } });
  assert.equal(getMetaPageViewKey("/pricing", "?email=private@example.com"), null);
  assert.equal(getMetaPageViewKey("/pricing", ""), "/pricing");
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
  assert.match(paymentVerification, /payment: \{ amountPaise: validatedAmount, currency: "INR" \}/);
  assert.match(checkout, /verified\.payment\.currency !== "INR"/);
  assert.match(eventBlock, /value: verified\.payment\.amountPaise \/ 100/);
  assert.match(eventBlock, /currency: verified\.payment\.currency/);
  assert.match(checkout, /&& trackMetaEvent\("Purchase"/);
});

