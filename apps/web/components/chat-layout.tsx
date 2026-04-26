"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  STARTER_PROMPT,
  type EvidenceSnippet,
  type ModelAnswerSource,
  type ModelName,
  type ModelResponse,
  type PerModelSource,
  type VerificationMode,
  type VerificationExecutionMeta,
  type VerificationResult,
  type VerifyApiResponse
} from "../lib/models";

const LOADING_STEPS = ["Querying models…", "Retrieving evidence…", "Analyzing agreement…", "Calculating trust score…"];
const EXAMPLE_PROMPTS = [
  "Is coffee healthy?",
  "Did humans land on the moon?",
  "Who is the CEO of OpenAI?",
  "What is the tallest mountain in the world above sea level?"
];
type HistoryItem = {
  prompt: string;
  mode: VerificationMode;
  resultSummary: string;
  timestamp: string;
  confidence: number;
  verdict: string;
};

type UserSession = {
  userId: string;
  email: string;
  plan: "free" | "pro";
  usageCount: number;
  createdAt: string;
  usedToday: number;
  dailyLimit: number;
  onboardingCompleted: boolean;
};

const MODE_OPTIONS: Array<{ value: VerificationMode; label: string }> = [
  { value: "fast", label: "Fast" },
  { value: "deep", label: "Deep Verify" },
  { value: "research", label: "Research" }
];

const modeLabel = (mode: VerificationMode): string => {
  if (mode === "deep") {
    return "DEEP VERIFY";
  }
  if (mode === "research") {
    return "RESEARCH";
  }
  return "FAST";
};

const deriveTrustVerdict = (verification: VerificationResult | null): string => {
  if (!verification) {
    return "Not Enough Evidence";
  }

  if (
    verification.finalConfidenceScore >= 78 &&
    verification.evidenceAlignmentScore >= 60 &&
    (verification.contradictionScore ?? 0) <= 25
  ) {
    return "Strongly Supported";
  }

  if (
    verification.finalConfidenceScore >= 65 &&
    verification.evidenceAlignmentScore >= 45 &&
    (verification.contradictionScore ?? 0) <= 40
  ) {
    return "Supported with Caution";
  }

  if (verification.evidenceAlignmentScore >= 30) {
    return "Weakly Supported";
  }

  return "Not Enough Evidence";
};

export const ChatLayout = () => {
  const [prompt, setPrompt] = useState(STARTER_PROMPT);
  const [mode, setMode] = useState<VerificationMode>("fast");
  const [activeResponses, setActiveResponses] = useState<ModelResponse[]>([]);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [executionMeta, setExecutionMeta] = useState<VerificationExecutionMeta | null>(null);
  const [modelSources, setModelSources] = useState<PerModelSource[]>([]);
  const [evidenceSnippets, setEvidenceSnippets] = useState<EvidenceSnippet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [copyReportStatus, setCopyReportStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [saveReportStatus, setSaveReportStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  const [user, setUser] = useState<UserSession | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [verificationTimeout, setVerificationTimeout] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "sent">("idle");

  const modelStatuses = useMemo(() => {
    if (!verification) {
      return new Map<ModelName, "Pending" | "Majority" | "Outlier">();
    }

    return new Map(
      activeResponses.map((response) => {
        const status = verification.majorityModels.includes(response.model) ? "Majority" : "Outlier";
        return [response.model, status];
      })
    );
  }, [activeResponses, verification]);

  const modelSourceMap = useMemo(() => {
    return new Map<ModelName, ModelAnswerSource>(modelSources.map((entry) => [entry.model, entry.source]));
  }, [modelSources]);

  const trustWarnings = useMemo(() => {
    if (!verification) {
      return [];
    }

    const warnings: string[] = [];
    if (verification.finalConfidenceScore < 65) {
      warnings.push("Low overall confidence — verify before relying on this answer.");
    }
    if ((verification.contradictionScore ?? 0) > 35) {
      warnings.push("Contradiction detected between model responses.");
    }
    if (verification.evidenceAlignmentScore < 45) {
      warnings.push("Low evidence support — verify before relying on this answer.");
    }
    if ((verification.sourceQualityScore ?? 0) < 45) {
      warnings.push("Weak source quality — confidence reduced.");
    }
    if (evidenceSnippets.length === 0) {
      warnings.push("No external evidence found. Confidence limited.");
    }
    if (executionMeta?.mode === "fallback_only") {
      warnings.push("All model responses are simulated due to provider unavailability.");
    }
    if ((verification.contradictionScore ?? 0) > 55) {
      warnings.push("High contradiction detected — treat this result as unresolved.");
    }

    return warnings;
  }, [verification, evidenceSnippets.length, executionMeta?.mode]);

  const trustVerdict = useMemo(() => deriveTrustVerdict(verification), [verification]);

  useEffect(() => {
    if (!isLoading) {
      setLoadingStepIndex(0);
      return;
    }

    const timer = setInterval(() => {
      setLoadingStepIndex((current) => (current + 1) % LOADING_STEPS.length);
    }, 900);

    return () => clearInterval(timer);
  }, [isLoading]);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/history");
    const data = (await response.json()) as { ok: boolean; history?: HistoryItem[] };
    if (!response.ok || !data.ok) {
      setHistory([]);
      return;
    }
    setHistory((data.history ?? []).slice(0, 20));
  }, []);

  const loadSession = useCallback(async () => {
    const response = await fetch("/api/auth/me");
    const data = (await response.json()) as { ok: boolean; user: UserSession | null };
    if (!response.ok || !data.ok || !data.user) {
      setUser(null);
      return;
    }
    setUser(data.user);
  }, []);

  useEffect(() => {
    void (async () => {
      await loadSession();
    })();
  }, [loadSession]);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    void loadHistory();
    setIsOnboardingOpen(!user.onboardingCompleted);
  }, [user, loadHistory]);

  const reportText = useMemo(() => {
    if (!verification) {
      return "";
    }

    const keyClaims = verification.claimVerifications.slice(0, 5).map((claim) => `* ${claim.claim} (${claim.status})`).join("\n");
    return `SVA Verification Report

Question: ${prompt}

Mode: ${modeLabel(mode)}

Final Answer: ${verification.finalAnswer}

Trust Verdict: ${trustVerdict}

Confidence: ${verification.finalConfidenceScore}/100

Judge Verdict: ${verification.judgeVerdict ?? "caution"}

Majority Models: ${verification.majorityModels.join(", ") || "None"}

Outliers: ${verification.outlierModels.join(", ") || "None"}

Agreement Score: ${verification.agreementScore}

Evidence Alignment: ${verification.evidenceAlignmentScore}

Source Quality: ${verification.sourceQualityScore ?? 0}

Contradiction Score: ${verification.contradictionScore ?? 0}

Trust Breakdown: ${
      verification.trustBreakdown
        ? `Agreement ${verification.trustBreakdown.agreementContribution}, Evidence ${verification.trustBreakdown.evidenceContribution}, Source ${verification.trustBreakdown.sourceContribution}, Contradiction Impact ${verification.trustBreakdown.contradictionImpact}`
        : "N/A"
    }

Why Not Higher: ${verification.whyNotHigher ?? "N/A"}

Deep Analysis Notes: ${verification.deepAnalysisNotes ?? "N/A"}

Research Summary: ${verification.researchSummary ?? "N/A"}

Key Claims:
${keyClaims || "* None extracted"}`;
  }, [verification, prompt, trustVerdict, mode]);

  const reportPayload = useMemo(() => {
    if (!verification) {
      return null;
    }

    return {
      prompt,
      mode,
      trustVerdict,
      judgeVerdict: verification.judgeVerdict ?? "caution",
      trustBreakdown: verification.trustBreakdown ?? null,
      whyNotHigher: verification.whyNotHigher ?? null,
      deepAnalysisNotes: verification.deepAnalysisNotes ?? null,
      researchSummary: verification.researchSummary ?? null,
      verification,
      responses: activeResponses,
      modelSources,
      evidenceSnippets,
      meta: executionMeta
    };
  }, [verification, prompt, mode, trustVerdict, activeResponses, modelSources, evidenceSnippets, executionMeta]);

  const resetChatState = () => {
    setPrompt(STARTER_PROMPT);
    setMode("fast");
    setVerification(null);
    setActiveResponses([]);
    setExecutionMeta(null);
    setModelSources([]);
    setEvidenceSnippets([]);
    setErrorMessage(null);
    setSelectedHistoryItem(null);
    setVerificationTimeout(false);
  };

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const endpoint = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const data = (await response.json()) as { ok: boolean; message?: string; user?: UserSession };
      if (!response.ok || !data.ok || !data.user) {
        setAuthError(data.message ?? "Authentication failed.");
        return;
      }
      setUser(data.user);
      setAuthPassword("");
      setAuthEmail("");
    } catch {
      setAuthError("Authentication request failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setVerification(null);
    setHistory([]);
    setSelectedHistoryItem(null);
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      setErrorMessage("Please login first.");
      return;
    }

    setIsLoading(true);
    setVerificationTimeout(false);
    setErrorMessage(null);
    setVerification(null);
    setActiveResponses([]);
    setExecutionMeta(null);
    setModelSources([]);
    setEvidenceSnippets([]);
    setSelectedHistoryItem(null);
    const timeout = setTimeout(() => setVerificationTimeout(true), 10_000);

    try {
      await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "mode_selected", metadata: { mode } })
      });
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

      setVerification(data.verification);
      setActiveResponses(data.responses);
      setExecutionMeta(data.meta);
      setModelSources(data.modelSources);
      setEvidenceSnippets(data.evidenceSnippets);
      await loadHistory();
      await loadSession();
    } catch {
      setErrorMessage("Verification request failed. Please try again.");
    } finally {
      clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  const handleCopyReport = async () => {
    if (!reportText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(reportText);
      setCopyReportStatus("copied");
      setTimeout(() => setCopyReportStatus("idle"), 1800);
    } catch {
      setCopyReportStatus("failed");
      setErrorMessage("Unable to copy report. Please copy manually.");
      setTimeout(() => setCopyReportStatus("idle"), 2200);
    }
  };

  const handleExportJsonReport = () => {
    if (!reportPayload) {
      return;
    }

    const blob = new Blob([JSON.stringify(reportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
    anchor.download = `sva-verification-report-${timestamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveReport = () => {
    if (!verification || !user) {
      return;
    }

    setSaveReportStatus("saved");
    setTimeout(() => setSaveReportStatus("idle"), 1800);
  };

  const handleClearHistory = async () => {
    await fetch("/api/history", { method: "DELETE" });
    setHistory([]);
    setSelectedHistoryItem(null);
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
    setSelectedHistoryItem(item);
    setPrompt(item.prompt);
    setMode(item.mode);
  };

  const handleUpgrade = async () => {
    if (!user) {
      return;
    }
    const response = await fetch("/api/billing/upgrade", { method: "POST" });
    const data = (await response.json()) as { ok: boolean; user?: UserSession; message?: string };
    if (!response.ok || !data.ok || !data.user) {
      setErrorMessage(data.message ?? "Upgrade failed.");
      return;
    }
    setUser(data.user);
  };

  const handleOnboardingComplete = async () => {
    await fetch("/api/onboarding/complete", { method: "POST" });
    setIsOnboardingOpen(false);
    setOnboardingStep(1);
    await loadSession();
  };

  const handleSubmitFeedback = async () => {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback })
    });
    setFeedback("");
    setFeedbackStatus("sent");
    setTimeout(() => setFeedbackStatus("idle"), 1500);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>SVA</h1>
        <p className="subtitle">Super Verified AI</p>
        <ul className="launch-highlights">
          <li>⚡ Fast / Deep / Research modes</li>
          <li>🧠 SVA Judge</li>
          <li>📤 Shareable trust reports</li>
        </ul>
        {user ? (
          <>
            <p className="meta-text">
              {user.email}
              <br />
              Plan: <strong>{user.plan.toUpperCase()}</strong> • Usage today: {user.usedToday}/{user.dailyLimit}
            </p>
            <button type="button" onClick={resetChatState}>
              + New Chat
            </button>
            <button type="button" className="secondary-button" onClick={handleClearHistory}>
              Clear History
            </button>
            <button type="button" className="secondary-button" onClick={handleLogout}>
              Logout
            </button>
            {user.plan === "free" ? (
              <div className="pricing-card">
                <p className="meta-text">Pro Plan</p>
                <p>
                  <strong>₹499/month</strong> <span className="price-badge">Early Access Price</span>
                </p>
                <p className="meta-text">
                  <span className="price-strike">Original ₹999</span> • Limited early pricing
                </p>
                <button id="upgrade" type="button" onClick={handleUpgrade}>
                  Upgrade to Pro
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <form className="auth-form" onSubmit={handleAuth}>
            <h3>{authMode === "signup" ? "Create account" : "Login"}</h3>
            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              required
            />
            <button type="submit" disabled={authLoading}>
              {authLoading ? "Please wait..." : authMode === "signup" ? "Sign up" : "Login"}
            </button>
            <button type="button" className="secondary-button" onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}>
              Switch to {authMode === "signup" ? "Login" : "Sign up"}
            </button>
            {authError ? <p className="meta-text">{authError}</p> : null}
          </form>
        )}

        <div className="history-section">
          <h3>History</h3>
          {history.length === 0 ? (
            <p className="meta-text">No saved reports yet.</p>
          ) : (
            <ul className="history-list">
              {history.map((item) => (
                <li key={`${item.timestamp}-${item.prompt.slice(0, 24)}`}>
                  <button type="button" className="history-item" onClick={() => handleSelectHistoryItem(item)}>
                    <div className="history-item-top">
                      <span className="mode-badge">{modeLabel(item.mode)}</span>
                      <span>{item.confidence}/100</span>
                    </div>
                    <p>{item.prompt}</p>
                    <small>{new Date(item.timestamp).toLocaleString()}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="chat-pane">
        <header>
          <h2>SVA Trust Engine</h2>
          <p>Verify AI answers using multi-model agreement, evidence, and contradiction analysis.</p>
          <div className="demo-note">
            Phase 4 Trust Engine: multi-model + evidence + contradiction scoring.
          </div>
          <p className="meta-text">SVA does not claim perfect truth — it shows how confident the system is and why.</p>
        </header>

        <form className="chat-input" onSubmit={handleVerify}>
          <div className="mode-selector">
            {MODE_OPTIONS.map((option) => (
              <label key={option.value} className={mode === option.value ? "mode-option active" : "mode-option"}>
                <input
                  type="radio"
                  name="verification-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={(event) => setMode(event.target.value as VerificationMode)}
                  disabled={isLoading}
                />
                {option.label}
              </label>
            ))}
          </div>
          <label htmlFor="question">Prompt</label>
          <textarea
            id="question"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Verifying..." : "Verify"}
          </button>
          <label className="debug-toggle">
            <input type="checkbox" checked={showDebugInfo} onChange={(event) => setShowDebugInfo(event.target.checked)} />
            Show Debug Info
          </label>
        </form>

        <section className="prompt-examples">
          {EXAMPLE_PROMPTS.map((example) => (
            <button key={example} type="button" onClick={() => setPrompt(example)}>
              {example}
            </button>
          ))}
        </section>

        {isLoading ? (
          <section className="result-card retrieval-state loading-card">
            <span className="spinner" />
            {LOADING_STEPS[loadingStepIndex]}
          </section>
        ) : null}
        {verificationTimeout ? (
          <section className="result-card warning-state">Verification is taking longer than expected. Results may arrive shortly.</section>
        ) : null}


        {executionMeta ? (
          <section className="result-card provider-state">
            Source mode: {executionMeta.mode === "real_provider" ? "At least one live provider" : "Full demo fallback"}. GPT: {executionMeta.gptSource}. Claude: {executionMeta.claudeSource}. Gemini: {executionMeta.geminiSource}. DeepSeek: {executionMeta.deepseekSource}. {executionMeta.providerMessage}
          </section>
        ) : null}

        {executionMeta ? (
          <section className="result-card retrieval-state">
            Retrieval: {executionMeta.retrievalModeUsed} • snippets: {executionMeta.retrievalSourceCount} • fallback to mock: {executionMeta.retrievalFallbackToMock ? "yes" : "no"}
          </section>
        ) : null}
        {modelSources.some((entry) => entry.source === "fallback_generated") ? (
          <section className="result-card warning-state">Some AI providers failed, results may be partial.</section>
        ) : null}
        {executionMeta?.retrievalFallbackToMock || evidenceSnippets.length === 0 ? (
          <section className="result-card warning-state">Evidence is limited.</section>
        ) : null}

        {errorMessage ? <section className="result-card error-state">{errorMessage}</section> : null}

        {!verification && selectedHistoryItem ? (
          <section className="result-card summary-card">
            <h3>Saved Report Summary</h3>
            <p>
              <span className="mode-badge">{modeLabel(selectedHistoryItem.mode)}</span>
            </p>
            <p>
              <strong>Prompt:</strong> {selectedHistoryItem.prompt}
            </p>
            <p>
              <strong>Final Answer:</strong> {selectedHistoryItem.resultSummary}
            </p>
            <p className="meta-text">
              Confidence: {selectedHistoryItem.confidence}/100 • Verdict: {selectedHistoryItem.verdict}
            </p>
          </section>
        ) : null}

        {!verification ? (
          <>
            <section className="result-card empty-state">
              <h3>Ready to verify</h3>
              <p>
                Enter a prompt and click <strong>Verify</strong> to run the Phase 4 Trust Engine workflow.
              </p>
            </section>
            <section className="result-card workflow-card">
              <h3>How SVA works</h3>
              <div className="workflow-list">
                <p>1. Ask a question</p>
                <p>2. SVA compares model answers</p>
                <p>3. SVA checks evidence and contradictions</p>
                <p>4. You get a trust verdict</p>
              </div>
            </section>
            <section className="result-card claim-section">
              <h3>Claim-Level Verification</h3>
              <p className="meta-text">Claims will appear after verification.</p>
            </section>
          </>
        ) : (
          <>
            <section className="result-grid">
              <article className="result-card final-answer">
                <h3>1. Final Answer</h3>
                <p>
                  <span className="mode-badge">{modeLabel(mode)}</span>
                </p>
                <p>{verification.finalAnswer}</p>
                <p className="meta-text">
                  Trust Verdict: <strong>{trustVerdict}</strong>
                </p>
                <div className="action-row">
                  <button type="button" onClick={handleSaveReport}>
                    Save Report
                  </button>
                  <button type="button" onClick={handleCopyReport}>
                    Copy Report
                  </button>
                  <button type="button" onClick={handleExportJsonReport}>
                    Export JSON Report
                  </button>
                </div>
                {copyReportStatus === "copied" ? <p className="meta-text">Report copied.</p> : null}
                {copyReportStatus === "failed" ? <p className="meta-text">Copy failed. Please copy manually.</p> : null}
                {saveReportStatus === "saved" ? <p className="meta-text">Report saved to history.</p> : null}
                {saveReportStatus === "failed" ? <p className="meta-text">Could not save report.</p> : null}
              </article>

              <article className="result-card confidence">
                <h3>2. Confidence Score</h3>
                <p className="score">{verification.finalConfidenceScore}</p>
                <p className="confidence-label">{verification.confidenceLabel} (agreement + evidence)</p>
                <p className="meta-text">Agreement: {verification.agreementScore}/100 • Evidence alignment: {verification.evidenceAlignmentScore}/100</p>
              </article>

              <article className="result-card model-list">
                <h3>3. Compared Models</h3>
                <ul>
                  {activeResponses.map((response) => {
                    const status = modelStatuses.get(response.model) ?? "Pending";
                    const source = modelSourceMap.get(response.model);

                    return (
                      <li key={response.model}>
                        <span>{response.model}</span>
                        <div className="pill-group">
                          <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>
                          {source ? <span className="badge badge-source">{source.replaceAll("_", " ")}</span> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            </section>

            <section className="result-card summary-card">
              <h3>Verification Summary</h3>
              <p>
                Majority models: <strong>{verification.majorityModels.join(", ") || "None"}</strong>. Outliers: <strong>{verification.outlierModels.join(", ") || "None"}</strong>. Confidence label: <strong>{verification.confidenceLabel}</strong>.
              </p>
              <p className="meta-text">
                {verification.finalConfidenceScore >= 75
                  ? "Trust is relatively strong because agreement and evidence are aligned."
                  : "Trust is cautious due to weaker agreement, evidence, or contradiction signals."}
              </p>
            </section>

            <section className="result-card trust-breakdown">
              <h3>Trust Breakdown</h3>
              <p className="meta-text">Higher agreement/evidence/source quality improves confidence. Higher contradiction lowers confidence.</p>
              <div className="score-bars">
                {[
                  ["Agreement", verification.agreementScore],
                  ["Evidence", verification.evidenceAlignmentScore],
                  ["Source Quality", verification.sourceQualityScore ?? 0],
                  ["Contradiction", verification.contradictionScore ?? 0],
                  ["Final Confidence", verification.finalConfidenceScore]
                ].map(([label, value]) => (
                  <div key={label} className="score-bar-row">
                    <span>{label}</span>
                    <div className="score-bar-track">
                      <div className="score-bar-fill" style={{ width: `${Math.max(0, Math.min(100, Number(value)))}%` }} />
                    </div>
                    <strong>{value}</strong>
                  </div>
                ))}
                <p className="meta-text">Contradiction penalty: {verification.contradictionPenalty ?? 0}</p>
              </div>
            </section>

            {verification.trustBreakdown ? (
              <section className="result-card trust-tree-card">
                <h3>Trust Reasoning Tree</h3>
                <ul className="trust-tree">
                  <li>
                    Agreement contribution: <strong>{verification.trustBreakdown.agreementContribution}</strong>
                  </li>
                  <li>
                    Evidence contribution: <strong>{verification.trustBreakdown.evidenceContribution}</strong>
                  </li>
                  <li>
                    Source contribution: <strong>{verification.trustBreakdown.sourceContribution}</strong>
                  </li>
                  <li>
                    Contradiction impact: <strong>-{verification.trustBreakdown.contradictionImpact}</strong>
                  </li>
                </ul>
              </section>
            ) : null}

            {verification.whyNotHigher ? (
              <section className="result-card why-card">
                <h3>Why not higher?</h3>
                <p>{verification.whyNotHigher}</p>
              </section>
            ) : null}

            {verification.deepAnalysisNotes ? (
              <section className="result-card summary-card">
                <h3>Deep Analysis Notes</h3>
                <p>{verification.deepAnalysisNotes}</p>
              </section>
            ) : null}

            {verification.researchSummary ? (
              <section className="result-card summary-card">
                <h3>Research Summary</h3>
                <p>{verification.researchSummary}</p>
              </section>
            ) : null}

            <section className="result-card judge-card">
              <h3>SVA Judge</h3>
              <p>
                Verdict: <strong>{verification.judgeVerdict ?? "caution"}</strong>
              </p>
              <p className="meta-text">{verification.judgeSummary ?? "Judge summary is unavailable for this run."}</p>
              {verification.judgeRiskFlags && verification.judgeRiskFlags.length > 0 ? (
                <ul className="why-list">
                  {verification.judgeRiskFlags.map((flag, index) => (
                    <li key={index}>⚠️ {flag}</li>
                  ))}
                </ul>
              ) : (
                <p className="meta-text">No major judge risk flags detected.</p>
              )}
            </section>

            {trustWarnings.length > 0 ? (
              <section className="result-card warning-state">
                <h3>Trust Warnings</h3>
                <ul className="why-list">
                  {trustWarnings.map((warning, index) => (
                    <li key={index}>⚠️ {warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="result-card claim-section">
              <h3>Claim-Level Verification</h3>
              {verification.claimVerifications.length === 0 ? (
                <p className="meta-text">No atomic factual claims were extracted from the final answer.</p>
              ) : (
                <div className="claim-list">
                  {verification.claimVerifications.map((claim) => (
                    <article key={claim.id} className="claim-card">
                      <div className="claim-header">
                        <strong>{claim.claim}</strong>
                        <span className={`claim-status claim-status-${claim.status}`}>{claim.status.replaceAll("_", " ")}</span>
                      </div>
                      <p className="meta-text">Confidence: {claim.confidenceScore}/100</p>
                      <p>{claim.explanation}</p>
                      {claim.supportingEvidence.length > 0 ? (
                        <ul className="claim-evidence-list">
                          {claim.supportingEvidence.map((snippet, index) => (
                            <li key={`${claim.id}-evidence-${index}`}>{snippet.title}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="meta-text">No strong supporting evidence snippets were found for this claim.</p>
                      )}
                      {claim.contradictedByModels.length > 0 ? (
                        <p className="meta-text">Contradicted by models: {claim.contradictedByModels.join(", ")}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="result-card evidence-section">
              <h3>Evidence Support</h3>
              {evidenceSnippets.length === 0 ? (
                <p className="meta-text">No evidence snippets were available for this prompt.</p>
              ) : (
                <div className="evidence-list">
                  {evidenceSnippets.map((snippet, idx) => (
                    <article className="evidence-card" key={`${snippet.title}-${idx}`}>
                      <p>
                        <strong>{snippet.title}</strong>
                      </p>
                      <p className="meta-text">
                        Relevance: {snippet.relevanceScore}/100 • Source quality: {snippet.sourceQualityScore ?? 0}/100 • {snippet.sourceType}
                        {snippet.url ? ` • ${snippet.url}` : snippet.sourceId ? ` • ${snippet.sourceId}` : ""}
                      </p>
                      <p>{snippet.text}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="result-card why-card">
              <h3>Why this answer?</h3>
              <p>{verification.reasoning}</p>
              <ul className="why-list">
                <li>
                  Agreement signal: {verification.majorityModels.length}/{activeResponses.length} models clustered.
                </li>
                <li>Majority models: {verification.majorityModels.join(", ")}</li>
                <li>
                  Outliers: {verification.outlierModels.length > 0 ? verification.outlierModels.join(", ") : "None"}
                </li>
                <li>
                  Confidence rationale: {verification.confidenceLabel} confidence (final: {verification.finalConfidenceScore}, agreement: {verification.agreementScore}, evidence: {verification.evidenceAlignmentScore}).
                </li>
                {typeof verification.sourceQualityScore === "number" ? (
                  <li>Average source quality: {verification.sourceQualityScore}/100</li>
                ) : null}
                {typeof verification.contradictionScore === "number" ? (
                  <li>
                    Contradiction signal: {verification.contradictionScore}/100 (penalty: {verification.contradictionPenalty ?? 0})
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="result-card why-card">
              <h3>System Explanation</h3>
              <p>{verification.explanation}</p>
            </section>

            <section className="result-card raw-section">
              <h3>Raw Model Responses</h3>
              <div className="raw-list">
                {activeResponses.map((response) => {
                  const source = modelSourceMap.get(response.model);
                  const fallbackState = modelSources.find((entry) => entry.model === response.model)?.fallbackState;

                  return (
                    <details key={response.model}>
                      <summary>
                        {response.model} response {source ? `(${source.replaceAll("_", " ")})` : ""}
                      </summary>
                      {fallbackState && fallbackState !== "none" ? (
                        <p className="meta-text">Fallback state: {fallbackState.replaceAll("_", " ")}</p>
                      ) : null}
                      <p>{response.answer}</p>
                    </details>
                  );
                })}
              </div>
            </section>

            {showDebugInfo ? (
              <section className="result-card raw-section">
                <h3>Debug Info</h3>
                <p className="meta-text">Intermediate scoring and grouping signals.</p>
                <pre>{JSON.stringify(verification.debug ?? {}, null, 2)}</pre>
              </section>
            ) : null}
          </>
        )}

        <section className="result-card">
          <h3>Feedback</h3>
          <div className="action-row">
            <input
              className="feedback-input"
              placeholder="Share quick feedback"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
            <button type="button" onClick={handleSubmitFeedback}>
              Submit
            </button>
          </div>
          {feedbackStatus === "sent" ? <p className="meta-text">Feedback sent. Thank you.</p> : null}
        </section>

        <details className="result-card">
          <summary>Launch Checklist Panel (dev)</summary>
          <ul className="why-list">
            <li>{user ? "✅" : "❌"} Auth working</li>
            <li>{user?.plan === "pro" ? "✅" : "⚠️"} Payments simulated</li>
            <li>{user ? "✅" : "❌"} Limits enforced</li>
            <li>✅ Analytics logging</li>
            <li>✅ Errors handled</li>
            <li>✅ Mobile responsive</li>
          </ul>
        </details>

        <footer className="app-footer-note">
          SVA may be incorrect. Do not use for medical, legal, or financial decisions. SVA uses third-party AI providers and
          is an experimental product. Always verify critical decisions with primary sources.{" "}
          <a href="/privacy">Privacy Policy</a> • <a href="/terms">Terms of Service</a>
        </footer>
      </main>
      {isOnboardingOpen ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <h3>Welcome to SVA</h3>
            {onboardingStep === 1 ? <p>Step 1: What do you want to verify?</p> : null}
            {onboardingStep === 2 ? <p>Step 2: Try example queries like “Is coffee healthy?” or “Did humans land on the moon?”</p> : null}
            {onboardingStep === 3 ? (
              <ul>
                <li>Multi-model comparison</li>
                <li>Evidence verification</li>
                <li>Trust score</li>
              </ul>
            ) : null}
            <div className="action-row">
              {onboardingStep < 3 ? (
                <button type="button" onClick={() => setOnboardingStep((step) => Math.min(step + 1, 3))}>
                  Next
                </button>
              ) : (
                <button type="button" onClick={handleOnboardingComplete}>
                  Start verifying
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
