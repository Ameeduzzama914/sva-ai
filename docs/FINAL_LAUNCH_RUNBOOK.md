# SVA Final Launch Runbook

This is the remaining manual launch sequence after Codex automation. It is designed for zero-real-money code validation first, then controlled external configuration checks.

## 1. Apply The Remaining Supabase Migration

Already run in production:

1. `supabase/migrations/20260813_0001_sva_users_auth_schema.sql`

Run now:

1. `supabase/migrations/20260823_0001_launch_audit_reservation_provider_fix.sql`

This migration is additive/idempotent. It updates constraints and replaces `sva_reserve_verification` so duplicate reservation idempotency keys do not consume allowance twice.

## 2. Run The Read-Only Database Verification SQL

In Supabase SQL Editor, paste and run:

1. `supabase/production-readiness-check.sql`

Expected result: every row has `status = PASS`.

If any row returns `FAIL`, fix that database item before continuing.

## 3. Verify Vercel Production Environment Variables

Required for auth/core:

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `SUPABASE_SERVICE_ROLE_KEY`
4. `SVA_SESSION_SECRET`

Required for Razorpay:

1. `RAZORPAY_KEY_ID`
2. `RAZORPAY_KEY_SECRET`
3. `RAZORPAY_WEBHOOK_SECRET`

Required for OpenRouter:

1. `OPENROUTER_API_KEY`
2. `SVA_GPT_PRIMARY`
3. `SVA_GEMINI_PRIMARY`
4. `SVA_DEEPSEEK_PRIMARY`
5. `SVA_SYNTHESIS_PRIMARY`

Required for admin:

1. `ADMIN_EMAIL`
2. `NEXT_PUBLIC_ADMIN_EMAIL`

Recommended monitoring:

1. `OPENROUTER_MANAGEMENT_KEY`
2. `OPENROUTER_WARNING_BALANCE_USD`
3. `OPENROUTER_CRITICAL_BALANCE_USD`
4. `SVA_BUDGET_USD_TO_INR`

Optional retrieval:

1. `RETRIEVAL_PROVIDER`
2. `WEB_RETRIEVAL_ENDPOINT`
3. `WEB_RETRIEVAL_API_KEY`
4. `SERPER_API_KEY`
5. `TAVILY_API_KEY`

Never put server secrets in `NEXT_PUBLIC_*` variables.

## 4. Configure Supabase Auth OTP Email

In Supabase Dashboard:

1. Go to Authentication.
2. Ensure email signups are enabled.
3. Configure the email confirmation/OTP template to include the 6-digit token variable supported by Supabase, not only a magic-link URL.
4. Keep OTP expiry and resend rate limits at Supabase defaults unless intentionally changed.
5. For internal testing, Supabase built-in email is acceptable if delivery works.
6. Before public launch, configure custom SMTP for reliable branded delivery.

Manual OTP smoke test:

1. Sign up with a new email.
2. Confirm `/verify-email` is shown.
3. Enter the 6-digit OTP.
4. Confirm redirect to `/app`.
5. Refresh `/app`.
6. Logout.
7. Login again with email/password.

## 5. Razorpay Zero-Real-Money Validation

No real INR self-payment is required to validate SVA's code paths. Do not use a real Pro or Ultra purchase just to test launch readiness.

Expected deployed webhook route:

`https://YOUR_PRODUCTION_DOMAIN/api/payments/razorpay/webhook`

Configure Razorpay Test Mode first. Use test keys and test webhooks for non-real-money validation.

Webhook events used by code:

1. `invoice.paid`
2. `subscription.charged`
3. `subscription.cancelled`
4. `subscription.halted`
5. `invoice.payment_failed`
6. `payment.failed`
7. `payment.captured`
8. `order.paid`

Zero-real-money Razorpay tests:

1. In Razorpay Test Mode, create a Pro checkout/order and confirm amount is `79900` paise, `INR`.
2. In Razorpay Test Mode, create an Ultra checkout/order and confirm amount is `129900` paise, `INR`.
3. Complete Razorpay Test Mode payment success for Pro and confirm plan activates once.
4. Complete Razorpay Test Mode payment success for Ultra and confirm plan activates once.
5. Replay the same test webhook event and confirm allowance is not reset twice.
6. Send or replay an incorrect-signature webhook and confirm it is rejected.
7. Send a test webhook with incorrect amount/currency/metadata and confirm no plan activation.
8. Send cancellation-at-period-end test data and confirm access remains until period end.
9. Send halted/failed renewal test data and confirm an admin alert is created and paid allowance is not reset.

Real customers must still require a genuinely verified Razorpay payment.

## 6. OpenRouter Zero/Minimum-Cost Validation

A. AUTOMATED/MOCK VERIFIED

Covered by automated tests without paid inference:

1. GPT, Gemini, and DeepSeek family routing.
2. Primary/fallback behavior.
3. Partial provider failure and total provider failure handling.
4. HTTP 401, 402, 429, and 5xx classification.
5. Timeout/retry behavior.
6. Malformed response handling.
7. `finish_reason` propagation.
8. Truncated synthesis retry.
9. Reservation, finalize, and refund paths.
10. Provider token/cost accounting and synthesis retry cost accounting.
11. Low-balance, critical-balance, and profit-alert code paths.

B. CONFIGURATION VERIFIED

Use admin-only diagnostics after deploy:

1. `/api/admin/health`
2. `/api/admin/env-health`

These report configuration and health to admins only. They must never expose secret values.

C. REAL INFERENCE NOT YET VERIFIED

One eventual tiny real Verified Mode request is the only way to prove live provider inference across the deployed network path. This does not require buying your own SVA subscription. It may require a small funded OpenRouter central-account balance.

A large OpenRouter test deposit is not required for code validation.

Manual OpenRouter setup:

1. Add only the smallest practical initial balance needed for controlled smoke testing.
2. Enable auto top-up if OpenRouter supports it for your account.
3. Configure a payment method.
4. Set `OPENROUTER_API_KEY` in Vercel.
5. Optionally set `OPENROUTER_MANAGEMENT_KEY` so admin health can read balance.
6. Set warning/critical thresholds in Vercel if desired.

## 7. Redeploy

Redeploy Vercel after:

1. Supabase migration is applied.
2. Vercel env vars are verified.
3. Razorpay Test Mode webhook is configured.
4. OpenRouter account configuration is ready.

## 8. Run Production Smoke Tool

From `apps/web`:

```bash
node scripts/production-smoke-test.mjs https://YOUR_PRODUCTION_DOMAIN
```

Optional authenticated admin checks:

```bash
SVA_SMOKE_SESSION_COOKIE="sva_user_id=..." node scripts/production-smoke-test.mjs https://YOUR_PRODUCTION_DOMAIN
```

Do not store the session cookie in source control or documentation.

## 9. Free Plan Smoke Test

1. Create a new verified Free account.
2. Run one inexpensive Verified Mode request only if OpenRouter is funded for smoke testing.
3. Confirm remaining today decreases from 2 to 1.
4. Confirm remaining month decreases from 30 to 29.
5. Force a failure only in a safe test setup and confirm allowance is not consumed.

## 10. Pro And Ultra Test-Mode Smoke Tests

Use Razorpay Test Mode. No real INR self-payment is required.

1. Upgrade one test user to Pro through Razorpay Test Mode.
2. Confirm Pro shows `8/day` and `200/billing period`.
3. Run one paid-plan verification only if OpenRouter is funded for smoke testing.
4. Upgrade or create one Ultra test user through Razorpay Test Mode.
5. Confirm Ultra shows `15/day` and `450/billing period`.
6. Run one paid-plan verification only if OpenRouter is funded for smoke testing.

## 11. Admin Dashboard Check

Login as `ADMIN_EMAIL` and verify:

1. Subscription counts.
2. Pro/Ultra counts.
3. Payments and webhook failures.
4. OpenRouter health.
5. Provider success/fallback rates.
6. Average latency.
7. AI cost and cost per verification.
8. Low-balance/profit alerts.
9. Stale reservations.
10. Verification failures.
11. `/api/admin/env-health` reports configured true/false only.

## 12. Launch

Launch only after:

1. Database readiness SQL is all PASS.
2. Production smoke script passes.
3. OTP signup/login works in production.
4. Razorpay Test Mode Pro and Ultra tests pass.
5. At least one tiny funded OpenRouter real inference smoke test passes, if you want live provider connectivity proven before opening access.
6. Admin dashboard shows operational data without exposing secrets.

