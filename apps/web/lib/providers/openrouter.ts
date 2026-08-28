import type { ModelName } from "../models";
import { classifyOpenRouterProviderFailure } from "../server/openrouter-health";

export const OPENROUTER_MODELS = [
  {
    slot: "Fast AI",
    envKey: "OPENROUTER_MODEL_A",
    fallbackChain: ["mistralai/mistral-7b-instruct:free", "openrouter/free"]
  },
  {
    slot: "Balanced AI",
    envKey: "OPENROUTER_MODEL_B",
    fallbackChain: ["meta-llama/llama-3.1-8b-instruct:free", "openrouter/free"]
  },
  {
    slot: "Research AI",
    envKey: "OPENROUTER_MODEL_C",
    fallbackChain: ["google/gemma-7b-it:free", "openrouter/free"]
  }
] as const satisfies ReadonlyArray<{ slot: ModelName; envKey: string; fallbackChain: readonly string[] }>;

export type OpenRouterProviderErrorType =
  | "billing_failure"
  | "configuration_failure"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_error";

export type OpenRouterResult =
  | { ok: true; text: string; providerModelId: string; actualModelId?: string; costUsd?: number; promptTokens?: number; completionTokens?: number; finishReason?: string; latencyMs?: number }
  | { ok: false; message: string; reason: "not_configured" | "provider_error"; errorType: OpenRouterProviderErrorType; statusCode?: number; providerModelId?: string; providerError?: string; latencyMs?: number };

type OpenRouterOptions = {
  maxTokens?: number;
  signal?: AbortSignal;
  slot?: string;
  layer?: "free" | "pro" | "synthesis" | "unknown";
  attempt?: "primary" | "fallback" | "router_fallback" | "synthesis" | "synthesis_retry";
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readResponseBody = async (response: Response): Promise<{ raw: string; parsed: unknown }> => {
  const raw = await response.text();
  if (!raw.trim()) return { raw, parsed: undefined };
  try {
    return { raw, parsed: JSON.parse(raw) as unknown };
  } catch {
    return { raw, parsed: undefined };
  }
};

const extractProviderError = (payload: unknown, raw: string): string | undefined => {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: unknown; code?: unknown } }).error;
    if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
    if (typeof error?.code === "string" && error.code.trim()) return error.code.trim();
  }
  return raw.trim() || undefined;
};

const pickNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
};

const logOpenRouterAttempt = (event: string, details: Record<string, unknown>) => {
  console.info(`[OpenRouter] ${event}`, details);
};

const logOpenRouterFailure = (event: string, details: Record<string, unknown>) => {
  console.error(`[OpenRouter] ${event}`, details);
};

const getRetryDelayMs = (response: Response): number => {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return 1000;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(5000, seconds * 1000);
  const retryDate = new Date(retryAfter).getTime();
  if (Number.isFinite(retryDate)) return Math.min(5000, Math.max(500, retryDate - Date.now()));
  return 1000;
};

const shouldSingleRetry = (status: number): boolean => [408, 429, 502, 503, 504].includes(status);

export async function callOpenRouter(modelId: string, prompt: string, options: OpenRouterOptions = {}): Promise<OpenRouterResult> {
  const startedAt = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  const attemptMeta = {
    layer: options.layer ?? "unknown",
    slot: options.slot ?? "unknown",
    attempt: options.attempt ?? "primary",
    requestedModelId: modelId
  } as const;
  if (!apiKey) {
    logOpenRouterFailure("request skipped: missing API key", attemptMeta);
    return { ok: false, message: "AI service is temporarily unavailable.", reason: "not_configured", errorType: "configuration_failure", providerModelId: modelId, latencyMs: Date.now() - startedAt };
  }

  const requestOnce = async (): Promise<Response> => {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      options.signal.addEventListener("abort", abortFromParent, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), 28000);
    try {
      logOpenRouterAttempt("request started", { ...attemptMeta, maxTokens: options.maxTokens ?? null });
      return await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {})
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", abortFromParent);
    }
  };

  const handleFailure = async (response: Response): Promise<OpenRouterResult> => {
    const { raw, parsed } = await readResponseBody(response);
    const providerError = extractProviderError(parsed, raw);
    const errorType = classifyOpenRouterProviderFailure(response.status, providerError);
    logOpenRouterFailure("request failed", {
      ...attemptMeta,
      statusCode: response.status,
      statusText: response.statusText,
      errorType,
      providerError,
      latencyMs: Date.now() - startedAt,
      responseBody: raw.slice(0, 1200)
    });
    return {
      ok: false,
      message: errorType === "billing_failure" ? "AI service capacity is temporarily unavailable. Your allowance was not used." : "AI model request failed.",
      reason: "provider_error",
      errorType,
      statusCode: response.status,
      providerModelId: modelId,
      providerError,
      latencyMs: Date.now() - startedAt
    };

  };

  try {
    let response = await requestOnce();
    if (shouldSingleRetry(response.status)) {
      await delay(getRetryDelayMs(response));
      response = await requestOnce();
    }

    if (!response.ok) return handleFailure(response);

    const { raw, parsed } = await readResponseBody(response);
    const data = parsed as {
      model?: string;
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; cost?: unknown; total_cost?: unknown };
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      logOpenRouterFailure("response parsing failed", { ...attemptMeta, statusCode: response.status, responseBody: raw.slice(0, 1200), latencyMs: Date.now() - startedAt });;
      return { ok: false, message: "AI model request failed.", reason: "provider_error", errorType: "provider_error", statusCode: response.status, providerModelId: modelId, latencyMs: Date.now() - startedAt };
    }

    const success: Extract<OpenRouterResult, { ok: true }> = {
      ok: true,
      text,
      providerModelId: modelId,
      actualModelId: data.model,
      costUsd: pickNumber(data.usage?.cost) ?? pickNumber(data.usage?.total_cost),
      promptTokens: pickNumber(data.usage?.prompt_tokens),
      completionTokens: pickNumber(data.usage?.completion_tokens),
      finishReason: data.choices?.[0]?.finish_reason,
      latencyMs: Date.now() - startedAt
    };
    logOpenRouterAttempt("request succeeded", {
      ...attemptMeta,
      actualModelId: success.actualModelId ?? null,
      promptTokens: success.promptTokens ?? null,
      completionTokens: success.completionTokens ?? null,
      costUsd: success.costUsd ?? null,
      finishReason: success.finishReason ?? null,
      latencyMs: success.latencyMs
    });
    return success;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logOpenRouterFailure("request exception", { ...attemptMeta, message, latencyMs: Date.now() - startedAt });
    return { ok: false, message: "AI model request failed.", reason: "provider_error", errorType: "provider_unavailable", providerModelId: modelId, providerError: message, latencyMs: Date.now() - startedAt };
  }
}





