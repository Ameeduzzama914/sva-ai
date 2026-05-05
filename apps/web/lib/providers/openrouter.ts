import type { ModelName } from "../models";

export const OPENROUTER_MODELS = [
  { slot: "Fast AI", envKey: "OPENROUTER_MODEL_A", defaultModel: "mistralai/mistral-7b-instruct:free" },
  { slot: "Balanced AI", envKey: "OPENROUTER_MODEL_B", defaultModel: "meta-llama/llama-3.1-8b-instruct:free" },
  { slot: "Research AI", envKey: "OPENROUTER_MODEL_C", defaultModel: "google/gemma-7b-it:free" }
] as const satisfies ReadonlyArray<{ slot: ModelName; envKey: string; defaultModel: string }>;

export type OpenRouterResult =
  | { ok: true; text: string; providerModelId: string }
  | { ok: false; message: string; reason: "not_configured" | "provider_error"; statusCode?: number; providerModelId?: string };

export async function callOpenRouter(modelId: string, prompt: string): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "OPENROUTER_API_KEY is not configured", reason: "not_configured" };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "SVA - Super Verified AI"
      },
      body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: prompt }], temperature: 0.2 })
    });

    if (!response.ok) {
      return { ok: false, message: `OpenRouter request failed (${response.status})`, reason: "provider_error", statusCode: response.status, providerModelId: modelId };
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return { ok: false, message: "OpenRouter returned no text", reason: "provider_error", providerModelId: modelId };
    }

    return { ok: true, text, providerModelId: modelId };
  } catch {
    return { ok: false, message: "OpenRouter request failed", reason: "provider_error", providerModelId: modelId };
  }
}
