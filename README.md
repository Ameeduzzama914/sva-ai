# SVA (Super Verified AI) — Commercial Launch Version (v1)

SVA is a launch-ready Trust Engine SaaS that helps users verify AI answers before acting on them.

## Features included
- Email/password authentication (MVP)
- Multi-model verification (GPT, Gemini, DeepSeek)
- Evidence retrieval (web + mock fallback)
- Confidence + trust breakdown + contradiction analysis
- SVA Judge verdict + risk flags
- Verification modes: Fast, Deep Verify, Research
- User-based history (last 20 verifications)
- Usage limits enforced in backend by plan
- Pricing and simulated upgrade flow
- Basic analytics event logging
- Feedback submission event tracking
- Privacy Policy and Terms pages

## Pricing model
- **Free**: 10 verifications/day
- **Pro**: ₹499/month (Early Access Price — will increase to ₹999 soon; simulated checkout in this MVP)

## Commercial notes
This is intentionally a lean v1 for first paying users and rapid validation.

## Limitations (current MVP)
- Basic auth only (cookie + JSON datastore)
- Mock payments (no real Stripe/Razorpay charge)
- No production database (JSON file storage)
- No enterprise-grade security hardening yet
- Analytics stored locally (not external analytics platform yet)

## Next steps
- Deploy to Vercel
- Integrate real Stripe/Razorpay checkout + webhooks
- Move datastore to Supabase/Firebase/Postgres
- Add production analytics (PostHog)
- Add robust session management and security controls

## Quick start
```bash
cd apps/web
cp .env.example .env.local
npm install
npm run build
npm run dev
```

## Required environment variables
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`
- `RETRIEVAL_PROVIDER` (`mock` for demo, `web` for real retrieval)
- `WEB_RETRIEVAL_ENDPOINT` (for web retrieval mode)
- `WEB_RETRIEVAL_API_KEY` (for web retrieval mode)

## Vercel build settings
- **Root Directory:** `.`
- **Framework Preset:** `Next.js`
- **Build Command:** `cd apps/web && npm install && npm run build`
- **Environment recommendation:** set `RETRIEVAL_PROVIDER=mock` for demo deployments, or `web` when Serper is configured.
