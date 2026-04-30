"use client";

import { type FormEvent, useMemo, useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { DashboardHeader } from "./dashboard-header";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  STARTER_PROMPT,
  type EvidenceSnippet,
  type ModelResponse,
  type PerModelSource,
  type VerificationExecutionMeta,
  type VerificationMode,
  type VerificationResult,
  type VerifyApiResponse
} from "../lib/models";

const visibleModels = ["GPT", "Gemini", "DeepSeek"] as const;

const statusStyle: Record<string, string> = {
  supported: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  partially_supported: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  contradicted: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  unsupported: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  insufficient_evidence: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  uncertain: "bg-slate-500/20 text-slate-300 border-slate-500/40"
};

export const SaasDashboard = () => {
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

  const sourceMap = useMemo(() => new Map(modelSources.map((item) => [item.model, item])), [modelSources]);
  const isDemoMode = (meta?.mode === "fallback_only" || (modelSources.length > 0 && modelSources.every((item) => item.source === "fallback_generated"))) && !isLoading;
  const contradictionCount = !isDemoMode && verification?.contradictionScore ? Math.max(0, Math.ceil(verification.contradictionScore / 25)) : 0;

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setWarnings([]);
    setResponses([]);
    setModelSources([]);
    setEvidenceSnippets([]);
    setVerification(null);
    setMeta(null);

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
      setWarnings(data.warnings ?? []);
    } catch {
      setErrorMessage("Verification request failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const trustScore = verification?.finalConfidenceScore ?? 0;
  const trustLabel =
    verification?.confidenceLabel === "High"
      ? "Highly Reliable"
      : verification?.confidenceLabel === "Medium"
        ? "Moderately Reliable"
        : verification?.confidenceLabel === "Low"
          ? "Low Reliability"
          : "Awaiting verification";

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-slate-100">
      <div className="mx-auto flex max-w-[1600px]">
        <AppSidebar contradictionCount={contradictionCount} />

        <main className="flex-1 space-y-4 p-5">
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
            <Card className="border-amber-500/40 bg-amber-500/10 py-3" title="Demo Mode">
              <p className="text-sm text-amber-100">
                Live AI providers are not connected yet. Add API keys in Vercel to enable real verification.
              </p>
              <details className="mt-2 text-xs text-amber-100">
                <summary className="cursor-pointer text-amber-200">Setup helper</summary>
                <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                  <li>OPENAI_API_KEY</li>
                                    <li>GEMINI_API_KEY</li>
                  <li>DEEPSEEK_API_KEY</li>
                                    <li>RETRIEVAL_PROVIDER=mock or web</li>
                  <li>WEB_RETRIEVAL_API_KEY (for web mode)</li>
                </ul>
              </details>
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
            <div className="grid gap-4 xl:grid-cols-5 lg:grid-cols-3 sm:grid-cols-2">
              {visibleModels.map((model) => {
                const response = responses.find((item) => item.model === model);
                const source = sourceMap.get(model);
                const isMajority = verification?.majorityModels.includes(model) ?? false;
                const isOutlier = verification?.outlierModels.includes(model) ?? false;
                const badgeText = isDemoMode ? "Demo" : isMajority ? "Majority" : isOutlier ? "Outlier" : "Waiting";
                const badgeClass = isDemoMode
                  ? "bg-slate-500/20 text-slate-300"
                  : isOutlier
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-emerald-500/20 text-emerald-300";

                return (
                  <article
                    key={model}
                    className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_0_28px_rgba(139,92,246,0.18)] ${
                      !isDemoMode && isMajority ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700 bg-slate-950/60"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-100">{model}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>{badgeText}</span>
                    </div>
                    <p className="text-xs leading-5 text-slate-300">
                      {isLoading
                        ? "Verifying response..."
                        : isDemoMode
                          ? "Demo response placeholder. Connect this provider API key to enable live model output."
                          : response?.answer ?? "Waiting"}
                    </p>
                    <p className="mt-3 text-[11px] text-slate-400">Source: {isDemoMode ? "Fallback/Demo" : source?.source === "real_provider" ? "Live Provider" : "Fallback/Demo"}</p>
                  </article>
                );
              })}
            </div>
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
                    <p className="text-sm font-semibold text-slate-100">{isDemoMode ? "Demo Preview" : trustLabel}</p>
                    <p className="text-xs text-slate-400">
                      {isDemoMode
                        ? "Connect live provider API keys to generate a real trust score."
                        : "Confidence is derived from agreement, evidence, source quality, and contradiction impact."}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { label: "Model Agreement", value: verification?.agreementScore ?? 0 },
                    { label: "Evidence Strength", value: verification?.evidenceAlignmentScore ?? 0 },
                    { label: "Source Quality", value: verification?.sourceQualityScore ?? 0 },
                    { label: "Consistency", value: Math.max(0, 100 - (verification?.contradictionScore ?? 0)) }
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
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">{isDemoMode ? "Demo Preview" : verification?.confidenceLabel ?? "Pending"}</span>
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-300">
              <li>{isDemoMode ? "Key takeaways will appear after live provider responses are available." : verification?.reasoning ?? "Key takeaways appear after verification completes."}</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" type="button" disabled={isDemoMode} title={isDemoMode ? "Available after live verification." : undefined}>
                Copy Answer
              </Button>
              <Button type="button" disabled={isDemoMode} title={isDemoMode ? "Available after live verification." : undefined}>
                Export
              </Button>
              <Button variant="ghost" type="button" disabled={isDemoMode} title={isDemoMode ? "Available after live verification." : undefined}>
                Share
              </Button>
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
                          Claim-level verification will appear here after live provider responses are connected.
                        </td>
                      </tr>
                    ) : (
                      (verification?.claimVerifications ?? []).map((row) => (
                        <tr key={row.id} className="border-b border-slate-900/80 align-top">
                          <td className="px-2 py-3 text-slate-200">{row.claim}</td>
                          <td className="px-2 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-xs ${statusStyle[row.status] ?? statusStyle.uncertain}`}>{row.status}</span>
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
                  Evidence sources will appear here after live providers or web retrieval are connected.
                </p>
              ) : evidenceSnippets.length ? (
                <div className="space-y-3 text-xs">
                  {evidenceSnippets.map((snippet, idx) => (
                    <article key={`${snippet.title}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                      <p className="font-semibold text-slate-200">{snippet.title}</p>
                      <p className="mt-1 text-slate-400">{snippet.text}</p>
                      {snippet.url ? (
                        <a className="mt-1 block text-violet-300" href={snippet.url} target="_blank" rel="noreferrer">
                          {snippet.url}
                        </a>
                      ) : null}
                      <p className="mt-1 text-slate-500">
                        Relevance: {snippet.relevanceScore}% · Source quality: {snippet.sourceQualityScore ?? 0}%
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">{isLoading ? "Fetching evidence..." : "No evidence yet."}</p>
              )}
            </Card>
            <Card title="Contradictions">
              <p className="text-sm text-slate-300">{isDemoMode ? "No live contradiction analysis yet. Connect providers to compare real model outputs." : `Contradiction score: ${verification?.contradictionScore ?? 0}%`}</p>
              <p className="mt-2 text-xs text-slate-400">
                {isDemoMode ? "Demo mode: contradiction scoring is disabled for fallback-only runs." : meta?.providerMessage ?? "Provider state appears here after verification."}
              </p>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};
