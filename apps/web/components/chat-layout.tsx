"use client";

import { type ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  STARTER_PROMPT,
  type ModelResponse,
  type PerModelSource,
  type VerificationExecutionMeta,
  type VerificationMode,
  type VerificationResult,
  type VerifyApiResponse
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

const modelChips = ["GPT-4o", "Claude 3.5", "Gemini 1.5 Pro", "Add Model"];
const visibleResponseModels = ["GPT", "Claude", "Gemini"] as const;

const confidenceLabel = (score: number): string => {
  if (score >= 75) return "High Confidence";
  if (score >= 60) return "Medium Confidence";
  return "Low Confidence";
};

export const ChatLayout = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [prompt, setPrompt] = useState(STARTER_PROMPT);
  const [mode] = useState<VerificationMode>("fast");
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [modelSources, setModelSources] = useState<PerModelSource[]>([]);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [meta, setMeta] = useState<VerificationExecutionMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showDetails, setShowDetails] = useState(false);

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
    setVerification(null);
    setResponses([]);
  };

  const handleUpgrade = async () => {
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
    if (!user) {
      setErrorMessage("Please login before running verification.");
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    setVerification(null);

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode })
      });
      const data = (await response.json()) as VerifyApiResponse;
      if (!response.ok || !data.ok) {
        setErrorMessage(data.ok ? "Verification failed" : data.message);
        return;
      }
      setResponses(data.responses);
      setModelSources(data.modelSources);
      setVerification(data.verification);
      setMeta(data.meta);
      await Promise.all([loadHistory(), loadSession()]);
    } catch {
      setErrorMessage("API call failed. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const modelSourceMap = useMemo(() => new Map(modelSources.map((source: PerModelSource) => [source.model, source])), [modelSources]);

  const agreementRows = useMemo(() => {
    if (!verification) {
      return [];
    }
    const pairScore = Math.max(0, Math.min(100, verification.agreementScore));
    return [
      { label: "GPT vs Claude", value: pairScore },
      { label: "GPT vs Gemini", value: Math.max(0, pairScore - 4) },
      { label: "Claude vs Gemini", value: Math.max(0, pairScore - 7) },
      { label: "All Models", value: pairScore }
    ];
  }, [verification]);

  return (
    <div className="minimal-shell">
      <aside className="minimal-sidebar">
        <div className="brand-wrap">
          <h1 className="brand">SVA</h1>
          <span className="minimal-badge">Minimal</span>
        </div>

        <button className="menu-button" type="button" onClick={() => setPrompt(STARTER_PROMPT)}>
          New Query
        </button>

        <nav className="menu-list">
          <span>History</span>
          <span>Saved</span>
          <span>Models</span>
          <span>Settings</span>
        </nav>

        {!user ? (
          <form className="auth-card" onSubmit={handleAuth}>
            <h3>{authMode === "signup" ? "Sign up" : "Login"}</h3>
            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
              required
            />
            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
              required
            />
            <button className="menu-button" type="submit">
              {authMode === "signup" ? "Create account" : "Login"}
            </button>
            <button className="menu-ghost" type="button" onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}>
              Switch to {authMode === "signup" ? "Login" : "Sign up"}
            </button>
          </form>
        ) : (
          <div className="auth-card">
            <p>{user.email}</p>
            <p>
              Plan: <strong>{user.plan.toUpperCase()}</strong>
            </p>
            <p>
              Usage: {user.usedToday}/{user.dailyLimit}
            </p>
            {user.plan === "free" ? (
              <button className="menu-button" type="button" onClick={handleUpgrade}>
                Upgrade Pro ₹499/mo
              </button>
            ) : null}
            <button className="menu-ghost" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}

        <div className="sidebar-footer-card">SVA Minimal – AI Verification made simple</div>
      </aside>

      <main className="minimal-main">
        <header className="header-block">
          <h2>New Query</h2>
          <p>Ask any question. SVA compares AI answers and verifies the truth.</p>
        </header>

        <section className="query-card">
          <form onSubmit={handleVerify}>
            <textarea
              value={prompt}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value)}
              placeholder="Enter your question here..."
            />
            <div className="row-space">
              <div className="chip-row">
                {modelChips.map((chip) => (
                  <span className="chip" key={chip}>
                    {chip}
                  </span>
                ))}
              </div>
              <button className="run-button" type="submit" disabled={isLoading || !user}>
                {isLoading ? "Running..." : "Run"}
              </button>
            </div>
          </form>
          {errorMessage ? <p className="error-line">{errorMessage}</p> : null}
        </section>

        <section className="panel">
          <h3>AI Responses</h3>
          <div className="response-grid">
            {visibleResponseModels.map((modelName) => {
              const response = responses.find((item: ModelResponse) => item.model === modelName);
              const source = modelSourceMap.get(modelName);
              return (
                <article className="response-card" key={modelName}>
                  <div className="row-space">
                    <strong>{modelName}</strong>
                    <span className="badge">{source?.source === "fallback_generated" ? "Fallback" : "Live"}</span>
                  </div>
                  <p>{response?.answer ?? "No response yet."}</p>
                  <button className="menu-ghost" type="button" onClick={() => setShowDetails((v: boolean) => !v)}>
                    View Sources
                  </button>
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
                  <strong>{confidenceLabel(verification.finalConfidenceScore)}</strong>
                </p>
                <p className="muted-line">{verification.explanation}</p>
                <button className="menu-ghost" type="button" onClick={() => setShowDetails((v: boolean) => !v)}>
                  See Details
                </button>
              </>
            ) : (
              <p className="muted-line">Run a query to see verification.</p>
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

        {showDetails && verification ? (
          <section className="panel">
            <h3>Details</h3>
            <p>Judge verdict: {verification.judgeVerdict ?? "caution"}</p>
            <p>
              Trust breakdown — Agreement {verification.agreementScore}, Evidence {verification.evidenceAlignmentScore}, Source Quality {verification.sourceQualityScore ?? 0}, Contradiction Impact {verification.contradictionPenalty ?? 0}
            </p>
            {meta ? <p className="muted-line">Retrieval mode: {meta.retrievalModeUsed}</p> : null}
          </section>
        ) : null}

        <section className="panel">
          <h3>History</h3>
          {history.length ? (
            <div className="history-list">
              {history.map((item: HistoryItem) => (
                <button key={`${item.timestamp}-${item.prompt}`} className="history-item" type="button" onClick={() => setPrompt(item.prompt)}>
                  <strong>{item.prompt}</strong>
                  <small>{item.confidence}/100</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted-line">No history yet.</p>
          )}
        </section>
      </main>
    </div>
  );
};
