"use client";

import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ProviderLogo } from "./provider-logo";
import {
  type EvidenceSnippet,
  type ModelName,
  type ModelResponse,
  type PerModelSource,
  type RuntimeProviderStatus,
  type VerificationExecutionMeta,
  type VerificationMode,
  type VerificationResult,
  type VerifyApiResponse
} from "../lib/models";
import { getModelLayerConfig } from "../lib/model-layer";
import {
  getCanonicalTrustScore,
  getCanonicalVerifiedAnswer,
  getContradictionRisk,
  getEvidenceDirection,
  getMeaningfulCaveats,
  getMeaningfulText,
  getReliabilityLabel
} from "../lib/result-presentation";
import type { ProviderStatus } from "../lib/server/provider-status";
import type { UserPlan } from "../lib/server/store";
import { getSession, getSessionHeaders, getUsage, incrementUsage, logout, setSession } from "../lib/client-auth";

const visibleModels: ModelName[] = ["Fast AI", "Balanced AI", "Research AI"];

type HistoryItem = {
  prompt: string;
  resultSummary: string;
  timestamp: string;
  confidence: number;
  verdict: string;
};

type PipelineState = "pending" | "active" | "complete" | "failed" | "unavailable";

type PipelineStage = {
  label: string;
  state: PipelineState;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const isLiveModelResponse = (source?: PerModelSource) => source?.fallbackState === "none";

const proProviderConfigured = (model: ModelName, status: ProviderStatus): boolean => {
  const configured = status.proProvidersConfigured;
  if (!configured) return false;
  if (model === "Fast AI") return configured.openai;
  if (model === "Balanced AI") return configured.gemini;
  return configured.deepseek;
};

const formatRelativeTime = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const getSourceScore = (snippet: EvidenceSnippet): number => snippet.credibilityScore ?? snippet.sourceQualityScore ?? snippet.domainTrustScore ?? 0;

const getProviderAvailabilityLabel = (model: ModelName, status: ProviderStatus | null, runtime?: RuntimeProviderStatus | null) => {
  if (runtime) {
    if (runtime.liveSuccess) return "Live response";
    if (runtime.status === "timeout") return "Timed out";
    return runtime.errorMessage ? "Request issue" : "Unavailable";
  }
  if (!status) return "Checking";
  if (status.modelLayer === "pro") return proProviderConfigured(model, status) ? "Configured" : "Not configured";
  return status.openrouterConfigured ? "Configured" : "Not configured";
};

const getModelStatus = ({
  hasRun,
  isLoading,
  isSuccess,
  isMajority,
  isOutlier,
  runtime
}: {
  hasRun: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  isMajority: boolean;
  isOutlier: boolean;
  runtime?: RuntimeProviderStatus | null;
}) => {
  if (isLoading) return { label: "Pending", tone: "cyan" as const };
  if (!hasRun) return { label: "Ready", tone: "neutral" as const };
  if (!isSuccess) return { label: runtime?.status === "timeout" ? "Timed Out" : "Unavailable", tone: "danger" as const };
  if (isOutlier) return { label: "Differs", tone: "warning" as const };
  if (isMajority) return { label: "Agrees", tone: "success" as const };
  return { label: "Available", tone: "success" as const };
};

const getPipelineStages = ({
  isLoading,
  hasRun,
  errorMessage,
  verification,
  evidenceCount
}: {
  isLoading: boolean;
  hasRun: boolean;
  errorMessage: string | null;
  verification: VerificationResult | null;
  evidenceCount: number;
}): PipelineStage[] => {
  if (errorMessage) {
    return [
      { label: "Understanding question", state: "complete" },
      { label: "Asking AI models", state: "failed" },
      { label: "Comparing responses", state: "unavailable" },
      { label: "Detecting contradictions", state: "unavailable" },
      { label: "Evaluating evidence", state: "unavailable" },
      { label: "Calculating trust score", state: "unavailable" }
    ];
  }

  if (isLoading) {
    return [
      { label: "Understanding question", state: "complete" },
      { label: "Asking AI models", state: "active" },
      { label: "Comparing responses", state: "pending" },
      { label: "Detecting contradictions", state: "pending" },
      { label: "Evaluating evidence", state: "pending" },
      { label: "Calculating trust score", state: "pending" }
    ];
  }

  if (verification) {
    return [
      { label: "Understanding question", state: "complete" },
      { label: "Asking AI models", state: "complete" },
      { label: "Comparing responses", state: "complete" },
      { label: "Detecting contradictions", state: verification.contradictionScore !== undefined ? "complete" : "unavailable" },
      { label: "Evaluating evidence", state: evidenceCount > 0 ? "complete" : "unavailable" },
      { label: "Calculating trust score", state: "complete" }
    ];
  }

  return [
    { label: "Understanding question", state: hasRun ? "complete" : "pending" },
    { label: "Asking AI models", state: "pending" },
    { label: "Comparing responses", state: "pending" },
    { label: "Detecting contradictions", state: "pending" },
    { label: "Evaluating evidence", state: "pending" },
    { label: "Calculating trust score", state: "pending" }
  ];
};

const ShellPanel = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <section className={cx("rounded-[22px] border border-white/[0.08] bg-white/[0.035] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-5", className)}>
    {children}
  </section>
);

const SectionHeader = ({ label, title, subtitle }: { label?: string; title: string; subtitle?: string }) => (
  <div>
    {label ? <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/75">{label}</p> : null}
    <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">{title}</h2>
    {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{subtitle}</p> : null}
  </div>
);

const SUPPORT_EMAIL = "svaofficial.ai@gmail.com";

const SupportMessage = ({ className }: { className?: string }) => {
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={cx("text-xs leading-5 text-slate-500", className)}>
      <p className="font-semibold text-slate-300">Having trouble with SVA?</p>
      <p className="mt-1">
        Contact us at{" "}
        <a className="text-slate-400 underline decoration-white/20 underline-offset-2 transition hover:text-emerald-200" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
        . Our support team will assist you within 6–12 hours.
      </p>
      <button
        type="button"
        aria-label="Copy support email address"
        onClick={copyEmail}
        className="mt-2 inline-flex min-h-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035] px-2.5 text-[11px] font-medium text-slate-400 transition hover:border-white/[0.14] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
      >
        {copied ? "Copied!" : "Copy email"}
      </button>
    </div>
  );
};

const AppNavigation = ({
  email,
  plan,
  remaining,
  limit,
  history,
  onHistorySelect,
  onLogout,
  onNewVerification
}: {
  email?: string;
  plan: UserPlan;
  remaining: number;
  limit: number;
  history: HistoryItem[];
  onHistorySelect: (prompt: string) => void;
  onLogout: () => void;
  onNewVerification: () => void;
}) => {
  const navItems = ["Home", "History", "Saved", "Reports", "Settings"];
  return (
    <aside className="hidden min-h-screen w-[292px] shrink-0 border-r border-white/[0.07] bg-[#05070A]/95 px-4 py-5 lg:block">
      <Link href="/" aria-label="Go to SVA home" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50">
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/10 text-sm font-semibold text-emerald-100 shadow-[0_0_30px_rgba(16,185,129,0.12)]">
          SVA
        </div>
        <div>
          <p className="text-lg font-semibold text-white">SVA</p>
          <p className="text-xs text-slate-500">Super Verified AI</p>
        </div>
      </Link>

      <button
        type="button"
        onClick={onNewVerification}
        className="mt-7 flex min-h-11 w-full items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-300/10 px-4 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-300/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
      >
        + New Verification
      </button>

      <nav className="mt-7 space-y-1" aria-label="Primary navigation">
        <Link href="/app" className="flex w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.055] px-3 py-2.5 text-left text-sm text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40">
          Home
        </Link>
        {navItems.slice(1).map((item) => (
          <button key={item} type="button" disabled className="flex w-full cursor-not-allowed items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-slate-500">
            <span>{item}</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Soon</span>
          </button>
        ))}
      </nav>

      <div className="mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Recent verifications</p>
        <div className="mt-3 space-y-2">
          {history.slice(0, 5).length ? (
            history.slice(0, 5).map((item) => (
              <button
                key={`${item.timestamp}-${item.prompt}`}
                type="button"
                onClick={() => onHistorySelect(item.prompt)}
                className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-left transition hover:border-white/[0.12] hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
              >
                <p className="line-clamp-2 text-sm leading-5 text-slate-200">{item.prompt}</p>
                <p className="mt-1 text-xs text-slate-500">{formatRelativeTime(item.timestamp)}</p>
              </button>
            ))
          ) : (
            <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-xs leading-5 text-slate-500">
              No saved history yet.
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-[22px] border border-white/[0.08] bg-white/[0.035] p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.08] text-xs font-semibold text-slate-100">
            {(email?.[0] ?? "G").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{email ?? "Guest session"}</p>
            <p className="text-xs text-slate-500">{plan.toUpperCase()} plan</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Daily verification</span>
            <span>{remaining}/{limit}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/[0.06]">
            <div className="h-1.5 rounded-full bg-emerald-300" style={{ width: `${Math.min(100, (remaining / Math.max(limit, 1)) * 100)}%` }} />
          </div>
        </div>
        <Link
          href={plan === "ultra" ? "/billing" : "/pricing"}
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-emerald-200/50 bg-emerald-300 px-3 text-sm font-semibold text-[#042016] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50"
        >
          {plan === "free" ? "Upgrade to Pro" : plan === "pro" ? "Upgrade to Ultra" : "Manage Plan"}
        </Link>
        <button type="button" onClick={onLogout} className="mt-4 text-sm text-slate-400 transition hover:text-white">
          Logout
        </button>
        <SupportMessage className="mt-4 border-t border-white/[0.06] pt-4" />
      </div>
    </aside>
  );
};

const MobileAppBar = ({
  plan,
  onNewVerification,
  onLogout
}: {
  plan: UserPlan;
  onNewVerification: () => void;
  onLogout: () => void;
}) => (
  <div className="sticky top-0 z-30 -mx-3 flex items-center justify-between gap-3 border-b border-white/[0.07] bg-[#05070A]/95 px-3 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5 lg:hidden">
    <Link href="/" aria-label="Go to SVA home" className="flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50">
      <div className="grid h-9 w-9 place-items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/10 text-xs font-semibold text-emerald-100">
        SVA
      </div>
      <div>
        <p className="text-sm font-semibold text-white">SVA</p>
        <p className="text-[11px] text-slate-500">{plan.toUpperCase()} plan</p>
      </div>
    </Link>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onNewVerification}
        className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-200"
      >
        New
      </button>
      <a className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-200" href="/billing">
        Billing
      </a>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-slate-200"
      >
        Logout
      </button>
    </div>
  </div>
);

const TopStatusBar = ({
  isLoading,
  verification,
  errorMessage,
  warnings,
  providerStatus,
  liveSuccessCount,
  plan,
  remaining,
  limit
}: {
  isLoading: boolean;
  verification: VerificationResult | null;
  errorMessage: string | null;
  warnings: string[];
  providerStatus: ProviderStatus | null;
  liveSuccessCount: number | null;
  plan: UserPlan;
  remaining: number;
  limit: number;
}) => {
  const label = errorMessage
    ? "Verification could not be completed"
    : isLoading
      ? "SVA is verifying across available AI models"
      : verification
        ? warnings.length
          ? "Verification completed with limited coverage"
          : "Verification complete"
        : "Ready to verify";

  return (
    <header className="sticky top-[65px] z-20 -mx-3 border-b border-white/[0.06] bg-[#05070A]/90 px-3 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5 lg:top-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cx("h-2.5 w-2.5 rounded-full", errorMessage ? "bg-rose-400" : isLoading ? "animate-pulse bg-cyan-300" : verification ? "bg-emerald-300" : "bg-slate-500")} />
          <p className="text-sm text-slate-200">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{plan.toUpperCase()}</Badge>
          <Badge variant={remaining <= 0 ? "danger" : "success"}>{remaining}/{limit} left</Badge>
          {providerStatus ? (
            <Badge variant={liveSuccessCount === null ? "cyan" : liveSuccessCount >= 2 ? "success" : "warning"}>
              {liveSuccessCount === null ? `${providerStatus.liveProviderCount}/3 configured` : `${liveSuccessCount}/3 live`}
            </Badge>
          ) : null}
        </div>
      </div>
    </header>
  );
};

const EmptyVerificationState = ({ onSelectPrompt }: { onSelectPrompt: (prompt: string) => void }) => {
  const examples = [
    "Is this news claim true?",
    "Compare these two explanations.",
    "Verify this health claim.",
    "Check whether this investment claim is supported.",
    "Explain where AI models disagree."
  ];

  return (
    <ShellPanel className="flex min-h-[360px] flex-col items-center justify-center text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">Verification intelligence</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Ask anything you want to verify.</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
        SVA compares multiple AI perspectives, detects disagreement, and helps you understand how much confidence to place in an answer.
      </p>
      <div className="mt-8 flex max-w-3xl flex-wrap justify-center gap-2">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onSelectPrompt(example)}
            className="rounded-full border border-white/[0.08] bg-white/[0.035] px-4 py-2 text-sm text-slate-300 transition hover:border-emerald-300/30 hover:bg-emerald-300/10 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
          >
            {example}
          </button>
        ))}
      </div>
    </ShellPanel>
  );
};

const VerificationComposer = ({
  prompt,
  isLoading,
  disabled,
  onPromptChange,
  onSubmit
}: {
  prompt: string;
  isLoading: boolean;
  disabled: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) => (
  <ShellPanel className="border-emerald-300/10">
    <form onSubmit={onSubmit}>
      <label htmlFor="verification-prompt" className="sr-only">
        Ask anything to verify
      </label>
      <textarea
        id="verification-prompt"
        value={prompt}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onPromptChange(event.target.value)}
        placeholder="Ask anything to verify..."
        required
        className="min-h-32 w-full resize-y rounded-[20px] border border-white/[0.08] bg-[#080B10] px-4 py-4 text-base leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-300/40 focus:ring-2 focus:ring-emerald-300/10"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-h-10 items-center rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] px-3 text-sm font-semibold text-emerald-100">
          Verified Mode
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-slate-500 sm:block">SVA can make mistakes. Verify critical information.</p>
          <Button type="submit" variant="primary" disabled={isLoading || disabled || !prompt.trim()} className="rounded-full bg-emerald-400 text-slate-950">
            {isLoading ? "Verifying" : disabled ? "Limit Reached" : "Send"}
          </Button>
        </div>
      </div>
    </form>
  </ShellPanel>
);

const VerificationPipeline = ({ stages }: { stages: PipelineStage[] }) => {
  const isComplete = stages.every((stage) => stage.state === "complete");
  const tone: Record<PipelineState, string> = {
    complete: "border-emerald-300/50 bg-emerald-300/10 text-emerald-100",
    active: "border-cyan-300/50 bg-cyan-300/10 text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.12)]",
    pending: "border-white/[0.08] bg-white/[0.025] text-slate-500",
    failed: "border-rose-300/50 bg-rose-300/10 text-rose-100",
    unavailable: "border-white/[0.06] bg-white/[0.015] text-slate-600"
  };

  return (
    <ShellPanel>
      <SectionHeader label="Pipeline" title="Verification Pipeline" subtitle="A transparent view of the current verification path. Completion reflects only the data SVA actually received." />
      <div className={cx("grid md:grid-cols-2 xl:grid-cols-6", isComplete ? "mt-4 gap-2" : "mt-5 gap-3")}>
        {stages.map((stage, index) => (
          <div key={stage.label} className={cx("relative rounded-2xl border transition", isComplete ? "p-2.5" : "p-3", tone[stage.state])}>
            <div className="flex items-center justify-between">
              <span className={cx("grid place-items-center rounded-full border border-current/25 text-xs", isComplete ? "h-6 w-6" : "h-7 w-7")}>{index + 1}</span>
              <span className="text-[10px] uppercase tracking-[0.14em] opacity-70">{stage.state}</span>
            </div>
            <p className={cx("text-sm leading-5", isComplete ? "mt-2" : "mt-3 min-h-10")}>{stage.label}</p>
          </div>
        ))}
      </div>
    </ShellPanel>
  );
};

const TrustScorePanel = ({ verification, trustScore, trustLabel }: { verification: VerificationResult | null; trustScore: number; trustLabel: string }) => {
  const metrics = verification
    ? [
        ["Model Agreement", verification.agreementScore],
        ["Evidence Strength", verification.evidenceAlignmentScore],
        ["Source Quality", verification.sourceQualityScore],
        ["Consistency", Math.max(0, 100 - (verification.contradictionScore ?? 0))],
        ["Claim Coverage", verification.claimCoverageScore]
      ].filter((item): item is [string, number] => typeof item[1] === "number" && Number.isFinite(item[1]))
    : [];

  return (
    <ShellPanel>
      <SectionHeader label="Trust" title="SVA Trust Score" subtitle={verification ? "Calculated from the available model, claim, contradiction, and evidence fields." : "Trust Score Pending"} />
      <div className="mt-6 flex items-center gap-5">
        <div
          className="grid h-32 w-32 shrink-0 place-items-center rounded-full p-1"
          style={{ background: verification ? `conic-gradient(#34d399 ${trustScore * 3.6}deg, rgba(255,255,255,0.07) 0deg)` : "rgba(255,255,255,0.06)" }}
        >
          <div className="grid h-full w-full place-items-center rounded-full bg-[#05070A]">
            <div className="text-center">
              <p className="text-3xl font-semibold text-white">{verification ? trustScore : "--"}</p>
              <p className="text-xs text-slate-500">/100</p>
            </div>
          </div>
        </div>
        <div>
          <p className="text-lg font-semibold text-white">{verification ? trustLabel : "Trust Score Pending"}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {verification ? "Why this score? SVA weighs model agreement, evidence alignment, source quality, contradiction impact, and claim coverage when those fields are present." : "Score explanation will appear after verification completes."}
          </p>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {metrics.length ? (
          metrics.map(([label, value]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-xs text-slate-400">
                <span>{label}</span>
                <span>{Math.round(value)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06]">
                <div className="h-1.5 rounded-full bg-emerald-300" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-sm text-slate-500">Trust breakdown unavailable until SVA receives verification data.</p>
        )}
      </div>
    </ShellPanel>
  );
};

const VerifiedAnswerCard = ({
  verification,
  trustScore,
  canonicalAnswer,
  actionMessage,
  onCopy,
  onExport,
  onShare
}: {
  verification: VerificationResult | null;
  trustScore: number;
  canonicalAnswer: string;
  actionMessage: string | null;
  onCopy: () => void;
  onExport: () => void;
  onShare: () => void;
}) => {
  const answer = getMeaningfulText(verification?.sections?.coreConclusion) || getMeaningfulText(verification?.finalAnswer);
  const evidence = getMeaningfulText(verification?.sections?.evidenceSummary);
  const caveats = getMeaningfulCaveats(verification);
  const contradictions = getMeaningfulText(verification?.sections?.contradictions);

  return (
    <ShellPanel className="border-emerald-300/25 bg-emerald-300/[0.045] shadow-[0_24px_80px_rgba(16,185,129,0.07)]">
      <SectionHeader label="Verified Answer" title={verification ? getReliabilityLabel(trustScore) : "Verification Unavailable"} subtitle={verification ? "Final synthesis generated from real returned verification data." : "Run a verification to generate an answer."} />
      {verification ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-[20px] border border-emerald-300/15 bg-[#080B10] p-5 shadow-inner shadow-emerald-950/20">
            <p className="text-base leading-8 text-slate-100 whitespace-pre-line">{answer || canonicalAnswer || "Model response unavailable."}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Verdict</p>
              <p className="mt-1 text-sm font-semibold text-white">{verification.judgeVerdict?.replace(/_/g, " ").toUpperCase() ?? "NEEDS REVIEW"}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Evidence</p>
              <p className="mt-1 text-sm font-semibold text-white">{getEvidenceDirection(verification)}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Contradiction</p>
              <p className="mt-1 text-sm font-semibold text-white">{getContradictionRisk(verification)}</p>
            </div>
          </div>
          {evidence ? <details className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4" open><summary className="cursor-pointer text-sm font-semibold text-slate-100">Evidence summary</summary><p className="mt-3 text-sm leading-6 text-slate-400">{evidence}</p></details> : null}
          {caveats ? <details className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4"><summary className="cursor-pointer text-sm font-semibold text-amber-100">Limitations</summary><p className="mt-3 text-sm leading-6 text-amber-50/80">{caveats}</p></details> : null}
          {contradictions ? <details className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4"><summary className="cursor-pointer text-sm font-semibold text-rose-100">Contradiction details</summary><p className="mt-3 text-sm leading-6 text-rose-50/80">{contradictions}</p></details> : null}
        </div>
      ) : (
        <p className="mt-5 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5 text-sm leading-6 text-slate-500">Verification unavailable. The verified answer will appear after SVA receives enough model responses.</p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={onCopy} disabled={!verification}>
          Copy Answer
        </Button>
        <Button type="button" onClick={onShare} disabled={!verification}>
          Share
        </Button>
        <Button type="button" variant="ghost" onClick={onExport} disabled={!verification}>
          Download Report
        </Button>
      </div>
      {actionMessage ? <p className="mt-3 text-xs text-emerald-200">{actionMessage}</p> : null}
    </ShellPanel>
  );
};

const ModelAgreementSection = ({
  responses,
  sourceMap,
  runtimeProviderStatus,
  providerStatus,
  modelLayer,
  verification,
  hasRunVerification,
  isLoading
}: {
  responses: ModelResponse[];
  sourceMap: Map<ModelName, PerModelSource>;
  runtimeProviderStatus: Record<ModelName, RuntimeProviderStatus> | null;
  providerStatus: ProviderStatus | null;
  modelLayer: ReturnType<typeof getModelLayerConfig>;
  verification: VerificationResult | null;
  hasRunVerification: boolean;
  isLoading: boolean;
}) => {
  const liveCount = visibleModels.filter((model) => isLiveModelResponse(sourceMap.get(model))).length;
  const [expandedModels, setExpandedModels] = useState<Set<ModelName>>(() => new Set());

  useEffect(() => {
    setExpandedModels(new Set());
  }, [responses]);

  const toggleExpanded = (model: ModelName) => {
    setExpandedModels((current) => {
      const next = new Set(current);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  return (
    <ShellPanel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader label="Consensus" title="Model Agreement" subtitle={verification ? `${verification.majorityModels.length} agree, ${verification.outlierModels.length} differ.` : "Provider responses will appear as verification data becomes available."} />
        {hasRunVerification ? <Badge variant={liveCount >= 2 ? "success" : "warning"}>{liveCount}/3 responded</Badge> : null}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {visibleModels.map((model) => {
          const provider = modelLayer.providerMeta[model];
          const source = sourceMap.get(model);
          const runtime = runtimeProviderStatus?.[model] ?? null;
          const response = responses.find((item) => item.model === model);
          const isSuccess = isLiveModelResponse(source);
          const isMajority = isSuccess && (verification?.majorityModels.includes(model) ?? false);
          const isOutlier = isSuccess && (verification?.outlierModels.includes(model) ?? false);
          const status = getModelStatus({ hasRun: hasRunVerification, isLoading, isSuccess, isMajority, isOutlier, runtime });
          const responseText = isLoading
            ? "Waiting for model response..."
            : !hasRunVerification
              ? "Ready to participate in verification."
              : isSuccess
                ? response?.answer ?? "Model response unavailable."
                : "Model response unavailable.";
          const isExpanded = expandedModels.has(model);
          const canExpand = isSuccess && responseText.length > 220;
          return (
            <article key={model} className="flex h-full flex-col rounded-[20px] border border-white/[0.08] bg-[#080B10] p-4 transition hover:border-white/[0.14]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderLogo provider={provider.logoProvider} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{provider.brand}</p>
                    <p className="text-xs text-slate-500">{model} / {provider.badgeLabel}</p>
                  </div>
                </div>
                <Badge variant={status.tone}>{status.label}</Badge>
              </div>
              <p className={cx("mt-4 min-h-24 flex-1 text-sm leading-6 text-slate-400", canExpand && !isExpanded && "line-clamp-4")}>{responseText}</p>
              {canExpand ? (
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpanded(model)}
                  className="mt-2 self-start text-xs font-semibold text-emerald-200 transition hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              ) : null}
              <p className="mt-3 border-t border-white/[0.05] pt-3 text-xs text-slate-600">{getProviderAvailabilityLabel(model, providerStatus, runtime)}</p>
            </article>
          );
        })}
      </div>
    </ShellPanel>
  );
};

const EvidencePanel = ({ evidenceSnippets, meta, isLoading }: { evidenceSnippets: EvidenceSnippet[]; meta: VerificationExecutionMeta | null; isLoading: boolean }) => {
  const sorted = [...evidenceSnippets].sort((a, b) => getSourceScore(b) - getSourceScore(a));

  return (
    <ShellPanel>
      <SectionHeader label="Evidence" title="Evidence Used" subtitle={evidenceSnippets.length ? `${evidenceSnippets.length} returned sources. Retrieval mode: ${meta?.retrievalModeUsed ?? "web"}.` : undefined} />
      <div className="mt-4 space-y-2.5">
        {isLoading ? (
          <p className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-100">Evidence analysis is still processing.</p>
        ) : sorted.length ? (
          sorted.slice(0, 8).map((snippet, index) => (
            <article key={`${snippet.title}-${index}`} className="rounded-[18px] border border-white/[0.07] bg-[#080B10] p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{snippet.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{snippet.sourceDomain ?? snippet.sourceType}{snippet.trustTier ? ` / ${snippet.trustTier}` : ""}</p>
                </div>
                {getSourceScore(snippet) ? <Badge variant={getSourceScore(snippet) >= 75 ? "success" : getSourceScore(snippet) >= 55 ? "warning" : "neutral"}>{Math.round(getSourceScore(snippet))}%</Badge> : null}
              </div>
              <p className="mt-2.5 text-sm leading-6 text-slate-400">{snippet.text || "No supporting snippet returned."}</p>
              {snippet.url ? (
                <a className="mt-3 inline-flex text-sm text-emerald-200 transition hover:text-emerald-100" href={snippet.url} target="_blank" rel="noreferrer">
                  View source
                </a>
              ) : null}
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 text-sm text-slate-500">
            {meta?.retrievalModeUsed === "none" ? "Evidence analysis unavailable for this verification." : "No supporting sources were returned."}
          </p>
        )}
      </div>
    </ShellPanel>
  );
};

const ContradictionPanel = ({ verification }: { verification: VerificationResult | null }) => {
  const score = verification?.contradictionScore;
  const hasContradiction = typeof score === "number" && score >= 20;

  return (
    <ShellPanel className={hasContradiction ? "border-rose-300/25" : ""}>
      <SectionHeader label="Contradictions" title={hasContradiction ? "Contradiction Detected" : "No Major Contradiction Detected"} />
      <p className="mt-4 text-sm leading-6 text-slate-400">
        {!verification
          ? "Contradiction analysis will appear after model comparison completes."
          : hasContradiction
            ? getMeaningfulText(verification.sections?.contradictions) || `Contradiction score: ${score}%. Review model agreement and claim checks for the conflict source.`
            : "The returned model responses did not produce a major contradiction signal."}
      </p>
      {verification ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {verification.contradictionType ? <Badge variant={hasContradiction ? "danger" : "neutral"}>{verification.contradictionType.replace(/_/g, " ")}</Badge> : null}
          {typeof score === "number" ? <Badge variant={hasContradiction ? "warning" : "success"}>{score}% score</Badge> : null}
          {verification.outlierModels.map((model) => <Badge key={model} variant="warning">{model} differs</Badge>)}
        </div>
      ) : null}
    </ShellPanel>
  );
};

const ClaimsPanel = ({ verification }: { verification: VerificationResult | null }) => (
  <ShellPanel>
    <SectionHeader label="Claims" title="Claim-Level Verification" subtitle="Only real claim checks returned by the verifier are shown." />
    <div className="mt-4 overflow-x-auto">
      {verification?.claimVerifications.length ? (
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-xs uppercase tracking-[0.12em] text-slate-500">
              <th className="px-2 py-3">Claim</th>
              <th className="px-2 py-3">Status</th>
              <th className="px-2 py-3">Confidence</th>
              <th className="px-2 py-3">Contradicted By</th>
            </tr>
          </thead>
          <tbody>
            {verification.claimVerifications.map((claim) => (
              <tr key={claim.id} className="border-b border-white/[0.05] align-top">
                <td className="max-w-xl px-2 py-2.5 text-slate-200">{claim.claim}<p className="mt-1 text-xs leading-5 text-slate-500">{claim.explanation}</p></td>
                <td className="px-2 py-2.5 text-slate-300">{claim.status.replace(/_/g, " ")}</td>
                <td className="px-2 py-2.5 text-slate-300">{claim.confidenceScore}/100</td>
                <td className="px-2 py-2.5 text-slate-300">{claim.contradictedByModels.length ? claim.contradictedByModels.join(", ") : "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 text-sm text-slate-500">Claim-level checks unavailable for this verification.</p>
      )}
    </div>
  </ShellPanel>
);

export const SaasDashboard = () => {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [modelSources, setModelSources] = useState<PerModelSource[]>([]);
  const [evidenceSnippets, setEvidenceSnippets] = useState<EvidenceSnippet[]>([]);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [meta, setMeta] = useState<VerificationExecutionMeta | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [runtimeProviderStatus, setRuntimeProviderStatus] = useState<Record<ModelName, RuntimeProviderStatus> | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [displayPlan, setDisplayPlan] = useState<UserPlan>("free");

  const session = getSession();
  const modelLayer = useMemo(() => getModelLayerConfig(displayPlan), [displayPlan]);
  const usage = session ? getUsage(session.email, displayPlan) : null;
  const remainingToday = usage?.remaining ?? 10;
  const dailyLimit = usage?.limit ?? 10;
  const sourceMap = useMemo(() => new Map(modelSources.map((item) => [item.model, item])), [modelSources]);
  const liveSuccessCount = runtimeProviderStatus ? Object.values(runtimeProviderStatus).filter((item) => item.liveSuccess).length : null;
  const hasRunVerification = responses.length > 0 || verification !== null || errorMessage !== null || isLoading;
  const trustScore = getCanonicalTrustScore(verification);
  const canonicalAnswer = useMemo(() => getCanonicalVerifiedAnswer(verification), [verification]);
  const trustLabel = verification ? getReliabilityLabel(trustScore) : "Awaiting verification";
  const stages = getPipelineStages({ isLoading, hasRun: hasRunVerification, errorMessage, verification, evidenceCount: evidenceSnippets.length });
  const disabledByQuota = Boolean(session && usage && usage.remaining <= 0);

  useEffect(() => {
    const syncPlan = async () => {
      try {
        const response = await fetch("/api/auth/me", { headers: getSessionHeaders() });
        const data = (await response.json()) as { ok: boolean; user?: { plan?: UserPlan } | null };
        if (response.ok && data.user?.plan) {
          setDisplayPlan(data.user.plan);
          if (session) setSession({ ...session, plan: data.user.plan });
          return;
        }
      } catch {
        /* keep local fallback */
      }
      setDisplayPlan(session?.plan ?? "free");
    };
    void syncPlan();
  }, [session?.email, session?.plan]);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch("/api/provider-status", { headers: getSessionHeaders() });
        const data = (await response.json()) as { ok: boolean; status?: ProviderStatus };
        if (response.ok && data.ok && data.status) setProviderStatus(data.status);
      } catch {
        setProviderStatus(null);
      }
    };
    void loadStatus();
  }, [displayPlan]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!session) {
        setHistory([]);
        return;
      }
      try {
        const response = await fetch("/api/history", { headers: getSessionHeaders() });
        const data = (await response.json()) as { ok: boolean; history?: HistoryItem[] };
        setHistory(response.ok && data.ok ? data.history ?? [] : []);
      } catch {
        setHistory([]);
      }
    };
    void loadHistory();
  }, [session?.email]);

  const clearResultState = () => {
    setResponses([]);
    setModelSources([]);
    setEvidenceSnippets([]);
    setVerification(null);
    setMeta(null);
    setRuntimeProviderStatus(null);
    setErrorMessage(null);
    setWarnings([]);
    setActionMessage(null);
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabledByQuota) {
      setErrorMessage("Daily verification quota reached. Upgrade plan or wait for reset.");
      return;
    }
    setIsLoading(true);
    clearResultState();

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getSessionHeaders() },
        body: JSON.stringify({ prompt })
      });
      const data = (await response.json()) as VerifyApiResponse;
      if (!response.ok || !data.ok) {
        setErrorMessage(data.ok ? "Verification failed." : data.message);
        return;
      }

      setResponses(data.responses);
      setModelSources(data.modelSources);
      setEvidenceSnippets(data.evidenceSnippets);
      setVerification(data.verification);
      setMeta(data.meta);
      setRuntimeProviderStatus(data.providerRuntimeStatus);
      setWarnings(data.warnings ?? []);
      if (data.usage?.plan) setDisplayPlan(data.usage.plan);
      if (session) incrementUsage(session.email, displayPlan);
      if (session) {
        try {
          const historyResponse = await fetch("/api/history", { headers: getSessionHeaders() });
          const historyData = (await historyResponse.json()) as { ok: boolean; history?: HistoryItem[] };
          setHistory(historyResponse.ok && historyData.ok ? historyData.history ?? [] : []);
        } catch {
          /* history is non-critical */
        }
      }
    } catch {
      setErrorMessage("Verification request failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromptChange = (value: string) => {
    setPrompt(value);
    clearResultState();
  };

  const handleCopyAnswer = async () => {
    if (!canonicalAnswer) return;
    await navigator.clipboard.writeText(canonicalAnswer);
    setActionMessage("Verified answer copied.");
  };

  const handleShareAnswer = async () => {
    if (!canonicalAnswer) {
      setActionMessage("Run verification before sharing.");
      return;
    }
    await navigator.clipboard.writeText(`SVA verified:\n${canonicalAnswer}`);
    setActionMessage("Share text copied.");
  };

  const handleExportReport = () => {
    if (!verification) return;
    const modelReport = visibleModels
      .map((model) => {
        const response = responses.find((item) => item.model === model)?.answer ?? "Model unavailable";
        return `- ${model}: ${response}`;
      })
      .join("\n");
    const evidenceReport = evidenceSnippets.slice(0, 5).map((item, idx) => `${idx + 1}. ${item.title} (${item.relevanceScore}%)`).join("\n") || "No evidence sources returned.";
    const report = `SVA Verification Report

Question: ${prompt}
Final Answer: ${canonicalAnswer}
Confidence Score: ${trustScore}/100
Verdict: ${(verification.judgeVerdict ?? "caution").toUpperCase()}

Model Responses:
${modelReport}

Evidence Summary:
${evidenceReport}
`;
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sva-verification-report.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#05070A] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.09),transparent_32rem),radial-gradient(circle_at_82%_8%,rgba(34,211,238,0.07),transparent_28rem)]" />
      <div className="relative flex">
        <AppNavigation
          email={session?.email}
          plan={displayPlan}
          remaining={remainingToday}
          limit={dailyLimit}
          history={history}
          onHistorySelect={handlePromptChange}
          onLogout={() => {
            logout();
            router.push("/login");
          }}
          onNewVerification={() => {
            setPrompt("");
            clearResultState();
          }}
        />
        <main className="min-w-0 flex-1 px-3 pb-10 sm:px-5">
          <MobileAppBar
            plan={displayPlan}
            onNewVerification={() => {
              setPrompt("");
              clearResultState();
            }}
            onLogout={() => {
              logout();
              router.push("/login");
            }}
          />
          <TopStatusBar
            isLoading={isLoading}
            verification={verification}
            errorMessage={errorMessage}
            warnings={warnings}
            providerStatus={providerStatus}
            liveSuccessCount={liveSuccessCount}
            plan={displayPlan}
            remaining={remainingToday}
            limit={dailyLimit}
          />

          <div className="mx-auto max-w-[1500px] space-y-5 pt-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="space-y-4">
                {!hasRunVerification && !prompt ? <EmptyVerificationState onSelectPrompt={setPrompt} /> : null}
                <VerificationComposer
                  prompt={prompt}
                  isLoading={isLoading}
                  disabled={disabledByQuota}
                  onPromptChange={handlePromptChange}
                  onSubmit={handleVerify}
                />
                {errorMessage ? (
                  <ShellPanel className="border-rose-300/30 bg-rose-300/10">
                    <SectionHeader label="Error" title="Verification Unavailable" subtitle={errorMessage} />
                    <Button type="button" className="mt-4" onClick={() => setErrorMessage(null)}>
                      Dismiss
                    </Button>
                  </ShellPanel>
                ) : null}
                {warnings.length ? (
                  <ShellPanel className="border-amber-300/25 bg-amber-300/10">
                    <SectionHeader label="Limited coverage" title="Verification Warnings" />
                    <ul className="mt-4 space-y-2 text-sm leading-6 text-amber-50/80">
                      {warnings.map((warning, idx) => <li key={`${warning}-${idx}`}>{warning}</li>)}
                    </ul>
                  </ShellPanel>
                ) : null}
                {hasRunVerification ? (
                  <>
                    <VerificationPipeline stages={stages} />
                    <ModelAgreementSection
                      responses={responses}
                      sourceMap={sourceMap}
                      runtimeProviderStatus={runtimeProviderStatus}
                      providerStatus={providerStatus}
                      modelLayer={modelLayer}
                      verification={verification}
                      hasRunVerification={hasRunVerification}
                      isLoading={isLoading}
                    />
                    <VerifiedAnswerCard
                      verification={verification}
                      trustScore={trustScore}
                      canonicalAnswer={canonicalAnswer}
                      actionMessage={actionMessage}
                      onCopy={handleCopyAnswer}
                      onExport={handleExportReport}
                      onShare={handleShareAnswer}
                    />
                  </>
                ) : null}
              </div>
              <div className="space-y-5">
                <TrustScorePanel verification={verification} trustScore={trustScore} trustLabel={trustLabel} />
                <ContradictionPanel verification={verification} />
                <ShellPanel>
                  <SectionHeader label="Provider status" title="Live Coverage" />
                  <div className="mt-4 space-y-2 text-sm text-slate-400">
                    {visibleModels.map((model) => (
                      <div key={model} className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                        <span>{model}</span>
                        <span className="text-slate-300">{getProviderAvailabilityLabel(model, providerStatus, runtimeProviderStatus?.[model])}</span>
                      </div>
                    ))}
                  </div>
                  {providerStatus?.retrievalProvider === "web" && !providerStatus.webRetrievalConfigured ? (
                    <p className="mt-3 text-xs leading-5 text-amber-200">Web retrieval key missing. Evidence may be unavailable.</p>
                  ) : null}
                </ShellPanel>
              </div>
            </div>

            {hasRunVerification ? (
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <EvidencePanel evidenceSnippets={evidenceSnippets} meta={meta} isLoading={isLoading} />
                <ClaimsPanel verification={verification} />
              </div>
            ) : null}
            <SupportMessage className="border-t border-white/[0.06] pt-4 text-center lg:hidden" />
          </div>
        </main>
      </div>
    </div>
  );
};

