import { randomUUID } from "crypto";
import type { ModelName, RuntimeProviderStatus } from "../models";
import type { UserPlan } from "./store";
import { getSupabaseAdminClient } from "./supabase-admin";

const familyByModel: Record<ModelName, "gpt" | "gemini" | "deepseek"> = {
  "Fast AI": "gpt",
  "Balanced AI": "gemini",
  "Research AI": "deepseek"
};

export const insertProviderUsageRows = async (input: {
  verificationId: string;
  userId: string;
  plan: UserPlan;
  providerRuntimeStatus: Record<ModelName, RuntimeProviderStatus>;
}): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const rows = Object.entries(input.providerRuntimeStatus).map(([model, status]) => ({
    id: randomUUID(),
    verification_id: input.verificationId,
    user_id: input.userId,
    plan: input.plan,
    model_family: familyByModel[model as ModelName],
    requested_model: status.providerModelId ?? null,
    actual_model: status.actualModelId ?? status.providerModelId ?? null,
    attempt_type: status.status === "fallback" ? "fallback" : "primary",
    prompt_tokens: status.promptTokens ?? null,
    completion_tokens: status.completionTokens ?? null,
    reasoning_tokens: status.reasoningTokens ?? null,
    cached_tokens: status.cachedTokens ?? null,
    cost_usd: status.costUsd ?? null,
    latency_ms: status.latencyMs ?? null,
    provider_http_status: status.statusCode ?? null,
    provider_error_type: status.providerErrorType ?? null,
    status: status.liveSuccess ? "success" : "failed",
    created_at: new Date().toISOString()
  }));

  const { error } = await client.from("provider_usage").insert(rows);
  if (error) {
    console.error("[provider-usage] insert failed:", error.message);
    return false;
  }
  return true;
};

export const insertSynthesisProviderUsageRow = async (input: {
  verificationId: string;
  userId: string;
  plan: UserPlan;
  status: RuntimeProviderStatus & { retryCount?: number };
}): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const { error } = await client.from("provider_usage").insert({
    id: randomUUID(),
    verification_id: input.verificationId,
    user_id: input.userId,
    plan: input.plan,
    model_family: "synthesis",
    requested_model: input.status.providerModelId ?? null,
    actual_model: input.status.actualModelId ?? input.status.providerModelId ?? null,
    attempt_type: input.status.retryCount && input.status.retryCount > 0 ? "synthesis_retry" : "synthesis",
    prompt_tokens: input.status.promptTokens ?? null,
    completion_tokens: input.status.completionTokens ?? null,
    reasoning_tokens: input.status.reasoningTokens ?? null,
    cached_tokens: input.status.cachedTokens ?? null,
    cost_usd: input.status.costUsd ?? null,
    latency_ms: input.status.latencyMs ?? null,
    provider_http_status: input.status.statusCode ?? null,
    provider_error_type: input.status.providerErrorType ?? null,
    status: input.status.liveSuccess ? "success" : "failed",
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error("[provider-usage] synthesis insert failed:", error.message);
    return false;
  }
  return true;
};
