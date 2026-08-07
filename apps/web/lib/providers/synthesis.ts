import type { EvidenceSnippet, ModelResponse, RuntimeProviderStatus, VerificationResult } from "../models";
import { callOpenRouter, type OpenRouterResult } from "./openrouter";

export type SynthesisStatus = RuntimeProviderStatus & { retryCount: number; truncated: boolean };

export type SynthesisOutcome =
  | { ok: true; answer: string; status: SynthesisStatus }
  | { ok: false; message: string; status: SynthesisStatus };

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
  costUsd: result.ok ? result.costUsd : undefined,
  rawResponse: result.ok ? result.text.slice(0, 1200) : undefined,
  retryCount,
  truncated: isTruncated(result)
});

export const synthesizeVerificationAnswer = async (input: {
  prompt: string;
  responses: ModelResponse[];
  evidenceSnippets: EvidenceSnippet[];
  verification: VerificationResult;
  maxTokens: number;
}): Promise<SynthesisOutcome> => {
  const primary = await callOpenRouter(synthesisPrimaryModel(), buildSynthesisPrompt({ ...input, retry: false }), { maxTokens: input.maxTokens });
  if (primary.ok && !isTruncated(primary)) return { ok: true, answer: primary.text.trim(), status: toStatus(primary, 0) };
  if (!primary.ok && primary.errorType === "billing_failure") return { ok: false, message: primary.message, status: toStatus(primary, 0) };

  const retry = await callOpenRouter(synthesisFallbackModel(), buildSynthesisPrompt({ ...input, retry: true }), { maxTokens: input.maxTokens });
  const retryStatus = toStatus(retry, 1);
  retryStatus.truncated = isTruncated(primary) || isTruncated(retry);
  retryStatus.costUsd = (primary.ok ? primary.costUsd ?? 0 : 0) + (retry.ok ? retry.costUsd ?? 0 : 0) || retryStatus.costUsd;
  retryStatus.latencyMs = (primary.latencyMs ?? 0) + (retry.latencyMs ?? 0) || retryStatus.latencyMs;

  if (retry.ok && !isTruncated(retry)) return { ok: true, answer: retry.text.trim(), status: retryStatus };
  return { ok: false, message: "Synthesis failed.", status: retryStatus };
};

export const applySynthesisAnswer = (verification: VerificationResult, answer: string): VerificationResult => ({
  ...verification,
  finalAnswer: answer,
  sections: verification.sections ? { ...verification.sections, coreConclusion: answer } : verification.sections
});
