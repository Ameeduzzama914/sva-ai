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
    fallbackChain: ["google/gemma-3-27b-it:free", "deepseek/deepseek-r1:free", "openrouter/free"]
  }
] as const satisfies ReadonlyArray<{ slot: ModelName; envKey: string; fallbackChain: readonly string[] }>;

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

    console.log("OPENROUTER DEBUG → RESPONSE STATUS:", {
      modelId,
      status: response.status
    });

    if (!response.ok) {
      const payload = (await response.text().catch(() => "")).slice(0, 500);
      console.error("OPENROUTER ERROR:", {
        modelId,
        status: response.status,
        payload: payload
      });
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
    console.log("OPENROUTER DEBUG → RAW DATA:", {
      modelId,
      data
    });
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      console.error("AI model response parse failed", { modelId, statusCode: 200, errorMessage: data.error?.message ?? "No content" });
      return { ok: false, message: "AI model request failed.", reason: "provider_error", providerModelId: modelId };
    }

    console.log("OPENROUTER DEBUG → SUCCESS:", {
      modelId,
      text: text?.slice(0, 200)
    });

    return { ok: true, text, providerModelId: modelId };
  } catch (error) {
    console.error("OPENROUTER EXCEPTION:", {
      modelId,
      error: error instanceof Error ? error.message : error
    });
    return { ok: false, message: "AI model request failed.", reason: "provider_error", providerModelId: modelId };
  }
}
