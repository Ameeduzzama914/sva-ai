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

const visibleResponseModels = ["GPT", "Claude", "Gemini", "DeepSeek", "Perplexity"] as const;

export const ChatLayout = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [prompt, setPrompt] = useState(STARTER_PROMPT);
  const [mode, setMode] = useState<VerificationMode>("fast");
  const [responses, setResponses] = useState<ModelResponse[]>([]);
  const [modelSources, setModelSources] = useState<PerModelSource[]>([]);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [meta, setMeta] = useState<VerificationExecutionMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeView, setActiveView] = useState<"results" | "history">("results");

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
      setActiveView("results");
      await Promise.all([loadHistory(), loadSession()]);
    } catch {
      setErrorMessage("API call failed. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const modelSourceMap = useMemo(() => new Map(modelSources.map((source: PerModelSource) => [source.model, source])), [modelSources]);

  return (
    <div className="sva-shell">
      <aside className="sva-sidebar">
        <div>
          <h1 className="sva-logo">SVA</h1>
          <span className="sva-pill">Trust Engine</span>
        </div>

        <div className="sva-menu">
          <button className="primary-btn" type="button" onClick={() => setPrompt(STARTER_PROMPT)}>
            New Verification
          </button>
          <button className="ghost-btn" type="button" onClick={() => setActiveView("history")}>
            History
          </button>
          <button className="ghost-btn" type="button" onClick={handleUpgrade} disabled={!user || user.plan === "pro"}>
            Upgrade
          </button>
        </div>

        <div className="sidebar-user">
          {!user ? (
            <form className="auth-form" onSubmit={handleAuth}>
              <p className="muted">Sign in to verify answers</p>
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
              <button className="primary-btn" type="submit">
                {authMode === "signup" ? "Create account" : "Login"}
              </button>
              <button className="ghost-btn" type="button" onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}>
                {authMode === "signup" ? "Use login" : "Use signup"}
              </button>
            </form>
          ) : (
            <div className="user-card">
              <p>{user.email}</p>
              <p className="muted">Plan: {user.plan.toUpperCase()}</p>
              <p className="muted">
                Usage: {user.usedToday}/{user.dailyLimit}
              </p>
              <button className="ghost-btn" type="button" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="sva-main">
        <section className="input-panel">
          <form onSubmit={handleVerify}>
            <textarea
              value={prompt}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value)}
              placeholder="Ask anything. SVA will verify it."
            />
            <div className="input-actions">
              <div className="mode-chips">
                {(["fast", "deep", "research"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={mode === option ? "chip active" : "chip"}
                    onClick={() => setMode(option)}
                  >
                    {option === "fast" ? "Fast" : option === "deep" ? "Deep Verify" : "Research"}
                  </button>
                ))}
              </div>
              <button className="run-btn" type="submit" disabled={isLoading || !user}>
                {isLoading ? "Running..." : "Run"}
              </button>
            </div>
          </form>
          {errorMessage ? <p className="error">{errorMessage}</p> : null}
        </section>

        {activeView === "history" ? (
          <section className="panel">
            <div className="section-row">
              <h2>History</h2>
              <button className="ghost-btn" type="button" onClick={() => setActiveView("results")}>
                Back to results
              </button>
            </div>
            {history.length ? (
              <div className="list">
                {history.map((item: HistoryItem) => (
                  <button key={`${item.timestamp}-${item.prompt}`} className="list-item" type="button" onClick={() => setPrompt(item.prompt)}>
                    <strong>{item.prompt}</strong>
                    <span className="muted">
                      {item.confidence}% • {item.verdict}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">No history yet.</p>
            )}
          </section>
        ) : (
          <>
            <section className="panel">
              <h2>AI Model Responses</h2>
              <div className="responses-grid">
                {visibleResponseModels.map((modelName) => {
                  const response = responses.find((item: ModelResponse) => item.model === modelName);
                  const isMajority = verification?.majorityModels.includes(modelName) ?? false;
                  const isOutlier = verification?.outlierModels.includes(modelName) ?? false;
                  const source = modelSourceMap.get(modelName);
                  return (
                    <article className="response-card" key={modelName}>
                      <div className="section-row">
                        <strong>{modelName}</strong>
                        <span className={isMajority ? "status majority" : isOutlier ? "status outlier" : "status pending"}>
                          {isMajority ? "Majority" : isOutlier ? "Outlier" : "Pending"}
                        </span>
                      </div>
                      <p>{response?.answer ?? "No response yet."}</p>
                      <small className="muted">Source: {source?.source === "fallback_generated" ? "Demo/Fallback" : "Live"}</small>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="panel trust-panel">
              <h2>Trust Panel</h2>
              {verification ? (
                <div className="trust-grid">
                  <div>
                    <p className="muted">Final Answer</p>
                    <p className="final-answer">{verification.finalAnswer}</p>

                    <p className="muted">Why this answer?</p>
                    <p>{verification.reasoning || verification.explanation}</p>

                    <p className="muted">SVA Judge Verdict</p>
                    <p className="verdict">{verification.judgeVerdict ? verification.judgeVerdict.toUpperCase() : "CAUTION"}</p>
                  </div>

                  <div>
                    <div className="confidence-ring" style={{ background: `conic-gradient(#8b5cf6 ${verification.finalConfidenceScore * 3.6}deg, #1a2234 0deg)` }}>
                      <div className="confidence-inner">{verification.finalConfidenceScore}%</div>
                    </div>
                    <p className="confidence-label">{verification.confidenceLabel} Confidence</p>

                    <p className="muted">Risk Flags</p>
                    {verification.judgeRiskFlags && verification.judgeRiskFlags.length > 0 ? (
                      <ul className="risk-flags">
                        {verification.judgeRiskFlags.map((flag: string, idx: number) => (
                          <li key={`${flag}-${idx}`}>{flag}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No major risks detected.</p>
                    )}
                    {meta ? <p className="muted">Mode: {meta.modeUsed ?? mode}</p> : null}
                  </div>
                </div>
              ) : (
                <p className="muted">Run verification to see final answer, confidence, and verdict.</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};
