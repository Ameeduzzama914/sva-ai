import {
  type EvidenceSnippet,
  type ModelAnswerSource,
  type ModelFallbackState,
  type ModelName,
  type ModelResponse,
  type PerModelSource,
  type RuntimeProviderStatus,
  type VerificationExecutionMeta,
  type VerificationMode
} from "../models";
import { callOpenRouter, type OpenRouterResult } from "./openrouter";

type ProSlot = {
  slot: ModelName;
  family: "gpt" | "gemini" | "deepseek";
  primaryEnvKey: string;
  fallbackEnvKey: string;
  legacyEnvKey?: string;
  defaultPrimaryModelId: string;
  defaultFallbackModelId?: string;
  maxTokens?: number;
};

const PRO_SLOTS: ProSlot[] = [
  {
    slot: "Fast AI",
    family: "gpt",
    primaryEnvKey: "SVA_GPT_PRIMARY",
    fallbackEnvKey: "SVA_GPT_FALLBACK",
    legacyEnvKey: "PRO_OPENROUTER_MODEL_A",
    defaultPrimaryModelId: "openai/gpt-4.1-mini",
    defaultFallbackModelId: "openai/gpt-4.1-nano"
  },
  {
    slot: "Balanced AI",
    family: "gemini",
    primaryEnvKey: "SVA_GEMINI_PRIMARY",
    fallbackEnvKey: "SVA_GEMINI_FALLBACK",
    legacyEnvKey: "PRO_OPENROUTER_MODEL_B",
    defaultPrimaryModelId: "google/gemini-2.5-flash",
    defaultFallbackModelId: "google/gemini-2.5-flash-lite"
  },
  {
    slot: "Research AI",
    family: "deepseek",
    primaryEnvKey: "SVA_DEEPSEEK_PRIMARY",
    fallbackEnvKey: "SVA_DEEPSEEK_FALLBACK",
    legacyEnvKey: "PRO_OPENROUTER_MODEL_C",
    defaultPrimaryModelId: "deepseek/deepseek-chat"
  }
];

const toAnswerSource = (result: OpenRouterResult): ModelAnswerSource => (result.ok ? "openrouter" : "fallback_generated");

const toFallbackState = (result: OpenRouterResult): ModelFallbackState => {
  if (result.ok) return "none";
  return result.reason === "not_configured" ? "provider_unavailable" : "provider_error";
};

const modelSequenceForSlot = (slot: ProSlot): string[] => {
  const primary = process.env[slot.primaryEnvKey]?.trim() || (slot.legacyEnvKey ? process.env[slot.legacyEnvKey]?.trim() : "") || slot.defaultPrimaryModelId;
  const fallback = process.env[slot.fallbackEnvKey]?.trim() || slot.defaultFallbackModelId || "";
  return Array.from(new Set([primary, fallback].filter(Boolean)));
};

const runSlot = async (slot: ProSlot, contextPrompt: string, responseMaxTokens?: number): Promise<OpenRouterResult & { attemptedFallback: boolean }> => {
  const sequence = modelSequenceForSlot(slot).slice(0, 2);
  let lastFailure: Extract<OpenRouterResult, { ok: false }> | undefined;

  for (let index = 0; index < sequence.length; index += 1) {
    const result = await callOpenRouter(sequence[index], contextPrompt, { maxTokens: slot.maxTokens ?? responseMaxTokens });
    if (result.ok) return { ...result, attemptedFallback: index > 0 };
    lastFailure = result;
    if (result.errorType === "billing_failure" || result.errorType === "configuration_failure") break;
  }

  return {
    ok: false,
    message: lastFailure?.message ?? "AI model request failed.",
    reason: lastFailure?.reason ?? "provider_error",
    errorType: lastFailure?.errorType ?? "provider_error",
    statusCode: lastFailure?.statusCode,
    providerModelId: lastFailure?.providerModelId ?? sequence[0] ?? slot.defaultPrimaryModelId,
    providerError: lastFailure?.providerError,
    attemptedFallback: sequence.length > 1
  };
};

export type ProLayerContext = {
  contextPrompt: string;
  evidenceSnippets: EvidenceSnippet[];
  retrievalModeUsed: "web" | "none";
  mode: VerificationMode;
  responseMaxTokens?: number;
};

export const buildProLayerResponses = async ({
  contextPrompt,
  evidenceSnippets,
  retrievalModeUsed,
  mode,
  responseMaxTokens
}: ProLayerContext): Promise<{
  responses: ModelResponse[];
  modelSources: PerModelSource[];
  evidenceSnippets: EvidenceSnippet[];
  meta: VerificationExecutionMeta;
  providerRuntimeStatus: Record<ModelName, RuntimeProviderStatus>;
}> => {
  const settled = await Promise.allSettled(PRO_SLOTS.map((slot) => runSlot(slot, contextPrompt, responseMaxTokens)));
  const outputs = settled.map((result, index): OpenRouterResult & { attemptedFallback: boolean } => {
    if (result.status === "fulfilled") return result.value;
    return {
      ok: false,
      message: "AI model request failed.",
      reason: "provider_error",
      errorType: "provider_unavailable",
      providerModelId: modelSequenceForSlot(PRO_SLOTS[index])[0] ?? PRO_SLOTS[index].defaultPrimaryModelId,
      providerError: result.reason instanceof Error ? result.reason.message : String(result.reason),
      attemptedFallback: false
    };
  });

  const responses: ModelResponse[] = PRO_SLOTS.map((slot, index) => {
    const result = outputs[index];
    if (result.ok) return { model: slot.slot, answer: result.text.replace(/\s+/g, " ").trim() || "No response generated." };
    return { model: slot.slot, answer: "" };
  });

  const modelSources: PerModelSource[] = PRO_SLOTS.map((slot, index) => {
    const result = outputs[index];
    return {
      model: slot.slot,
      source: toAnswerSource(result),
      fallbackState: toFallbackState(result),
      providerModelId: result.providerModelId ?? modelSequenceForSlot(slot)[0] ?? slot.defaultPrimaryModelId,
      errorMessage: result.ok ? undefined : result.message,
      statusCode: result.ok ? undefined : result.statusCode,
      providerErrorType: result.ok ? undefined : result.errorType
    };
  });

  const providerRuntimeStatus = PRO_SLOTS.reduce(
    (status, slot, index) => {
      const result = outputs[index];
      status[slot.slot] = {
        configured: Boolean(process.env.OPENROUTER_API_KEY),
        liveSuccess: result.ok,
        source: toAnswerSource(result),
        fallbackState: toFallbackState(result),
        errorMessage: result.ok ? undefined : result.message,
        statusCode: result.ok ? undefined : result.statusCode,
        providerErrorType: result.ok ? undefined : result.errorType,
        providerModelId: result.providerModelId ?? modelSequenceForSlot(slot)[0] ?? slot.defaultPrimaryModelId,
        actualModelId: result.ok ? result.actualModelId : undefined,
        promptTokens: result.ok ? result.promptTokens : undefined,
        completionTokens: result.ok ? result.completionTokens : undefined,
        costUsd: result.ok ? result.costUsd : undefined,
        status: result.ok ? (result.attemptedFallback ? "fallback" : "success") : result.statusCode === 408 || result.statusCode === 504 ? "timeout" : "failed",
        latencyMs: result.latencyMs,
        rawResponse: result.ok ? result.text.slice(0, 1200) : undefined
      };
      return status;
    },
    {} as Record<ModelName, RuntimeProviderStatus>
  );

  const liveCount = outputs.filter((result) => result.ok).length;

  return {
    responses,
    modelSources,
    evidenceSnippets,
    providerRuntimeStatus,
    meta: {
      mode: "pro",
      modeUsed: mode,
      gptSource: toAnswerSource(outputs[0]),
      geminiSource: toAnswerSource(outputs[1]),
      deepseekSource: toAnswerSource(outputs[2]),
      modelASource: toAnswerSource(outputs[0]),
      modelBSource: toAnswerSource(outputs[1]),
      modelCSource: toAnswerSource(outputs[2]),
      providerMessage: `Live central OpenRouter responses returned for ${liveCount} of 3 model families.`,
      retrievalModeUsed,
      retrievalSourceCount: evidenceSnippets.length
    }
  };
};







