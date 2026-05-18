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
  | { ok: false; message: string; reason: "not_configured" | "provider_error"; statusCode?: number; providerModelId?: string };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callOpenRouter(modelId: string, prompt: string): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "AI model request failed.", reason: "not_configured", providerModelId: modelId };
  }

  const requestOnce = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);
    try {
      return await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
        body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: prompt }], temperature: 0.2 }),
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
      return {
        ok: false,
        message: response.status === 429 ? "AI model temporarily rate-limited. Please retry." : "AI model request failed.",
        reason: "provider_error",
        statusCode: response.status,
        providerModelId: modelId
      };
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return { ok: false, message: "AI model request failed.", reason: "provider_error", providerModelId: modelId };
    }

    return { ok: true, text, providerModelId: modelId };
  } catch (error) {
    console.error("AI model request exception", { modelId, message: error instanceof Error ? error.message : String(error) });
    await delay(500);
    try {
      const retry = await requestOnce();
      if (retry.ok) {
        const data = (await retry.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return { ok: true, text, providerModelId: modelId };
      }
      return { ok: false, message: "AI model request failed.", reason: "provider_error", statusCode: retry.status, providerModelId: modelId };
    } catch {
      return { ok: false, message: "AI model request failed.", reason: "provider_error", providerModelId: modelId };
    }
  }
}
