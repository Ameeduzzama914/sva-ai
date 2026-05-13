import type { EvidenceSnippet } from "./models";
import type { RetrievalProvider, RetrievalResult } from "./retrieval";

const MOCK_EVIDENCE: Array<{ title: string; snippet: string; url: string; keywords: string[] }> = [
  {
    title: "WHO - Tobacco",
    snippet: "Tobacco use is a major risk factor for cancer and many chronic diseases.",
    url: "https://www.who.int/health-topics/tobacco",
    keywords: ["cigarette", "cancer", "tobacco"]
  },
  {
    title: "NASA - Apollo 11 Mission Overview",
    snippet: "Apollo 11 landed humans on the Moon in July 1969.",
    url: "https://www.nasa.gov/mission/apollo-11/",
    keywords: ["moon", "1969", "apollo", "landed"]
  }
];

export class MockRetrievalProvider implements RetrievalProvider {
  async retrieve(prompt: string, limit = 4): Promise<RetrievalResult> {
    const lower = prompt.toLowerCase();
    const matches = MOCK_EVIDENCE.filter((item) => item.keywords.some((k) => lower.includes(k))).slice(0, limit);
    const snippets: EvidenceSnippet[] = matches.map((item, index) => ({
      title: item.title,
      text: item.snippet,
      sourceType: "web_search",
      url: item.url,
      sourceId: item.url,
      sourceDomain: new URL(item.url).hostname,
      sourceQualityScore: 80,
      credibilityScore: 80,
      relevanceScore: Math.max(55, 95 - index * 10)
    }));
    return { snippets, retrievalModeUsed: "mock" };
  }
}
