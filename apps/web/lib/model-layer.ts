import type { ModelName } from "./models";
import type { UserPlan } from "./server/store";

export type ModelLayerId = "free" | "pro";

export type ModelProviderCardMeta = {
  brand: string;
  monogram: string;
  accent: string;
  logoBg: string;
  badgeLabel: string;
};

export type ModelLayerConfig = {
  id: ModelLayerId;
  badge: string;
  providerMeta: Record<ModelName, ModelProviderCardMeta>;
};

const freeLayer: ModelLayerConfig = {
  id: "free",
  badge: "Free Model Layer",
  providerMeta: {
    "Fast AI": {
      brand: "Mistral AI",
      monogram: "M",
      badgeLabel: "Mistral 7B",
      accent: "from-orange-500/25 via-amber-600/10 to-slate-950/60 border-orange-500/35",
      logoBg: "bg-gradient-to-br from-orange-500 to-amber-600 text-white"
    },
    "Balanced AI": {
      brand: "Llama AI",
      monogram: "L",
      badgeLabel: "Llama 3.1 8B",
      accent: "from-blue-500/25 via-indigo-600/10 to-slate-950/60 border-blue-500/35",
      logoBg: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white"
    },
    "Research AI": {
      brand: "Gemma AI",
      monogram: "G",
      badgeLabel: "Gemma 7B",
      accent: "from-emerald-500/25 via-teal-600/10 to-slate-950/60 border-emerald-500/35",
      logoBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
    }
  }
};

const proLayer: ModelLayerConfig = {
  id: "pro",
  badge: "Pro Model Layer",
  providerMeta: {
    "Fast AI": {
      brand: "GPT",
      monogram: "G",
      badgeLabel: "GPT-4.1 mini",
      accent: "from-emerald-500/25 via-teal-600/10 to-slate-950/60 border-emerald-500/35",
      logoBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
    },
    "Balanced AI": {
      brand: "Gemini",
      monogram: "Gm",
      badgeLabel: "Gemini 2.0 Flash",
      accent: "from-blue-500/25 via-indigo-600/10 to-slate-950/60 border-blue-500/35",
      logoBg: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white"
    },
    "Research AI": {
      brand: "DeepSeek",
      monogram: "D",
      badgeLabel: "DeepSeek Chat",
      accent: "from-violet-500/25 via-purple-600/10 to-slate-950/60 border-violet-500/35",
      logoBg: "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
    }
  }
};

export const resolveModelLayer = (plan?: UserPlan | null): ModelLayerId => {
  if (plan === "pro") {
    return "pro";
  }
  return "free";
};

export const usesProModelLayer = (plan?: UserPlan | null): boolean => resolveModelLayer(plan) === "pro";

export const getModelLayerConfig = (plan?: UserPlan | null): ModelLayerConfig =>
  resolveModelLayer(plan) === "pro" ? proLayer : freeLayer;
