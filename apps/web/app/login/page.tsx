import Link from "next/link";
import { MarketingNav } from "../../components/marketing-nav";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";

export default function LoginPage() {
  return <div className="min-h-screen bg-[#070b14] text-slate-100"><MarketingNav />
    <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4 py-10">
      <Card className="w-full max-w-md border-violet-500/30 bg-slate-950/80" title="Welcome back" subtitle="Log in to continue verifying with SVA.">
        <form className="space-y-3">
          <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" placeholder="Email" type="email" />
          <input className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" placeholder="Password" type="password" />
          <Button variant="primary" className="w-full">Log in</Button>
          <Button className="w-full">Continue with Google</Button>
        </form>
        <p className="mt-4 text-xs text-slate-400"><Link href="/forgot-password" className="text-violet-300">Forgot password?</Link> · New here? <Link href="/signup" className="text-violet-300">Create account</Link></p>
      </Card>
    </main></div>;
}
