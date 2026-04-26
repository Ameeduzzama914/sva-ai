import type { ProviderGenerateInput, ProviderResponse, TextProvider } from "./types";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 10_000;

interface ClaudeContentBlock {
  type?: string;
  text?: string;
}

interface ClaudeResponseBody {
  content?: ClaudeContentBlock[];
}

const extractClaudeText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as ClaudeResponseBody;
  if (!Array.isArray(data.content)) {
    return null;
  }

  const text = data.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim())
    .filter((value): value is string => Boolean(value && value.length > 0))
    .join("\n")
    .trim();

  return text.length > 0 ? text : null;
};

export class ClaudeProvider implements TextProvider {
  name = "claude";

  async generate(input: ProviderGenerateInput): Promise<ProviderResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return {
        ok: false,
        message: "ANTHROPIC_API_KEY is not configured.",
        reason: "not_configured"
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(CLAUDE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-latest",
          max_tokens: 240,
          messages: [{ role: "user", content: input.prompt }]
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        return {
          ok: false,
          message: `Claude request failed with status ${response.status}.`,
          reason: "request_failed"
        };
      }

      const data = (await response.json()) as unknown;
      const text = extractClaudeText(data);

      if (!text) {
        return {
          ok: false,
          message: "Claude response parsing failed: no usable text content was found.",
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
        message: "Claude request failed due to a network or runtime error.",
        reason: "request_failed"
      };
    }
  }
}
