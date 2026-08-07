# Phase 30: Central OpenRouter Billing and Launch Operations

SVA uses one central OpenRouter account owned by SVA. Customers never receive OpenRouter credits, OpenRouter API keys, per-user provider accounts, or per-user OpenRouter configuration.

## Subscriber flow

1. Razorpay verifies the payment server-side.
2. SVA activates the user's internal plan in Supabase/local fallback.
3. SVA grants the plan's internal verification allowance.
4. Verification requests call OpenRouter with SVA's server-side `OPENROUTER_API_KEY`.
5. OpenRouter deducts actual model cost from SVA's central balance.
6. If OpenRouter reports insufficient credits or exhausted budget, SVA refunds the reserved verification and creates a critical admin alert.

After initial OpenRouter account setup, adding new Pro or Ultra subscribers requires no OpenRouter dashboard changes.

## Required deployment setup

Add these server-side environment variables in Vercel:

- `OPENROUTER_API_KEY`: production inference key for the central SVA OpenRouter account.
- `OPENROUTER_MANAGEMENT_KEY`: optional management/balance key. If omitted, user verification still works, but admin balance checks are limited.
- `OPENROUTER_WARNING_BALANCE_USD`: warning threshold for admin alerts, for example `25`.
- `OPENROUTER_CRITICAL_BALANCE_USD`: critical threshold for admin alerts, for example `10`.
- `SVA_GPT_PRIMARY`: recommended `openai/gpt-4.1-mini`.
- `SVA_GPT_FALLBACK`: recommended `openai/gpt-4.1-nano`.
- `SVA_GEMINI_PRIMARY`: recommended `google/gemini-2.5-flash`.
- `SVA_GEMINI_FALLBACK`: recommended `google/gemini-2.5-flash-lite`.
- `SVA_DEEPSEEK_PRIMARY`: recommended `deepseek/deepseek-chat`.
- `SVA_DEEPSEEK_FALLBACK`: optional; configure only after confirming a valid OpenRouter DeepSeek-family fallback.
- `SVA_SYNTHESIS_PRIMARY`: recommended `openai/gpt-4.1-mini`.
- `SVA_SYNTHESIS_FALLBACK`: recommended `openai/gpt-4.1-nano`.

Do not prefix OpenRouter, Razorpay, or Supabase service-role secrets with `NEXT_PUBLIC_`.

## Manual OpenRouter dashboard setup

Complete these steps once before launch:

1. Add an initial central OpenRouter balance sized for launch traffic.
2. Add and verify a payment method.
3. Enable auto top-up if OpenRouter supports it for the account.
4. Choose a top-up trigger threshold and top-up amount.
5. Ensure the production inference key has an adequate budget/spend limit.
6. Configure `OPENROUTER_WARNING_BALANCE_USD` and `OPENROUTER_CRITICAL_BALANCE_USD` below the dashboard top-up trigger so admins see early warnings.
7. Confirm the GPT, Gemini, and DeepSeek model IDs are enabled for the key.
8. Redeploy after changing Vercel environment variables.

Do not claim auto top-up is enabled unless it has been configured in OpenRouter externally.

## Failure behavior

If OpenRouter returns insufficient-credit, exhausted-budget, or HTTP 402 responses:

- classify as `billing_failure`,
- create a critical admin alert,
- do not deduct customer allowance,
- show the customer a temporary service message,
- continue serving users once central balance/key budget is restored.

At warning thresholds, SVA should alert admins but continue serving users while balance remains sufficient.
