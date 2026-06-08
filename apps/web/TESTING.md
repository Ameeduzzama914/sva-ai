# SVA Razorpay Testing

Razorpay Test Mode can reject some card, UPI, wallet, or international-card methods depending on the Razorpay account, country, and enabled payment-method settings. If Checkout opens but a test card shows a method-level error such as "International cards are not supported", use a Razorpay-approved test method for the account or test the live flow with Razorpay's approved live configuration.

The SVA plan upgrade flow is intentionally strict:

1. The browser calls `/api/payments/razorpay/create-order` to create a server-priced Razorpay order.
2. Razorpay Standard Checkout returns `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature` only after payment success.
3. The browser sends those values to `/api/payments/razorpay/verify`.
4. The server verifies the signature, confirms the Razorpay order metadata and amount match the selected plan, and only then updates the user plan.
5. Cancelled, failed, or unverified payments do not upgrade the user.

Production users should only see `Upgrade to Pro` and `Upgrade to Ultra`. Local payment simulation is not exposed in the UI and the simulation endpoint is disabled unless the server is running with `NODE_ENV=development` and `ENABLE_LOCAL_PAYMENT_SIMULATION=true`.
