import Link from "next/link";
import type { ReactNode } from "react";
import { MarketingNav } from "./marketing-nav";

export const SectionEyebrow = ({ children }: { children: ReactNode }) => (
  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/75">{children}</p>
);

export const PublicFooter = () => (
  <footer className="border-t border-white/[0.07] bg-[#05070a]/80">
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p className="font-medium text-slate-300">SVA · Super Verified AI</p>
        <p className="mt-1 text-xs">SVA can make mistakes. Verify critical information.</p>
      </div>
      <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer navigation">
        <Link className="transition hover:text-white" href="/app">Dashboard</Link>
        <Link className="transition hover:text-white" href="/pricing">Pricing</Link>
        <Link className="transition hover:text-white" href="/privacy">Privacy</Link>
        <Link className="transition hover:text-white" href="/terms">Terms</Link>
        <Link className="transition hover:text-white" href="/contact">Contact</Link>
      </nav>
    </div>
  </footer>
);

export const PublicPageShell = ({ children }: { children: ReactNode }) => (
  <div className="sva-atmosphere min-h-screen text-slate-100">
    <MarketingNav />
    {children}
    <PublicFooter />
  </div>
);

export const LegalPageShell = ({
  eyebrow,
  title,
  introduction,
  sections
}: {
  eyebrow: string;
  title: string;
  introduction: string;
  sections: Array<{ title: string; body: string }>;
}) => (
  <PublicPageShell>
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-20">
      <header className="max-w-3xl">
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">{title}</h1>
        <p className="mt-5 text-base leading-8 text-slate-400">{introduction}</p>
      </header>
      <div className="mt-12 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-28 space-y-2 border-l border-white/[0.08] pl-4 text-sm text-slate-500" aria-label={`${title} sections`}>
            {sections.map((section, index) => (
              <a key={section.title} className="block transition hover:text-emerald-200" href={`#section-${index + 1}`}>{section.title}</a>
            ))}
          </nav>
        </aside>
        <article className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.025] px-5 sm:px-8">
          {sections.map((section, index) => (
            <section key={section.title} id={`section-${index + 1}`} className="scroll-mt-28 border-b border-white/[0.07] py-7 last:border-0 sm:py-9">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/60">{String(index + 1).padStart(2, "0")}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{section.title}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{section.body}</p>
            </section>
          ))}
        </article>
      </div>
    </main>
  </PublicPageShell>
);

export const AuthShell = ({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: ReactNode }) => (
  <PublicPageShell>
    <main className="mx-auto grid min-h-[calc(100vh-130px)] max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_460px]">
      <div className="hidden max-w-xl lg:block">
        <SectionEyebrow>Verification workspace</SectionEyebrow>
        <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.035em] text-white">Confidence for decisions that matter.</h2>
        <p className="mt-5 text-base leading-8 text-slate-400">Compare model answers, inspect evidence, surface contradictions, and understand why a result deserves your trust.</p>
      </div>
      <section className="rounded-[24px] border border-white/[0.09] bg-[#080b10]/90 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.38)] sm:p-8">
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>
        <div className="mt-7">{children}</div>
      </section>
    </main>
  </PublicPageShell>
);
