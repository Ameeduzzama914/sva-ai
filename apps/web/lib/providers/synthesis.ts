import type { EvidenceSnippet, ModelResponse, RuntimeProviderStatus, VerificationResult } from "../models";
import type { ProviderUsageAttempt } from "../models";
import type { PlanId } from "../plans";
import { PAID_SYNTHESIS_OUTPUT_TOKEN_LIMIT } from "../response-shaping";
import { callOpenRouter, type OpenRouterResult } from "./openrouter";

export type SynthesisStatus = RuntimeProviderStatus & { retryCount: number; truncated: boolean };

export type SynthesisOutcome =
  | { ok: true; answer: string; status: SynthesisStatus; attempts: ProviderUsageAttempt[] }
  | { ok: false; message: string; status: SynthesisStatus; attempts: ProviderUsageAttempt[] };

const synthesisPrimaryModel = (): string => process.env.SVA_SYNTHESIS_PRIMARY?.trim() || "openai/gpt-4.1-mini";
const synthesisFallbackModel = (): string => process.env.SVA_SYNTHESIS_FALLBACK?.trim() || "openai/gpt-4.1-nano";
const isTruncated = (result: OpenRouterResult): boolean => result.ok && /^(length|max_tokens|content_filter)$/i.test(result.finishReason ?? "");

const buildSynthesisPrompt = (input: {
  prompt: string;
  responses: ModelResponse[];
  evidenceSnippets: EvidenceSnippet[];
  maxTokens: number;
  retry: boolean;
}): string => {
  const answers = input.responses.map((response) => `${response.model}: ${response.answer}`).join("\n\n");
  const evidence = input.evidenceSnippets.slice(0, 5).map((snippet, index) => `${index + 1}. ${snippet.title}: ${snippet.text}`).join("\n");
  return `You are SVA Verified Mode. Produce a complete concise final answer within ${input.maxTokens} tokens.
${input.retry ? "The previous synthesis was truncated. Do not add preamble; write a shorter complete answer." : ""}

Question:
${input.prompt}

Model family answers:
${answers}

Evidence snippets:
${evidence || "No external evidence snippets were available."}

Return only the final user-facing answer. Do not mention provider names, costs, internal limits, or raw errors.`;
};

const toStatus = (result: OpenRouterResult, retryCount: number): SynthesisStatus => ({
  configured: Boolean(process.env.OPENROUTER_API_KEY),
  liveSuccess: result.ok,
  source: result.ok ? "openrouter" : "fallback_generated",
  fallbackState: result.ok ? "none" : result.reason === "not_configured" ? "provider_unavailable" : "provider_error",
  status: result.ok ? (retryCount > 0 ? "fallback" : "success") : result.statusCode === 408 || result.statusCode === 504 ? "timeout" : "failed",
  errorMessage: result.ok ? undefined : result.message,
  statusCode: result.ok ? undefined : result.statusCode,
  providerErrorType: result.ok ? undefined : result.errorType,
  providerModelId: result.providerModelId,
  actualModelId: result.ok ? result.actualModelId : undefined,
  latencyMs: result.latencyMs,
  promptTokens: result.ok ? result.promptTokens : undefined,
  completionTokens: result.ok ? result.completionTokens : undefined,
  reasoningTokens: result.ok ? result.reasoningTokens : undefined,
  cachedTokens: result.ok ? result.cachedTokens : undefined,
  costUsd: result.ok ? result.costUsd : undefined,
  rawResponse: result.ok ? result.text.slice(0, 1200) : undefined,
  retryCount,
  truncated: isTruncated(result)
});

const toUsageAttempt = (result: OpenRouterResult, attemptType: "synthesis" | "synthesis_retry"): ProviderUsageAttempt => ({
  modelFamily: "synthesis",
  requestedModel: result.providerModelId ?? "unknown",
  actualModel: result.ok ? result.actualModelId : undefined,
  attemptType,
  promptTokens: result.ok ? result.promptTokens : undefined,
  completionTokens: result.ok ? result.completionTokens : undefined,
  reasoningTokens: result.ok ? result.reasoningTokens : undefined,
  cachedTokens: result.ok ? result.cachedTokens : undefined,
  costUsd: result.ok ? result.costUsd : undefined,
  latencyMs: result.latencyMs,
  statusCode: result.ok ? undefined : result.statusCode,
  errorType: result.ok ? undefined : result.errorType,
  success: result.ok
});

export const synthesizeVerificationAnswer = async (input: {
  prompt: string;
  responses: ModelResponse[];
  evidenceSnippets: EvidenceSnippet[];
  verification: VerificationResult;
  plan: PlanId;
  maxTokens: number;
}): Promise<SynthesisOutcome> => {
  const maxTokens = input.plan === "free" ? input.maxTokens : Math.min(input.maxTokens, PAID_SYNTHESIS_OUTPUT_TOKEN_LIMIT);
  const primary = await callOpenRouter(synthesisPrimaryModel(), buildSynthesisPrompt({ ...input, maxTokens, retry: false }), {
    maxTokens,
    layer: "synthesis",
    slot: "synthesis",
    attempt: "synthesis"
  });
  const primaryAttempts = [toUsageAttempt(primary, "synthesis")];
  if (primary.ok && !isTruncated(primary)) return { ok: true, answer: primary.text.trim(), status: toStatus(primary, 0), attempts: primaryAttempts };
  if (!primary.ok && primary.errorType === "billing_failure") return { ok: false, message: primary.message, status: toStatus(primary, 0), attempts: primaryAttempts };

  const retry = await callOpenRouter(synthesisFallbackModel(), buildSynthesisPrompt({ ...input, maxTokens, retry: true }), {
    maxTokens,
    layer: "synthesis",
    slot: "synthesis",
    attempt: "synthesis_retry"
  });
  const attempts = [...primaryAttempts, toUsageAttempt(retry, "synthesis_retry")];
  const retryStatus = toStatus(retry, 1);
  retryStatus.truncated = isTruncated(primary) || isTruncated(retry);
  const sumAttemptMetric = (pick: (attempt: ProviderUsageAttempt) => number | undefined): number | undefined => {
    const values = attempts.map(pick).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : undefined;
  };
  retryStatus.promptTokens = sumAttemptMetric((attempt) => attempt.promptTokens);
  retryStatus.completionTokens = sumAttemptMetric((attempt) => attempt.completionTokens);
  retryStatus.reasoningTokens = sumAttemptMetric((attempt) => attempt.reasoningTokens);
  retryStatus.cachedTokens = sumAttemptMetric((attempt) => attempt.cachedTokens);
  retryStatus.costUsd = sumAttemptMetric((attempt) => attempt.costUsd);
  retryStatus.latencyMs = sumAttemptMetric((attempt) => attempt.latencyMs);

  if (retry.ok && !isTruncated(retry)) return { ok: true, answer: retry.text.trim(), status: retryStatus, attempts };
  return { ok: false, message: "Synthesis failed.", status: retryStatus, attempts };
};

export const applySynthesisAnswer = (verification: VerificationResult, answer: string): VerificationResult => ({
  ...verification,
  finalAnswer: answer,
  sections: verification.sections ? { ...verification.sections, coreConclusion: answer } : verification.sections
});
