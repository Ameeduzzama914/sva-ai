import type { EvidenceSnippet } from "./models";
import type { RetrievalProvider, RetrievalResult } from "./retrieval";

type SearchItem = { title: string; url: string; snippet: string; position: number };

const parseDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
};

class SourceScorer {
  score(domain: string, index: number): { relevanceScore: number; credibilityScore: number } {
    const trusted = ["who.int", "cdc.gov", "nih.gov", "nasa.gov", "britannica.com", "wikipedia.org", ".gov", ".edu", "nature.com", "science.org", "reuters.com", "apnews.com"];
    const highlyTrusted = ["who.int", "cdc.gov", "nih.gov", "nasa.gov", "britannica.com", "nature.com", "science.org"];
    const credibilityScore = highlyTrusted.some((item) => domain.includes(item)) ? 98 : trusted.some((item) => domain.includes(item)) ? 90 : 65;
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
        body: JSON.stringify({ api_key: tavilyKey, query: prompt, max_results: Math.max(5, limit), search_depth: "advanced" })
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
      return (data.results ?? [])
        .map((r, idx) => ({ title: r.title?.trim() ?? "", url: r.url?.trim() ?? "", snippet: r.content?.trim() ?? "", position: idx + 1 }))
        .filter((r) => r.title && r.url && r.snippet);
    }

    const serperKey = process.env.WEB_RETRIEVAL_API_KEY;
    const endpoint = process.env.WEB_RETRIEVAL_ENDPOINT || "https://google.serper.dev/search";
    if (!serperKey || !endpoint) return [];
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: prompt, num: Math.max(5, limit) })
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
    return (data.organic ?? [])
      .map((r, idx) => ({ title: r.title?.trim() ?? "", url: r.link?.trim() ?? "", snippet: r.snippet?.trim() ?? "", position: idx + 1 }))
      .filter((r) => r.title && r.url && r.snippet);
  }
}

export class WebRetrievalProvider implements RetrievalProvider {
  private readonly fetcher = new EvidenceFetcher();
  private readonly scorer = new SourceScorer();

  async retrieve(prompt: string, limit = 5): Promise<RetrievalResult> {
    try {
      const items = await this.fetcher.fetch(prompt, limit);
      const snippets: EvidenceSnippet[] = items
        .filter((item) => item.snippet.length > 40)
        .slice(0, Math.max(3, limit))
        .map((item, index) => {
        const sourceDomain = parseDomain(item.url);
        const { relevanceScore, credibilityScore } = this.scorer.score(sourceDomain, index);
        return {
          title: item.title,
          text: item.snippet,
          url: item.url,
          sourceDomain,
          sourceType: "web_search",
          sourceId: `${item.position}-${item.url}`,
          relevanceScore,
          sourceQualityScore: credibilityScore,
          credibilityScore
        };
      });
      return { snippets, retrievalModeUsed: "web" };
    } catch {
      return { snippets: [], retrievalModeUsed: "web" };
    }
  }
}
