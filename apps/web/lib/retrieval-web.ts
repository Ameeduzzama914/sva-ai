import type { EvidenceSnippet, RetrievalResponse, RetrievedSource, SourceClassification, SourceCategory, TrustTier } from "./models";
import type { RetrievalProvider, RetrievalResult } from "./retrieval";

type SearchItem = RetrievedSource;

const parseDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
};

class SourceScorer {
  classify(domain: string): SourceClassification {
    if (domain.includes(".gov") || domain.includes("who.int") || domain.includes("nih.gov") || domain.includes("cdc.gov")) return "government";
    if (domain.includes(".edu")) return "educational";
    if (domain.includes("nature.com") || domain.includes("science.org") || domain.includes("nejm.org") || domain.includes("thelancet.com")) return "scientific";
    if (domain.includes("reuters.com") || domain.includes("apnews.com") || domain.includes("bbc.com") || domain.includes("nytimes.com")) return "news";
    if (domain.includes("wikipedia.org") || domain.includes("britannica.com")) return "encyclopedia";
    if (domain.includes("facebook.com") || domain.includes("reddit.com") || domain.includes("stackexchange.com") || domain.includes("quora.com") || domain.includes("forum")) return "forum";
    if (domain.includes("youtube.com")) return "blog";
    if (domain.includes("blog") || domain.includes("substack") || domain.includes("medium.com")) return "blog";
    return "unknown";
  }

  category(domain: string, classification: SourceClassification): SourceCategory {
    if (domain.includes("nasa.gov") || domain.includes("nih.gov") || domain.includes("who.int")) return "Official Source";
    if (classification === "government") return "Government";
    if (classification === "scientific") return "Scientific Journal";
    if (classification === "educational") return "Educational";
    if (classification === "news") return "Major News";
    if (classification === "encyclopedia") return "Encyclopedia";
    if (classification === "forum") return domain.includes("facebook.com") ? "Social Media" : "Forum";
    if (classification === "blog") return "Blog";
    return "Unknown";
  }

  tier(score: number): TrustTier {
    if (score >= 95) return "Very High Trust";
    if (score >= 85) return "High Trust";
    if (score >= 65) return "Medium Trust";
    if (score >= 40) return "Low Trust";
    return "Very Low Trust";
  }

  score(domain: string, index: number): { relevanceScore: number; credibilityScore: number } {
    const trusted = ["who.int", "cdc.gov", "nih.gov", "nasa.gov", "britannica.com", "wikipedia.org", ".gov", ".edu", "nature.com", "science.org", "reuters.com", "apnews.com"];
    const highlyTrusted = ["who.int", "cdc.gov", "nih.gov", "nasa.gov", "britannica.com", "nature.com", "science.org"];
    const credibilityScore =
      highlyTrusted.some((item) => domain.includes(item)) ? 98 :
      domain.includes("wikipedia.org") || domain.includes("britannica.com") ? 72 :
      domain.includes("facebook.com") || domain.includes("reddit.com") || domain.includes("quora.com") ? 18 :
      domain.includes("youtube.com") ? 45 :
      domain.includes("blog") || domain.includes("medium.com") ? 32 :
      trusted.some((item) => domain.includes(item)) ? 90 : 65;
    const relevanceScore = Math.max(45, 100 - index * 10);
    return { relevanceScore, credibilityScore };
  }
}

class EvidenceFetcher {
  async fetch(prompt: string, limit: number): Promise<RetrievalResponse> {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query: prompt, max_results: Math.max(5, limit), search_depth: "advanced" })
      });
      if (!response.ok) return { sources: [], mode: "web", error: `tavily_status_${response.status}` };
      const data = (await response.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
      const sources = (data.results ?? [])
        .map((r, idx) => {
          const url = r.url?.trim() ?? "";
          return { title: r.title?.trim() ?? "", url, snippet: r.content?.trim() ?? "", domain: parseDomain(url), position: idx + 1 };
        })
        .filter((r) => r.title && r.url && r.snippet);
      return { sources, mode: "web" };
    }

    const serperKey = process.env.SERPER_API_KEY || process.env.WEB_RETRIEVAL_API_KEY;
    const endpoint = process.env.WEB_RETRIEVAL_ENDPOINT || "https://google.serper.dev/search";
    if (!serperKey || !endpoint) return { sources: [], mode: "none", error: "web_retrieval_not_configured" };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": serperKey },
      body: JSON.stringify({ q: prompt, num: Math.max(5, limit) })
    });
    if (!response.ok) return { sources: [], mode: "web", error: `serper_status_${response.status}` };
    const data = (await response.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
    const sources = (data.organic ?? [])
      .map((r, idx) => {
        const url = r.link?.trim() ?? "";
        return { title: r.title?.trim() ?? "", url, snippet: r.snippet?.trim() ?? "", domain: parseDomain(url), position: idx + 1 };
      })
      .filter((r) => r.title && r.url && r.snippet);
    return { sources, mode: "web", error: sources.length === 0 ? "web_retrieval_empty_results" : undefined };
  }
}

export class WebRetrievalProvider implements RetrievalProvider {
  private readonly fetcher = new EvidenceFetcher();
  private readonly scorer = new SourceScorer();

  async retrieve(prompt: string, limit = 5): Promise<RetrievalResult> {
    try {
      const retrieval = await this.fetcher.fetch(prompt, limit);
      const snippets: EvidenceSnippet[] = retrieval.sources
        .filter((item) => item.snippet.length > 40)
        .slice(0, Math.max(3, limit))
        .map((item, index) => {
        const sourceDomain = parseDomain(item.url);
        const { relevanceScore, credibilityScore } = this.scorer.score(sourceDomain, index);
        const sourceClassification = this.scorer.classify(sourceDomain);
        const sourceCategory = this.scorer.category(sourceDomain, sourceClassification);
        const trustTier = this.scorer.tier(credibilityScore);
        return {
          title: item.title,
          text: item.snippet,
          url: item.url,
          sourceDomain,
          sourceType: "web_search",
          sourceId: `${item.position}-${item.url}`,
          sourceClassification,
          sourceCategory,
          domainTrustScore: credibilityScore,
          trustTier,
          trustLabel: credibilityScore >= 85 ? "High Trust" : credibilityScore >= 60 ? "Medium Trust" : "Low Trust",
          relevanceScore,
          sourceQualityScore: credibilityScore,
          credibilityScore
        };
      });
      return { snippets, retrievalModeUsed: retrieval.mode === "none" ? "none" : "web" };
    } catch {
      return { snippets: [], retrievalModeUsed: "web" };
    }
  }
}
