import { resolveModelLayer } from "../model-layer";
import type { UserPlan } from "./store";

export type ProviderStatus = {
  openrouterConfigured: boolean;
  liveProviderCount: number;
  hasLiveProvider: boolean;
  retrievalProvider: "none" | "web";
  webRetrievalConfigured: boolean;
  modelLayer: "free" | "pro";
  proProvidersConfigured?: {
    openai: boolean;
    gemini: boolean;
    deepseek: boolean;
  };
};

export const getProviderStatus = (plan: UserPlan = "free"): ProviderStatus => {
  const retrievalProvider = process.env.RETRIEVAL_PROVIDER?.toLowerCase() === "none" ? "none" : "web";
  const webRetrievalConfigured = Boolean(
    process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY || process.env.WEB_RETRIEVAL_API_KEY
  );
  const modelLayer = resolveModelLayer(plan);

  if (modelLayer === "pro") {
    const proProvidersConfigured = {
      openai: Boolean(process.env.PRO_OPENROUTER_MODEL_A),
      gemini: Boolean(process.env.PRO_OPENROUTER_MODEL_B),
      deepseek: Boolean(process.env.PRO_OPENROUTER_MODEL_C)
    };
    const openrouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
    const liveProviderCount = openrouterConfigured ? Object.values(proProvidersConfigured).filter(Boolean).length : 0;

    return {
      openrouterConfigured,
      liveProviderCount,
      hasLiveProvider: liveProviderCount > 0,
      retrievalProvider,
      webRetrievalConfigured,
      modelLayer: "pro",
      proProvidersConfigured
    };
  }

  const openrouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  const liveProviderCount = openrouterConfigured ? 3 : 0;

  return {
    openrouterConfigured,
    liveProviderCount,
    hasLiveProvider: openrouterConfigured,
    retrievalProvider,
    webRetrievalConfigured,
    modelLayer: "free"
  };
};
