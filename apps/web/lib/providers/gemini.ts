import type { ProviderGenerateInput, ProviderResponse, TextProvider } from "./types";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 10_000;

interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  parts?: GeminiPart[];
}

interface GeminiCandidate {
  content?: GeminiContent;
}

interface GeminiResponseBody {
  candidates?: GeminiCandidate[];
}

const extractGeminiText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as GeminiResponseBody;
  if (!Array.isArray(data.candidates)) {
    return null;
  }

  const text = data.candidates
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
    .filter((value) => value.length > 0)
    .join("\n")
    .trim();

  return text.length > 0 ? text : null;
};

export class GeminiProvider implements TextProvider {
  name = "gemini";

  async generate(input: ProviderGenerateInput): Promise<ProviderResponse> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        ok: false,
        message: "GEMINI_API_KEY is not configured.",
        reason: "not_configured"
      };
    }

    try {
      const url = new URL(GEMINI_URL);
      url.searchParams.set("key", apiKey);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          generationConfig: {
            maxOutputTokens: 240
          },
          contents: [
            {
              role: "user",
              parts: [{ text: input.prompt }]
            }
          ]
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (!response.ok) {
        return {
          ok: false,
          message: `Gemini request failed with status ${response.status}.`,
          reason: "request_failed",
          statusCode: response.status
        };
      }

      const data = (await response.json()) as unknown;
      const text = extractGeminiText(data);

      if (!text) {
        return {
          ok: false,
          message: "Gemini response parsing failed: no usable text content was found.",
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
        message: "Gemini request failed due to a network or runtime error.",
        reason: "request_failed"
      };
    }
  }
}
