import { randomUUID } from "crypto";
import type { ModelName, ProviderUsageAttempt, RuntimeProviderStatus } from "../models";
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
  providerUsageAttempts?: ProviderUsageAttempt[];
}): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const rows: Array<Record<string, unknown>> = input.providerUsageAttempts?.length
    ? input.providerUsageAttempts.map((attempt) => ({
        id: randomUUID(),
        verification_id: input.verificationId,
        user_id: input.userId,
        plan: input.plan,
        model_family: attempt.modelFamily,
        requested_model: attempt.requestedModel,
        actual_model: attempt.actualModel ?? attempt.requestedModel,
        attempt_type: attempt.attemptType,
        prompt_tokens: attempt.promptTokens ?? null,
        completion_tokens: attempt.completionTokens ?? null,
        reasoning_tokens: attempt.reasoningTokens ?? null,
        cached_tokens: attempt.cachedTokens ?? null,
        cost_usd: attempt.costUsd ?? null,
        latency_ms: attempt.latencyMs ?? null,
        provider_http_status: attempt.statusCode ?? null,
        provider_error_type: attempt.errorType ?? null,
        status: attempt.success ? "success" : "failed",
        created_at: new Date().toISOString()
      }))
    : Object.entries(input.providerRuntimeStatus).map(([model, status]) => ({
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
  attempts?: ProviderUsageAttempt[];
}): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  if (!client) return false;

  const rows = input.attempts?.length ? input.attempts : [{
    modelFamily: "synthesis" as const,
    requestedModel: input.status.providerModelId ?? "unknown",
    actualModel: input.status.actualModelId,
    attemptType: input.status.retryCount && input.status.retryCount > 0 ? "synthesis_retry" as const : "synthesis" as const,
    promptTokens: input.status.promptTokens,
    completionTokens: input.status.completionTokens,
    reasoningTokens: input.status.reasoningTokens,
    cachedTokens: input.status.cachedTokens,
    costUsd: input.status.costUsd,
    latencyMs: input.status.latencyMs,
    statusCode: input.status.statusCode,
    errorType: input.status.providerErrorType,
    success: input.status.liveSuccess
  }];

  const { error } = await client.from("provider_usage").insert(rows.map((attempt) => ({
    id: randomUUID(),
    verification_id: input.verificationId,
    user_id: input.userId,
    plan: input.plan,
    model_family: attempt.modelFamily,
    requested_model: attempt.requestedModel,
    actual_model: attempt.actualModel ?? attempt.requestedModel,
    attempt_type: attempt.attemptType,
    prompt_tokens: attempt.promptTokens ?? null,
    completion_tokens: attempt.completionTokens ?? null,
    reasoning_tokens: attempt.reasoningTokens ?? null,
    cached_tokens: attempt.cachedTokens ?? null,
    cost_usd: attempt.costUsd ?? null,
    latency_ms: attempt.latencyMs ?? null,
    provider_http_status: attempt.statusCode ?? null,
    provider_error_type: attempt.errorType ?? null,
    status: attempt.success ? "success" : "failed",
    created_at: new Date().toISOString()
  })));

  if (error) {
    console.error("[provider-usage] synthesis insert failed:", error.message);
    return false;
  }
  return true;
};
