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

test("Meta Pixel is rooted once and loads only after explicit consent", () => {
  assert.match(layout, /<MetaPixel \/>/);
  assert.match(pixel, /consent === "granted"/);
  assert.match(pixel, /strategy="afterInteractive"/);
  assert.match(pixelClient, /1993876124619806/);
});

test("PageView tracks URL changes with a duplicate guard", () => {
  assert.match(pixel, /usePathname\(\)/);
  assert.match(pixel, /useSearchParams\(\)/);
  assert.match(pixel, /lastPageView\.current === url/);
  assert.match(pixel, /window\.fbq\("track", "PageView"\)/);
});

test("registration tracks only after successful OTP verification", () => {
  assert.match(verification, /if \(response\.ok && data\.ok && data\.user\) \{ finish\(data\.user\); return; \}/);
  assert.match(verification, /const finish =[\s\S]*trackMetaEvent\("CompleteRegistration"/);
  assert.doesNotMatch(read("app/signup/page.tsx"), /CompleteRegistration/);
});

test("purchase tracks only after verified payment success and excludes sensitive fields", () => {
  assert.ok(checkout.indexOf("!verifyResponse.ok || !verified.ok || !verified.user") < checkout.indexOf('trackMetaEvent("Purchase"'));
  const eventBlock = checkout.slice(checkout.indexOf('trackMetaEvent("Purchase"'), checkout.indexOf("onSuccess?.", checkout.indexOf('trackMetaEvent("Purchase"')));
  assert.doesNotMatch(eventBlock, /email|password|razorpay_payment_id|razorpay_order_id|signature|prompt|response/i);
  assert.match(eventBlock, /value: verifiedOrderAmount \/ 100/);
  assert.match(eventBlock, /currency: verifiedOrderCurrency/);
});

