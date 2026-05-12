import type { EvidenceSnippet } from "./models";
import type { RetrievalProvider, RetrievalResult } from "./retrieval";

type SearchItem = { title: string; url: string; snippet: string };

const parseDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
};

class SourceScorer {
  score(domain: string, index: number): { relevanceScore: number; credibilityScore: number } {
    const trusted = ["wikipedia.org", ".gov", ".edu", "britannica.com", "reuters.com", "apnews.com"];
    const credibilityScore = trusted.some((item) => domain.includes(item)) ? 90 : 65;
    const relevanceScore = Math.max(45, 100 - index * 10);
    return { relevanceScore, credibilityScore };
  }
}

class EvidenceFetcher {
  async fetch(prompt: string, limit: number): Promise<SearchItem[]> {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query: prompt, max_results: limit })
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
      return (data.results ?? [])
        .map((r) => ({ title: r.title?.trim() ?? "", url: r.url?.trim() ?? "", snippet: r.content?.trim() ?? "" }))
        .filter((r) => r.title && r.url && r.snippet);
    }

    const serperKey = process.env.WEB_RETRIEVAL_API_KEY;
    const endpoint = process.env.WEB_RETRIEVAL_ENDPOINT;
    if (!serperKey || !endpoint) return [];
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: prompt, num: limit })
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
    return (data.organic ?? [])
      .map((r) => ({ title: r.title?.trim() ?? "", url: r.link?.trim() ?? "", snippet: r.snippet?.trim() ?? "" }))
      .filter((r) => r.title && r.url && r.snippet);
  }
}

export class WebRetrievalProvider implements RetrievalProvider {
  private readonly fetcher = new EvidenceFetcher();
  private readonly scorer = new SourceScorer();

  async retrieve(prompt: string, limit = 5): Promise<RetrievalResult> {
    try {
      const items = await this.fetcher.fetch(prompt, limit);
      const snippets: EvidenceSnippet[] = items.slice(0, limit).map((item, index) => {
        const sourceDomain = parseDomain(item.url);
        const { relevanceScore, credibilityScore } = this.scorer.score(sourceDomain, index);
        return {
          title: item.title,
          text: item.snippet,
          url: item.url,
          sourceDomain,
          sourceType: "web_search",
          sourceId: item.url,
          relevanceScore,
          sourceQualityScore: credibilityScore,
          credibilityScore
        };
      });
      return { snippets, retrievalModeUsed: "web", fallbackToMock: false };
    } catch {
      return { snippets: [], retrievalModeUsed: "web", fallbackToMock: false };
    }
  }
}
