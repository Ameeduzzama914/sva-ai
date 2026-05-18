"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "./app-sidebar";
import { DashboardHeader } from "./dashboard-header";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  STARTER_PROMPT,
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
import type { ProviderStatus } from "../lib/server/provider-status";
import { getSession, getUsage, incrementUsage, logout } from "../lib/client-auth";

const visibleModels: ModelName[] = ["Fast AI", "Balanced AI", "Research AI"];
const modelBadgeLabel: Record<ModelName, string> = {
  "Fast AI": "Mistral 7B",
  "Balanced AI": "Llama 3.1 8B",
  "Research AI": "Gemma 7B"
};

const statusStyle: Record<string, string> = {
  strongly_supported: "bg-emerald-400/25 text-emerald-200 border-emerald-400/40",
  supported: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  weak_support: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  weakly_supported: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  partially_supported: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  contradicted: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  unsupported: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  insufficient_evidence: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  uncertain: "bg-slate-500/20 text-slate-300 border-slate-500/40"
};

export const SaasDashboard = () => {
  const router = useRouter();
  const sourceReliabilityLabel = (score: number): "Highly Trusted" | "Trusted" | "Moderate" | "Weak Source" =>
    score >= 90 ? "Highly Trusted" : score >= 75 ? "Trusted" : score >= 55 ? "Moderate" : "Weak Source";
  const [prompt, setPrompt] = useState(STARTER_PROMPT);
  const [mode, setMode] = useState<VerificationMode>("deep");
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [modelSources, setModelSources] = useState<PerModelSource[]>([]);
  const [evidenceSnippets, setEvidenceSnippets] = useState<EvidenceSnippet[]>([]);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [meta, setMeta] = useState<VerificationExecutionMeta | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [runtimeProviderStatus, setRuntimeProviderStatus] = useState<Record<ModelName, RuntimeProviderStatus> | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const session = getSession();
  const usage = session ? getUsage(session.email) : null;
  const sourceMap = useMemo(() => new Map(modelSources.map((item) => [item.model, item])), [modelSources]);
  const isDemoMode = providerStatus ? !providerStatus.hasLiveProvider && !isLoading : false;
  const liveSuccessCount = runtimeProviderStatus ? Object.values(runtimeProviderStatus).filter((item) => item.liveSuccess).length : null;
  const contradictionCount = !isDemoMode && verification?.contradictionScore ? Math.max(0, Math.ceil(verification.contradictionScore / 25)) : 0;

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (session && usage && usage.remaining <= 0) { setErrorMessage("Daily free quota reached. Upgrade plan to continue."); return; }
    setIsLoading(true);
    setErrorMessage(null);
    setWarnings([]);
    setResponses([]);
    setModelSources([]);
    setEvidenceSnippets([]);
    setVerification(null);
    setMeta(null);
    setRuntimeProviderStatus(null);

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode })
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
      if (session) incrementUsage(session.email);
    } catch {
      setErrorMessage("Verification request failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    const loadStatus = async () => {
      const response = await fetch("/api/provider-status");
      const data = (await response.json()) as { ok: boolean; status?: ProviderStatus };
      if (response.ok && data.ok && data.status) {
        setProviderStatus(data.status);
      }
    };
    void loadStatus();
  }, []);

  const hasRunVerification = responses.length > 0 || verification !== null || errorMessage !== null;
  const trustScore = verification?.finalConfidenceScore ?? 0;
  const evidenceDiversity = new Set(evidenceSnippets.map((snippet) => snippet.sourceDomain).filter(Boolean)).size;
  const disputedClaimCount = verification?.claimVerifications.filter((claim) => ["disputed", "contradicted", "weak_support", "weakly_supported"].includes(claim.status)).length ?? 0;
  const minorityOppositionLevel = Math.min(100, Math.max(
    Math.round((verification?.contradictionScore ?? 0) * 0.85),
    disputedClaimCount > 0 ? 20 + disputedClaimCount * 10 : 0
  ));
  const trustLabel =
    verification?.confidenceLabel === "Very High"
      ? "Highly Reliable"
      : verification?.confidenceLabel === "High"
        ? "Strong Reliability"
      : verification?.confidenceLabel === "Medium"
        ? "Moderate Reliability"
        : verification?.confidenceLabel === "Low"
          ? "Weak Reliability"
          : "Awaiting verification";

  const handleCopyAnswer = async () => {
    if (!verification?.finalAnswer) return;
    await navigator.clipboard.writeText(verification.finalAnswer);
  };

  const getShortAnswer = (answer?: string): string => {
    if (!answer || typeof answer !== "string") {
      return "Model unavailable";
    }
    const words = answer.split(/\s+/);
    return words.length > 45 ? `${words.slice(0, 45).join(" ")}…` : answer;
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
Final Answer: ${verification.finalAnswer}
Confidence Score: ${verification.finalConfidenceScore}/100
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
    <div className="min-h-screen bg-[#0B0F1A] text-slate-100">
      <div className="mx-auto flex max-w-[1600px]">
        <AppSidebar contradictionCount={contradictionCount} isLoggedIn={Boolean(session)} remainingToday={usage?.remaining ?? 10} onLogout={() => { logout(); router.push("/login"); }} />

        <main className="flex-1 space-y-4 p-5">
          <Card><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="text-slate-300">{session ? `${session.email} · ${session.plan.toUpperCase()} plan` : "Guest session"}</p><div className="flex items-center gap-2">{usage ? <Badge variant={usage.remaining===0?"danger":"success"}>Remaining today: {usage.remaining}/{usage.limit}</Badge> : null}<Button variant="ghost" type="button" onClick={()=>{logout(); router.push("/login");}}>Logout</Button></div></div></Card>
          <DashboardHeader
            prompt={prompt}
            mode={mode}
            isLoading={isLoading}
            onPromptChange={setPrompt}
            onModeChange={setMode}
            onSubmit={handleVerify}
            elapsedLabel={meta ? `Verification completed in mode: ${meta.modeUsed ?? mode}` : undefined}
          />

          {isDemoMode ? (
            <Card className="border-amber-500/40 bg-amber-500/10 py-3" title="AI gateway Mode">
              <p className="text-sm text-amber-100">
                AI gateway key is missing. Add backend configuration to enable live AI answers.
              </p>
              <details className="mt-2 text-xs text-amber-100">
                <summary className="cursor-pointer text-amber-200">Setup helper</summary>
                <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                  <li>AI gateway key: Configured / Missing</li>
                  <li>Fast AI: Connected / Not configured / Failed</li>
                  <li>Balanced AI: Connected / Not configured / Failed</li>
                  <li>Research AI: Connected / Not configured / Failed</li>
                  <li>Evidence mode: Demo / Web</li>
                </ul>
              </details>
            </Card>
          ) : null}
          {!isDemoMode && providerStatus ? (
            <Card className="border-emerald-500/30 bg-emerald-500/10 py-3" title="Live Provider Status">
              <p className="text-sm text-emerald-100">
                {liveSuccessCount === null
                  ? `Configured for live verification — ${providerStatus.liveProviderCount} of 3 providers have API keys.`
                  : `Live verification enabled — ${liveSuccessCount} of 3 providers returned live responses.`}
              </p>
              <ul className="mt-2 grid gap-1 text-xs text-emerald-100 sm:grid-cols-2">
                <li>Fast AI: {runtimeProviderStatus ? (runtimeProviderStatus["Fast AI"].liveSuccess ? "Live response" : `Request issue: ${runtimeProviderStatus["Fast AI"].errorMessage ?? "request failed"}`) : providerStatus.openrouterConfigured ? "Configured" : "Not configured"}</li>
                <li>Balanced AI: {runtimeProviderStatus ? (runtimeProviderStatus["Balanced AI"].liveSuccess ? "Live response" : `Request issue: ${runtimeProviderStatus["Balanced AI"].errorMessage ?? "request failed"}`) : providerStatus.openrouterConfigured ? "Configured" : "Not configured"}</li>
                <li>Research AI: {runtimeProviderStatus ? (runtimeProviderStatus["Research AI"].liveSuccess ? "Live response" : `Request issue: ${runtimeProviderStatus["Research AI"].errorMessage ?? "request failed"}`) : providerStatus.openrouterConfigured ? "Configured" : "Not configured"}</li>
                <li>Retrieval: {providerStatus.retrievalProvider.toUpperCase()}</li>
              </ul>
              {providerStatus.liveProviderCount === 1 ? (
                <p className="mt-2 text-xs text-amber-200">Single-provider live mode. Add more providers for stronger cross-model verification.</p>
              ) : null}
              {providerStatus.retrievalProvider === "web" && !providerStatus.webRetrievalConfigured ? (
                <p className="mt-2 text-xs text-amber-200">Web retrieval API key missing. Configure retrieval credentials to enable live evidence.</p>
              ) : null}
            </Card>
          ) : null}

          {errorMessage ? (
            <Card className="border-rose-500/40 bg-rose-500/10" title="Verification Error">
              <p className="text-sm text-rose-200">{errorMessage}</p>
            </Card>
          ) : null}

          {warnings.length > 0 ? (
            <Card className="border-amber-500/40 bg-amber-500/10" title="Warnings">
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-100">
                {warnings.map((warning, idx) => (
                  <li key={`${warning}-${idx}`}>{warning}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Multi-AI Responses" subtitle="Cross-model agreement overview with expandable answers">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleModels.map((model) => {
                const response = responses.find((item) => item.model === model);
                const source = sourceMap.get(model);
                const isSuccess = source?.source === "openrouter";
                const isMajority = isSuccess && (verification?.majorityModels.includes(model) ?? false);
                const isOutlier = isSuccess && (verification?.outlierModels.includes(model) ?? false);
                const badgeText = !hasRunVerification ? "Ready" : isSuccess ? (isMajority ? "Majority" : isOutlier ? "Outlier" : "Available") : "Unavailable";
                const badgeVariant = !hasRunVerification ? "neutral" : !isSuccess ? "danger" : isOutlier ? "warning" : "success";

                return (
                  <article
                    key={model}
                    className={`rounded-xl border p-3 sm:p-4 transition hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_0_28px_rgba(139,92,246,0.18)] ${
                      !isDemoMode && isMajority ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700 bg-slate-950/60"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-100">{model}</p>
                        <Badge variant="violet" className="text-[10px]">{modelBadgeLabel[model]}</Badge>
                      </div>
                      <Badge variant={badgeVariant}>{badgeText}</Badge>
                    </div>
                    <p className="text-xs leading-5 text-slate-300">
                      {isLoading
                        ? "Verifying response..."
                        : !hasRunVerification
                          ? "Ready to verify"
                          : isDemoMode
                            ? "Model unavailable. Check backend model configuration."
                            : isSuccess
                              ? getShortAnswer(response?.answer)
                              : "Model unavailable"}
                    </p>
                    <p className="mt-3 text-[11px] text-slate-400">Source: SVA Model Layer</p>
                  </article>
                );
              })}
            </div>{actionMessage ? <p className="mt-2 text-xs text-violet-300">{actionMessage}</p> : null}
          </Card>

          <div className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]">
            <Card title="SVA Judge" subtitle="Trust verdict and contradiction summary">
              <p className="text-sm text-slate-300">Verdict: {isDemoMode ? "DEMO PREVIEW" : (verification?.judgeVerdict ?? "caution").toUpperCase()}</p>
              <p className="mt-2 text-sm text-slate-400">
                {isDemoMode
                  ? "SVA Judge requires live model responses and evidence sources before issuing a verdict."
                  : verification?.judgeSummary ?? "Run verification to generate a judge summary."}
              </p>
              {!isDemoMode && verification?.judgeRiskFlags?.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-300">
                  {verification.judgeRiskFlags.map((flag, idx) => (
                    <li key={`${flag}-${idx}`}>{flag}</li>
                  ))}
                </ul>
              ) : null}
            </Card>

            <Card title="SVA Trust Score" subtitle={isDemoMode ? "--/100" : `${trustScore}/100`}>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div
                    className="grid h-24 w-24 place-items-center rounded-full p-1"
                    style={{ background: `conic-gradient(#8b5cf6 ${isDemoMode ? 0 : trustScore * 3.6}deg, #1f2937 0deg)` }}
                  >
                    <div className="grid h-full w-full place-items-center rounded-full bg-slate-950 text-sm font-semibold text-violet-200">{isDemoMode ? "--" : trustScore}</div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{isDemoMode ? "Live Preview" : trustLabel}</p>
                    <p className="text-xs text-slate-400">
                      {isDemoMode
                        ? "Connect live provider API keys to generate a real trust score."
                        : "Confidence is derived from agreement, evidence, source quality, contradiction impact, and claim coverage."}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { label: "Model Agreement", value: verification?.agreementScore ?? 0 },
                    { label: "Evidence Strength", value: verification?.evidenceAlignmentScore ?? 0 },
                    { label: "Source Quality", value: verification?.sourceQualityScore ?? 0 },
                    { label: "Contradiction Impact", value: verification?.trustBreakdown ? verification.trustBreakdown.contradictionImpact : Math.max(0, 100 - (verification?.contradictionScore ?? 0)) },
                    { label: "Claim Coverage", value: verification?.claimVerifications?.length ? Math.round((verification.claimVerifications.filter((c) => ["supported","strongly_supported","partially_supported"].includes(c.status)).length / verification.claimVerifications.length) * 100) : 0 }
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="mb-1 flex justify-between text-xs text-slate-300">
                        <span>{item.label}</span>
                        <span>{isDemoMode ? "--" : `${item.value}%`}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800">
                        <div className="h-2 rounded-full bg-violet-400" style={{ width: `${isDemoMode ? 0 : item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
                  <p className="font-semibold text-slate-100">Consensus Meter</p><p className="mt-1">{verification ? (verification.outlierModels.length === 0 ? `HIGH • ${verification.majorityModels.length}/3 models aligned. No outliers detected.` : verification.outlierModels.length === 1 ? `MODERATE • 2 agree • 1 outlier (${verification.outlierModels.join(", ")}).` : `SPLIT • Models show high disagreement.`) : "Run verification to calculate consensus."}</p><p className="mt-2 font-semibold text-slate-100">Why this score?</p>
                  <p className="mt-1">Model agreement: {verification?.agreementScore ?? 0}% — how closely the AI answers match.</p>
                  <p>Evidence strength: {verification?.evidenceAlignmentScore ?? 0}% — how well external sources support the answer.</p>
                  <p>Contradiction score: {verification?.contradictionScore ?? 0}% — lower is better.</p>
                  <p>Source quality: {verification?.sourceQualityScore ?? 0}% — trust level of retrieved sources.</p>
                </div>
              </div>
            </Card>
          </div>

          <Card
            title="Final SVA Verified Answer"
            subtitle="Highest-confidence response synthesized from majority model alignment and evidence quality."
            className="border-violet-400/40 shadow-[0_0_35px_rgba(139,92,246,0.18)]"
          >
            <p className="text-lg leading-7 text-slate-100">
              {isDemoMode
                ? "Live verification unavailable. Connect provider API keys to generate a final SVA verified answer."
                : verification?.finalAnswer ?? "No verified answer yet."}
            </p>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="font-semibold text-violet-300">Confidence: {isDemoMode ? "--" : verification?.finalConfidenceScore ?? 0}%</span>
              <Badge variant="success" className="text-xs">{isDemoMode ? "Live Preview" : verification?.confidenceLabel ?? "Pending"}</Badge>
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-300">
              <li>{isDemoMode ? "Key takeaways will appear after live provider responses are available." : verification?.reasoning ?? "Key takeaways appear after verification completes."}</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" type="button" onClick={handleCopyAnswer} disabled={isDemoMode || !verification} title={isDemoMode ? "Available after live verification." : undefined}>
                Copy Answer
              </Button>
              <Button type="button" onClick={handleExportReport} disabled={isDemoMode || !verification} title={isDemoMode ? "Available after live verification." : undefined}>
                Export
              </Button>
              <Button variant="ghost" type="button" onClick={async ()=>{ if(!verification){setActionMessage("Share coming soon."); return;} await navigator.clipboard.writeText(`SVA verified: ${verification.finalAnswer}`); setActionMessage("Share text copied to clipboard."); }} disabled={isDemoMode} title={isDemoMode ? "Available after live verification." : undefined}>Share</Button>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Claim Verification Table" className="lg:col-span-3">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                      <th className="px-2 py-2">Claim</th>
                      <th className="px-2 py-2">Verification Status</th>
                      <th className="px-2 py-2">Confidence</th>
                      <th className="px-2 py-2">Supporting Evidence</th>
                      <th className="px-2 py-2">Contradicted By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isDemoMode ? (
                      <tr>
                        <td className="px-2 py-3 text-slate-400" colSpan={5}>
                          Claims will appear after verification.
                        </td>
                      </tr>
                    ) : (
                      (verification?.claimVerifications ?? []).map((row) => (
                        <tr key={row.id} className="border-b border-slate-900/80 align-top">
                          <td className="px-2 py-3 text-slate-200">{row.claim}</td>
                          <td className="px-2 py-3">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${statusStyle[row.status] ?? statusStyle.uncertain}`}>{row.status}</span>
                          </td>
                          <td className="px-2 py-3 text-slate-300">{row.confidenceScore}%</td>
                          <td className="px-2 py-3 text-slate-300">{row.supportingEvidence.length}</td>
                          <td className="px-2 py-3 text-slate-300">{row.contradictedByModels.length ? row.contradictedByModels.join(", ") : "None"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Evidence Panel">
              {isDemoMode ? (
                <p className="text-xs text-slate-400">
                  Evidence sources will appear after verification.
                </p>
              ) : evidenceSnippets.length ? (
                <div className="space-y-3 text-xs">
                  <p className="text-slate-400">
                    Sources retrieved: {evidenceSnippets.length} · Snippets extracted: {evidenceSnippets.length} · Retrieval mode: {meta?.retrievalModeUsed ?? "web"}
                  </p>
                  {[...evidenceSnippets].sort((a, b) => ((b.credibilityScore ?? b.sourceQualityScore ?? 0) - (a.credibilityScore ?? a.sourceQualityScore ?? 0))).map((snippet, idx) => {
                    const evidenceId = snippet.sourceId ?? snippet.url ?? snippet.title;
                    const linkedClaims = verification?.claimVerifications.filter((claim) => claim.linkedEvidenceIds?.includes(evidenceId)) ?? [];
                    return (
                      <article key={`${snippet.title}-${idx}`} className="rounded-lg border border-slate-700/80 bg-slate-900/60 p-3 backdrop-blur-sm transition hover:border-violet-400/50">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-slate-200">{snippet.title}</p>
                          {snippet.sourceDomain ? <Badge>{snippet.sourceDomain}</Badge> : null}
                        </div>
                        <p className="mt-1 text-slate-400">{snippet.text}</p>
                        <Badge variant="success" className="mt-1">Credibility {snippet.credibilityScore ?? snippet.sourceQualityScore ?? 0}%</Badge>
                        <Badge variant="violet" className="ml-2 mt-1">{sourceReliabilityLabel(snippet.credibilityScore ?? snippet.sourceQualityScore ?? 0)}</Badge>
                        {snippet.trustTier ? (
                          <Badge variant="indigo" className="ml-2 mt-1">{snippet.trustTier}</Badge>
                        ) : null}
                        {snippet.sourceCategory ? (
                          <Badge variant="cyan" className="ml-2 mt-1">{snippet.sourceCategory}</Badge>
                        ) : null}
                        {snippet.url ? (
                          <a className="mt-1 block text-violet-300" href={snippet.url} target="_blank" rel="noreferrer">
                            {snippet.url}
                          </a>
                        ) : null}
                        <p className="mt-1 text-slate-500">
                          Relevance: {snippet.relevanceScore}% · Credibility: {snippet.credibilityScore ?? snippet.sourceQualityScore ?? 0}% · Type: {snippet.sourceClassification ?? "unknown"} · {linkedClaims.length > 0 ? `Linked claims: ${linkedClaims.length}` : "Background source"}
                        </p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  {isLoading ? "Searching web... analyzing evidence... comparing sources... generating verdict..." : "Evidence retrieval unavailable. SVA used model consensus only."}
                </p>
              )}
            </Card>
            <Card title="Contradictions">
              <p className="text-sm text-slate-300">{isDemoMode ? "No live contradiction analysis yet. Connect providers to compare real model outputs." : `Contradiction score: ${verification?.contradictionScore ?? 0}%`}</p>
              {!isDemoMode && verification ? (
                <div className="mt-2 space-y-1 text-xs text-slate-300">
                  <p>Contradiction Type: <span className="text-violet-300">{verification.contradictionType ?? "contextual"}</span></p>
                  <p>Consensus Evolution Score: <span className="text-emerald-300">{verification.consensusEvolutionScore ?? 0}%</span></p>
                  <p>{verification.consensusEvolutionSummary}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {verification.contradictionType === "temporal" ? <Badge variant="warning">Historical Claim</Badge> : null}
                    {verification.contradictionType === "consensus_shift" ? <Badge variant="danger">Consensus Shift</Badge> : null}
                    {verification.contradictionType === "direct" ? <Badge variant="danger">Modern Consensus Conflict</Badge> : null}
                    {verification.contradictionType === "contextual" ? <Badge>Contextual Disagreement</Badge> : null}
                  </div>
                </div>
              ) : null}
              <p className="mt-2 text-xs text-slate-400">
                {isDemoMode ? "Contradictions will appear only if models disagree." : meta?.providerMessage ?? "Contradictions will appear only if models disagree."}
              </p>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};
