import type { ProviderGenerateInput, ProviderResponse, TextProvider } from "./types";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_MS = 10_000;

const toText = (value: unknown): string | null => {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const extractFromContentNode = (node: unknown): string | null => {
  if (!node || typeof node !== "object") {
    return null;
  }

  const obj = node as Record<string, unknown>;

  const directText = toText(obj.text) ?? toText(obj.output_text) ?? toText(obj.value);
  if (directText) {
    return directText;
  }

  const nestedText =
    (obj.text && typeof obj.text === "object" ? toText((obj.text as Record<string, unknown>).value) : null) ??
    (obj.output_text && typeof obj.output_text === "object"
      ? toText((obj.output_text as Record<string, unknown>).value)
      : null);

  return nestedText;
};

const extractResponseText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as Record<string, unknown>;

  const quickText = toText(data.output_text);
  if (quickText) {
    return quickText;
  }

  const output = data.output;
  if (!Array.isArray(output)) {
    return null;
  }

  const collected: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const outputItem = item as Record<string, unknown>;

    const itemText = extractFromContentNode(outputItem);
    if (itemText) {
      collected.push(itemText);
    }

    const content = outputItem.content;
    if (Array.isArray(content)) {
      for (const contentNode of content) {
        const nodeText = extractFromContentNode(contentNode);
        if (nodeText) {
          collected.push(nodeText);
        }
      }
    }
  }

  return collected.length > 0 ? collected.join("\n").trim() : null;
};

export class OpenAIProvider implements TextProvider {
  name = "openai";

  async generate(input: ProviderGenerateInput): Promise<ProviderResponse> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        ok: false,
        message: "OPENAI_API_KEY is not configured.",
        reason: "not_configured"
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: input.prompt,
          max_output_tokens: 240
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        const statusMessage = response.status === 429 ? "OpenAI quota/rate limit reached." : `OpenAI request failed with status ${response.status}.`;
        return {
          ok: false,
          message: statusMessage,
          reason: "request_failed",
          statusCode: response.status
        };
      }

      const data = (await response.json()) as unknown;
      const text = extractResponseText(data);

      if (!text) {
        return {
          ok: false,
          message: "OpenAI response parsing failed: no usable text content was found.",
          reason: "parse_failed"
        };
      }

      return {
        ok: true,
        text
      };
    } catch {
      return {
        ok: false,
        message: "OpenAI request failed due to a network or runtime error.",
        reason: "request_failed"
      };
    }
  }
}
