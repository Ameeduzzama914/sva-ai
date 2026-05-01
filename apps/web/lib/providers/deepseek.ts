import type { ProviderGenerateInput, ProviderResponse, TextProvider } from "./types";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const REQUEST_TIMEOUT_MS = 10_000;

interface DeepSeekMessage {
  content?: string;
}

interface DeepSeekChoice {
  message?: DeepSeekMessage;
}

interface DeepSeekResponseBody {
  choices?: DeepSeekChoice[];
}

const extractDeepSeekText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as DeepSeekResponseBody;
  if (!Array.isArray(data.choices)) {
    return null;
  }

  const text = data.choices
    .map((choice) => (typeof choice.message?.content === "string" ? choice.message.content.trim() : ""))
    .filter((value) => value.length > 0)
    .join("\n")
    .trim();

  return text.length > 0 ? text : null;
};

export class DeepSeekProvider implements TextProvider {
  name = "deepseek";

  async generate(input: ProviderGenerateInput): Promise<ProviderResponse> {
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return {
        ok: false,
        message: "DEEPSEEK_API_KEY is not configured.",
        reason: "not_configured"
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: input.prompt }],
          max_tokens: 240
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        return {
          ok: false,
          message: `DeepSeek request failed with status ${response.status}.`,
          reason: "request_failed"
        };
      }

      const data = (await response.json()) as unknown;
      const text = extractDeepSeekText(data);

      if (!text) {
        return {
          ok: false,
          message: "DeepSeek response parsing failed: no usable text content was found.",
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
        message: "DeepSeek request failed due to a network or runtime error.",
        reason: "request_failed"
      };
    }
  }
}
