import { MarketingNav } from "../../components/marketing-nav";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100">
      <MarketingNav />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-300">Contact</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Contact / Support</h1>

        <section className="mt-8 space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold">SVA Support</h2>
          <p>Email: mohammed.ameeduzzama@gmail.com</p>
          <p>Product: SVA (Super Verified AI)</p>
          <p>Website: https://sva-ai.vercel.app</p>
          <p>Response time: 24–48 hours.</p>
          <p>
            For payment, subscription, or access issues, please include your Razorpay
            payment ID, order ID, registered email address, and plan name if available.
          </p>
          <p className="text-sm text-slate-400">Last updated: June 14, 2026</p>
        </section>
      </main>
    </div>
  );
}