import type { EvidenceSnippet } from "./models";
import type { RetrievalProvider, RetrievalResult } from "./retrieval";

interface SerperOrganicResult {
  title?: string;
  snippet?: string;
  link?: string;
}

const asString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseOrganicResults = (payload: unknown): SerperOrganicResult[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;
  if (!Array.isArray(root.organic)) {
    return [];
  }

  return root.organic.reduce<SerperOrganicResult[]>((acc, entry) => {
    if (!entry || typeof entry !== "object") {
      return acc;
    }

    const item = entry as Record<string, unknown>;
    acc.push({
      title: asString(item.title),
      snippet: asString(item.snippet),
      link: asString(item.link)
    });
    return acc;
  }, []);
};

const scoreByPosition = (index: number): number => Math.max(35, 100 - index * 12);

const normalizeSnippet = (candidate: SerperOrganicResult, index: number): EvidenceSnippet | null => {
  const text = asString(candidate.snippet);
  if (!text) {
    return null;
  }

  const title = asString(candidate.title) || `Web source ${index + 1}`;
  const url = asString(candidate.link);

  return {
    title,
    text,
    sourceType: "web_search",
    sourceId: url || `web-${index + 1}`,
    url,
    relevanceScore: scoreByPosition(index)
  };
};

export class WebRetrievalProvider implements RetrievalProvider {
  async retrieve(prompt: string, limit = 4): Promise<RetrievalResult> {
    const endpoint = process.env.WEB_RETRIEVAL_ENDPOINT;
    const apiKey = process.env.WEB_RETRIEVAL_API_KEY;

    if (!endpoint || !apiKey) {
      return { snippets: [], retrievalModeUsed: "web", fallbackToMock: false };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey
        },
        body: JSON.stringify({
          q: prompt,
          num: limit
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return { snippets: [], retrievalModeUsed: "web", fallbackToMock: false };
      }

      const payload = (await response.json()) as unknown;
      const parsed = parseOrganicResults(payload)
        .map((candidate, index) => normalizeSnippet(candidate, index))
        .filter((item): item is EvidenceSnippet => Boolean(item));

      const deduped = parsed.filter((snippet, index, arr) => {
        const key = snippet.url || snippet.title;
        return arr.findIndex((entry) => (entry.url || entry.title) === key) === index;
      });

      return {
        snippets: deduped.slice(0, limit),
        retrievalModeUsed: "web",
        fallbackToMock: false
      };
    } catch {
      return { snippets: [], retrievalModeUsed: "web", fallbackToMock: false };
    } finally {
      clearTimeout(timeout);
    }
  }
}
