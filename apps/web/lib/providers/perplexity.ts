import type { ProviderGenerateInput, ProviderResponse, TextProvider } from "./types";

const PERPLEXITY_URL = "https://api.perplexity.ai/v1/sonar";
const REQUEST_TIMEOUT_MS = 10_000;

const extractPerplexityText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const direct = typeof data.text === "string" ? data.text.trim() : "";
  if (direct.length > 0) {
    return direct;
  }

  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const choice = choices[0] as Record<string, unknown>;
  const message = choice.message;
  if (!message || typeof message !== "object") {
    return null;
  }

  const content = (message as Record<string, unknown>).content;
  if (typeof content !== "string") {
    return null;
  }

  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export class PerplexityProvider implements TextProvider {
  name = "perplexity";

  async generate(input: ProviderGenerateInput): Promise<ProviderResponse> {
    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (!apiKey) {
      return {
        ok: false,
        message: "PERPLEXITY_API_KEY is not configured.",
        reason: "not_configured"
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(PERPLEXITY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: input.prompt }]
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        return {
          ok: false,
          message: `Perplexity request failed with status ${response.status}.`,
          reason: "request_failed"
        };
      }

      const data = (await response.json()) as unknown;
      const text = extractPerplexityText(data);
      if (!text) {
        return {
          ok: false,
          message: "Perplexity response parsing failed: no usable text content was found.",
          reason: "parse_failed"
        };
      }

      return { ok: true, text };
    } catch {
      return {
        ok: false,
        message: "Perplexity request failed due to a network or runtime error.",
        reason: "request_failed"
      };
    }
  }
}
