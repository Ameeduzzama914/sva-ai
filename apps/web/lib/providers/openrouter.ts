import type { ModelName } from "../models";

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

export type OpenRouterResult =
  | { ok: true; text: string; providerModelId: string }
  | { ok: false; message: string; reason: "not_configured" | "provider_error"; statusCode?: number; providerModelId?: string; providerError?: string };

type OpenRouterOptions = {
  maxTokens?: number;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readResponseBody = async (response: Response): Promise<{ raw: string; parsed: unknown }> => {
  const raw = await response.text();
  if (!raw.trim()) {
    return { raw, parsed: undefined };
  }

  try {
    return { raw, parsed: JSON.parse(raw) as unknown };
  } catch {
    return { raw, parsed: undefined };
  }
};

const extractProviderError = (payload: unknown, raw: string): string | undefined => {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
  }

  return raw.trim() || undefined;
};

const logOpenRouterFailure = (event: string, details: Record<string, unknown>) => {
  console.error(`[OpenRouter] ${event}`, details);
};

export async function callOpenRouter(modelId: string, prompt: string, options: OpenRouterOptions = {}): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logOpenRouterFailure("request skipped: missing API key", { modelId });
    return { ok: false, message: "AI model request failed.", reason: "not_configured", providerModelId: modelId };
  }

  const requestOnce = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);
    try {
      return await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
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
    }
  };

  try {
    let response = await requestOnce();
    if (response.status === 429 || response.status >= 500) {
      await delay(1000);
      response = await requestOnce();
    }

    if (!response.ok) {
      const { raw, parsed } = await readResponseBody(response);
      const providerError = extractProviderError(parsed, raw);
      logOpenRouterFailure("request failed", {
        modelId,
        statusCode: response.status,
        statusText: response.statusText,
        providerError,
        responseBody: raw.slice(0, 2000)
      });
      return {
        ok: false,
        message: response.status === 429 ? "AI model temporarily rate-limited. Please retry." : "AI model request failed.",
        reason: "provider_error",
        statusCode: response.status,
        providerModelId: modelId,
        providerError
      };
    }

    const { raw, parsed } = await readResponseBody(response);
    const data = parsed as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      logOpenRouterFailure("response parsing failed", {
        modelId,
        statusCode: response.status,
        responseBody: raw.slice(0, 2000)
      });
      return { ok: false, message: "AI model request failed.", reason: "provider_error", statusCode: response.status, providerModelId: modelId };
    }

    return { ok: true, text, providerModelId: modelId };
  } catch (error) {
    logOpenRouterFailure("request exception", { modelId, message: error instanceof Error ? error.message : String(error) });
    await delay(500);
    try {
      const retry = await requestOnce();
      if (retry.ok) {
        const { raw, parsed } = await readResponseBody(retry);
        const data = parsed as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return { ok: true, text, providerModelId: modelId };
        logOpenRouterFailure("retry response parsing failed", {
          modelId,
          statusCode: retry.status,
          responseBody: raw.slice(0, 2000)
        });
        return { ok: false, message: "AI model request failed.", reason: "provider_error", statusCode: retry.status, providerModelId: modelId };
      }
      const { raw, parsed } = await readResponseBody(retry);
      const providerError = extractProviderError(parsed, raw);
      logOpenRouterFailure("retry request failed", {
        modelId,
        statusCode: retry.status,
        statusText: retry.statusText,
        providerError,
        responseBody: raw.slice(0, 2000)
      });
      return { ok: false, message: "AI model request failed.", reason: "provider_error", statusCode: retry.status, providerModelId: modelId, providerError };
    } catch (retryError) {
      logOpenRouterFailure("retry exception", { modelId, message: retryError instanceof Error ? retryError.message : String(retryError) });
      return { ok: false, message: "AI model request failed.", reason: "provider_error", providerModelId: modelId };
    }
  }
}
