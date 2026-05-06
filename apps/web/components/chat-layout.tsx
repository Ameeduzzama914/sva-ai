"use client";

import { type ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  STARTER_PROMPT,
  type EvidenceSnippet,
  type ModelResponse,
  type PerModelSource,
  type VerificationExecutionMeta,
  type VerificationMode,
  type VerificationResult,
  type VerifyApiResponse,
  type ModelName
} from "../lib/models";

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

const visibleResponseModels: ModelName[] = ["Fast AI", "Balanced AI", "Research AI"];
const modelBadgeLabel: Record<ModelName, string> = {
  "Fast AI": "Mistral 7B",
  "Balanced AI": "Llama 3.1 8B",
  "Research AI": "Gemma 7B"
};

const navItems = ["New Query", "History", "Saved", "Models", "Settings"] as const;

type NavItem = (typeof navItems)[number];

export const ChatLayout = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [prompt, setPrompt] = useState(STARTER_PROMPT);
  const [mode, setMode] = useState<VerificationMode>("fast");
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [modelSources, setModelSources] = useState<PerModelSource[]>([]);
  const [evidenceSnippets, setEvidenceSnippets] = useState<EvidenceSnippet[]>([]);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [meta, setMeta] = useState<VerificationExecutionMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeNav, setActiveNav] = useState<NavItem>("New Query");

  const loadSession = useCallback(async () => {
    const response = await fetch("/api/auth/me");
    const data = (await response.json()) as { ok: boolean; user: UserSession | null };
    setUser(data.ok ? data.user : null);
  }, []);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/history");
    const data = (await response.json()) as { ok: boolean; history?: HistoryItem[] };
    setHistory(response.ok && data.ok ? data.history ?? [] : []);
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    void loadHistory();
  }, [user, loadHistory]);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    const response = await fetch(authMode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = (await response.json()) as { ok: boolean; message?: string; user?: UserSession };
    if (!response.ok || !data.ok || !data.user) {
      setErrorMessage(data.message ?? "Authentication failed.");
      return;
    }
    setUser(data.user);
    setEmail("");
    setPassword("");
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setHistory([]);
  };

  const handleUpgrade = async () => {
    if (!user) {
      setErrorMessage("Login to enable Pro upgrade.");
      return;
    }
    const response = await fetch("/api/billing/upgrade", { method: "POST" });
    const data = (await response.json()) as { ok: boolean; message?: string; user?: UserSession };
    if (!response.ok || !data.ok || !data.user) {
      setErrorMessage(data.message ?? "Upgrade failed.");
      return;
    }
    setUser(data.user);
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
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
      setActiveNav("New Query");
      if (user) {
        await Promise.all([loadHistory(), loadSession()]);
      }
    } catch {
      setErrorMessage("API call failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const modelSourceMap = useMemo(() => new Map(modelSources.map((source: PerModelSource) => [source.model, source])), [modelSources]);

  const hasRunVerification = responses.length > 0 || verification !== null || errorMessage !== null;

  const agreementRows = useMemo(() => {
    if (!verification) {
      return [];
    }
    return [
      { label: "Agreement", value: verification.agreementScore },
      { label: "Evidence", value: verification.evidenceAlignmentScore },
      { label: "Contradiction", value: Math.max(0, 100 - (verification.contradictionScore ?? 0)) },
      { label: "Final Confidence", value: verification.finalConfidenceScore }
    ];
  }, [verification]);

  return (
    <div className="minimal-shell">
      <aside className="minimal-sidebar">
        <div className="brand-wrap">
          <h1 className="brand">SVA</h1>
          <span className="minimal-badge">Minimal</span>
        </div>

        <nav className="menu-list" aria-label="Sidebar Navigation">
          {navItems.map((item) => (
            <button key={item} className={activeNav === item ? "menu-button active" : "menu-button"} type="button" onClick={() => setActiveNav(item)}>
              {item}
            </button>
          ))}
        </nav>

        <div className="pricing-card">
          <p>
            <strong>Free:</strong> 10 verifications/day
          </p>
          <p>
            <strong>Pro Early Access:</strong> ₹499/month
          </p>
          <p className="muted-line">Soon ₹999/month</p>
          <button className="run-button" type="button" onClick={handleUpgrade}>
            Upgrade
          </button>
        </div>

        <div className="sidebar-footer-card">
          {!user ? (
            <form className="auth-card" onSubmit={handleAuth}>
              <p className="muted-line">Demo mode works without login. Login to save history.</p>
              <input
                placeholder="Email"
                type="email"
                value={email}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
              />
              <input
                placeholder="Password"
                type="password"
                value={password}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
              />
              <button className="menu-button" type="submit">
                {authMode === "signup" ? "Create account" : "Login"}
              </button>
              <button className="menu-ghost" type="button" onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}>
                {authMode === "signup" ? "Use Login" : "Use Sign up"}
              </button>
            </form>
          ) : (
            <div className="auth-card">
              <p>{user.email}</p>
              <p className="muted-line">
                Plan: <strong>{user.plan.toUpperCase()}</strong>
              </p>
              <p className="muted-line">
                Usage: {user.usedToday}/{user.dailyLimit}
              </p>
              <button className="menu-ghost" type="button" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
          <div className="footer-links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
        </div>
      </aside>

      <main className="minimal-main">
        <header className="header-block">
          <h2>New Query</h2>
          <p>Compare 3 AI models, verify claims with evidence, and trust the final answer with confidence.</p>
        </header>

        <section className="query-card">
          <form onSubmit={handleVerify}>
            <textarea
              value={prompt}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value)}
              placeholder="Ask anything. SVA will verify it."
              required
            />
            <div className="row-space">
              <div className="chip-row">
                {visibleResponseModels.map((chip) => (
                  <span className="chip" key={chip}>
                    {chip}
                  </span>
                ))}
              </div>
              <button className="run-button" type="submit" disabled={isLoading}>
                {isLoading ? "Verifying..." : "Run Verification"}
              </button>
            </div>
            <div className="chip-row">
              {(["fast", "deep", "research"] as const).map((option) => (
                <button key={option} type="button" className={mode === option ? "chip mode-chip active-mode" : "chip mode-chip"} onClick={() => setMode(option)}>
                  {option === "fast" ? "Fast" : option === "deep" ? "Deep Verify" : "Research"}
                </button>
              ))}
            </div>
          </form>
        </section>

        {errorMessage ? (
          <section className="panel error-card">
            <h3>Verification Error</h3>
            <p>{errorMessage}</p>
          </section>
        ) : null}

        {activeNav === "History" ? (
          <section className="panel">
            <h3>History</h3>
            {history.length ? (
              <div className="history-list">
                {history.map((item: HistoryItem) => (
                  <button key={`${item.timestamp}-${item.prompt}`} className="history-item" type="button" onClick={() => setPrompt(item.prompt)}>
                    <strong>{item.prompt}</strong>
                    <small>
                      {item.confidence}% • {item.verdict} • {item.mode}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted-line">No saved history yet.</p>
            )}
          </section>
        ) : null}

        {activeNav === "Saved" || activeNav === "Models" || activeNav === "Settings" ? (
          <section className="panel">
            <h3>{activeNav}</h3>
            <p className="muted-line">This panel is intentionally minimal in MVP mode.</p>
          </section>
        ) : null}

        <section className="panel">
          <h3>AI Responses (3-model comparison)</h3>
          {modelSources.filter((source) => source.source === "openrouter").length < 3 && responses.length > 0 ? (
            <p className="muted-line">⚠️ Partial Verification: Only {modelSources.filter((source) => source.source === "openrouter").length}/3 models responded. Results may be unreliable.</p>
          ) : null}
          <div className="response-grid">
            {visibleResponseModels.map((modelName) => {
              const response = responses.find((item: ModelResponse) => item.model === modelName);
              const source = modelSourceMap.get(modelName);
              const isSuccess = source?.source === "openrouter";
              const isMajority = isSuccess && (verification?.majorityModels.includes(modelName) ?? false);
              const isOutlier = isSuccess && (verification?.outlierModels.includes(modelName) ?? false);

              return (
                <article className="response-card" key={modelName}>
                  <div className="row-space">
                    <div className="flex items-center gap-2">
                      <strong>{modelName}</strong>
                      <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-200">
                        {modelBadgeLabel[modelName]}
                      </span>
                    </div>
                    <span className={isSuccess ? (isMajority ? "badge majority" : isOutlier ? "badge outlier" : "badge pending") : "badge outlier"}>
                      {!hasRunVerification ? "Ready" : isSuccess ? (isMajority ? "Majority" : isOutlier ? "Outlier" : "Available") : "Unavailable"}
                    </span>
                  </div>
                  <p>{!hasRunVerification ? "Ready to verify" : isSuccess ? response?.answer ?? "No response yet." : "Model unavailable"}</p>
                  <small className="muted-line">Source: SVA Model Layer</small>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid-two">
          <section className="panel">
            <h3>SVA Verification</h3>
            {verification ? (
              <>
                <div className="score-wrap" style={{ background: `conic-gradient(#7c3aed ${verification.finalConfidenceScore * 3.6}deg, #1e293b 0deg)` }}>
                  <div className="score-inner">{verification.finalConfidenceScore}%</div>
                </div>
                <p>
                  <strong>{verification.confidenceLabel} Confidence</strong>
                </p>
                <p className="muted-line">Final Answer: {verification.finalAnswer}</p>
                <p className="muted-line">Why this answer? {verification.reasoning || verification.explanation}</p>
                <p>
                  <strong>SVA Judge:</strong> {(verification.judgeVerdict ?? "caution").toUpperCase()}
                </p>
                {verification.judgeRiskFlags?.length ? (
                  <ul className="risk-list">
                    {verification.judgeRiskFlags.map((flag: string, idx: number) => (
                      <li key={`${flag}-${idx}`}>{flag}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-line">No risk flags.</p>
                )}
              </>
            ) : (
              <p className="muted-line">Run verification to generate trust analysis.</p>
            )}
          </section>

          <section className="panel">
            <h3>Model Agreement</h3>
            {agreementRows.length ? (
              <div className="bars">
                {agreementRows.map((row: { label: string; value: number }) => (
                  <div key={row.label}>
                    <div className="row-space">
                      <span>{row.label}</span>
                      <span>{row.value}%</span>
                    </div>
                    <progress max={100} value={row.value} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-line">No agreement data yet.</p>
            )}
          </section>
        </section>

        <section className="grid-two">
          <section className="panel">
            <h3>Evidence / Sources</h3>
            {evidenceSnippets.length ? (
              <div className="history-list">
                {evidenceSnippets.map((snippet: EvidenceSnippet, idx: number) => (
                  <article className="history-item" key={`${snippet.title}-${idx}`}>
                    <strong>{snippet.title}</strong>
                    <small>{snippet.sourceType}</small>
                    <p>{snippet.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-line">No evidence snippets returned yet.</p>
            )}
          </section>

          <section className="panel">
            <h3>Claim-Level Verification</h3>
            {verification?.claimVerifications?.length ? (
              <div className="history-list">
                {verification.claimVerifications.map((claim) => (
                  <article className="history-item" key={claim.id}>
                    <strong>{claim.claim}</strong>
                    <small>
                      {claim.status} • {claim.confidenceScore}/100
                    </small>
                    <p>{claim.explanation}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-line">No claim-level checks yet.</p>
            )}
          </section>
        </section>

        <section className="panel">
          <h3>Execution Debug</h3>
          {meta ? (
            <p className="muted-line">
              Provider mode: {meta.mode} • Retrieval mode: {meta.retrievalModeUsed} • Sources: {meta.retrievalSourceCount}
            </p>
          ) : (
            <p className="muted-line">No execution metadata yet.</p>
          )}
        </section>
      </main>
    </div>
  );
};
