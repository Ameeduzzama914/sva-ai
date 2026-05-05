import type { ModelName } from "../models";

export const OPENROUTER_MODELS = [
  { slot: "Fast AI", envKey: "OPENROUTER_MODEL_A", defaultModel: "mistralai/mistral-7b-instruct:free" },
  { slot: "Balanced AI", envKey: "OPENROUTER_MODEL_B", defaultModel: "meta-llama/llama-3.1-8b-instruct:free" },
  { slot: "Research AI", envKey: "OPENROUTER_MODEL_C", defaultModel: "google/gemma-7b-it:free" }
] as const satisfies ReadonlyArray<{ slot: ModelName; envKey: string; defaultModel: string }>;

export type OpenRouterResult =
  | { ok: true; text: string; providerModelId: string }
  | { ok: false; message: string; reason: "not_configured" | "provider_error"; statusCode?: number; providerModelId?: string };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callOpenRouter(modelId: string, prompt: string): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "AI gateway key is missing.", reason: "not_configured", providerModelId: modelId };
  }

  const requestOnce = async (): Promise<Response> => {
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: prompt }], temperature: 0.2 })
    });
  };

  try {
    let response = await requestOnce();

    if (response.status === 429) {
      await delay(1000);
      response = await requestOnce();
    }

    if (!response.ok) {
      const payload = (await response.text().catch(() => "")).slice(0, 500);
      console.error("AI model request failed", { modelId, statusCode: response.status, errorMessage: payload || response.statusText });
      const userMessage =
        response.status === 404
          ? "Model not found or unavailable. Check backend model configuration."
          : response.status === 429
            ? "Model temporarily rate-limited. Please retry later."
            : "AI model request failed.";
      return { ok: false, message: userMessage, reason: "provider_error", statusCode: response.status, providerModelId: modelId };
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      console.error("AI model response parse failed", { modelId, statusCode: 200, errorMessage: data.error?.message ?? "No content" });
      return { ok: false, message: "AI model request failed.", reason: "provider_error", providerModelId: modelId };
    }

    return { ok: true, text, providerModelId: modelId };
  } catch (error) {
    console.error("AI model request exception", { modelId, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return { ok: false, message: "AI model request failed.", reason: "provider_error", providerModelId: modelId };
  }
}
