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
import { callOpenRouter } from "./openrouter";

type ProSlot = {
  slot: ModelName;
  envKey: "PRO_OPENROUTER_MODEL_A" | "PRO_OPENROUTER_MODEL_B" | "PRO_OPENROUTER_MODEL_C";
  fallbackChain: readonly string[];
  defaultModelId: string;
  envConfigured: () => boolean;
};

const PRO_SLOTS: ProSlot[] = [
  {
    slot: "Fast AI",
    envKey: "PRO_OPENROUTER_MODEL_A",
    fallbackChain: ["openai/gpt-4.1-mini", "openai/gpt-4o-mini"],
    defaultModelId: "openai/gpt-4.1-mini",
    envConfigured: () => Boolean(process.env.PRO_OPENROUTER_MODEL_A)
  },
  {
    slot: "Balanced AI",
    envKey: "PRO_OPENROUTER_MODEL_B",
    fallbackChain: ["google/gemini-2.0-flash-001", "google/gemini-flash-1.5"],
    defaultModelId: "google/gemini-2.0-flash-001",
    envConfigured: () => Boolean(process.env.PRO_OPENROUTER_MODEL_B)
  },
  {
    slot: "Research AI",
    envKey: "PRO_OPENROUTER_MODEL_C",
    fallbackChain: ["deepseek/deepseek-chat-v3-0324", "deepseek/deepseek-chat"],
    defaultModelId: "deepseek/deepseek-chat-v3-0324",
    envConfigured: () => Boolean(process.env.PRO_OPENROUTER_MODEL_C)
  }
];

type ProResult = Awaited<ReturnType<typeof callOpenRouter>>;

const toAnswerSource = (result: ProResult): ModelAnswerSource => (result.ok ? "openrouter" : "fallback_generated");

const toFallbackState = (result: ProResult): ModelFallbackState => {
  if (result.ok) {
    return "none";
  }
  return result.reason === "not_configured" ? "provider_unavailable" : "provider_error";
};

export type ProLayerContext = {
  contextPrompt: string;
  evidenceSnippets: EvidenceSnippet[];
  retrievalModeUsed: "web" | "none";
  mode: VerificationMode;
};

export const buildProLayerResponses = async ({
  contextPrompt,
  evidenceSnippets,
  retrievalModeUsed,
  mode
}: ProLayerContext): Promise<{
  responses: ModelResponse[];
  modelSources: PerModelSource[];
  evidenceSnippets: EvidenceSnippet[];
  meta: VerificationExecutionMeta;
  providerRuntimeStatus: Record<ModelName, RuntimeProviderStatus>;
}> => {
  const outputs = await Promise.all(
    PRO_SLOTS.map(async (slot) => {
      const configuredModel = process.env[slot.envKey]?.trim();
      const modelSequence = [configuredModel, ...slot.fallbackChain].filter((item): item is string => Boolean(item && item.length > 0));
      let lastFailure: ProResult | undefined;

      for (const modelId of modelSequence) {
        const result = await callOpenRouter(modelId, contextPrompt);
        if (result.ok) {
          return result;
        }
        lastFailure = result;
      }

      const fallbackFailure: ProResult = {
        ok: false,
        message: "AI model request failed.",
        reason: "provider_error",
        providerModelId: slot.defaultModelId
      };
      return lastFailure ?? fallbackFailure;
    })
  );

  const responses: ModelResponse[] = PRO_SLOTS.map((slot, index) => {
    const result = outputs[index];
    if (result.ok) {
      return { model: slot.slot, answer: result.text.replace(/\s+/g, " ").trim() || "No response generated." };
    }
    return { model: slot.slot, answer: "" };
  });

  const modelSources: PerModelSource[] = PRO_SLOTS.map((slot, index) => {
    const result = outputs[index];
    return {
      model: slot.slot,
      source: toAnswerSource(result),
      fallbackState: toFallbackState(result),
      providerModelId: result.providerModelId ?? process.env[slot.envKey]?.trim() ?? slot.defaultModelId,
      errorMessage: result.ok ? undefined : result.message,
      statusCode: result.ok ? undefined : result.statusCode
    };
  });

  const providerRuntimeStatus = PRO_SLOTS.reduce(
    (status, slot, index) => {
      const result = outputs[index];
      status[slot.slot] = {
        configured: slot.envConfigured(),
        liveSuccess: result.ok,
        source: toAnswerSource(result),
        fallbackState: toFallbackState(result),
        errorMessage: result.ok ? undefined : result.message,
        statusCode: result.ok ? undefined : result.statusCode,
        providerModelId: result.providerModelId ?? process.env[slot.envKey]?.trim() ?? slot.defaultModelId,
        status: result.ok ? "success" : "failed",
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
      providerMessage: `Live Pro model responses returned for ${liveCount} of 3 providers.`,
      retrievalModeUsed,
      retrievalSourceCount: evidenceSnippets.length
    }
  };
};
