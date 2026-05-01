import type { EvidenceSnippet } from "./models";
import type { RetrievalProvider, RetrievalResult } from "./retrieval";

interface KnowledgeSnippet {
  id: string;
  title: string;
  text: string;
}

const MOCK_WEB_KNOWLEDGE: KnowledgeSnippet[] = [
  {
    id: "mountain-1",
    title: "Reference: Mountain elevations",
    text: "Mount Everest is widely listed at about 8,849 meters above sea level and is generally considered the highest mountain above sea level."
  },
  {
    id: "mountain-2",
    title: "Reference: K2 context",
    text: "K2 is approximately 8,611 meters high and is often described as more technically difficult to climb than Everest."
  },
  {
    id: "languages-1",
    title: "Reference: Python usage",
    text: "Python remains a common recommendation for beginners and AI workflows due to readability and ecosystem maturity."
  },
  {
    id: "languages-2",
    title: "Reference: TypeScript usage",
    text: "TypeScript is frequently preferred for large JavaScript codebases because static typing helps reliability in teams."
  },
  {
    id: "languages-3",
    title: "Reference: Rust usage",
    text: "Rust is often selected for systems programming where memory safety and performance are both high priorities."
  },
  {
    id: "general-1",
    title: "Reference: Verification policy",
    text: "When evidence is incomplete or mixed, confidence should be reduced and uncertainty should be communicated clearly."
  }
];

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const scoreByOverlap = (prompt: string, snippet: string): number => {
  const promptTokens = new Set(normalize(prompt).split(" ").filter((word) => word.length > 2));
  const snippetTokens = new Set(normalize(snippet).split(" ").filter((word) => word.length > 2));

  if (promptTokens.size === 0 || snippetTokens.size === 0) {
    return 0;
  }

  return [...promptTokens].filter((token) => snippetTokens.has(token)).length;
};

export class MockRetrievalProvider implements RetrievalProvider {
  async retrieve(prompt: string, limit = 4): Promise<RetrievalResult> {
    const ranked = MOCK_WEB_KNOWLEDGE.map((item) => ({
      item,
      score: scoreByOverlap(prompt, `${item.title} ${item.text}`)
    }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => ({
        title: entry.item.title,
        text: entry.item.text,
        sourceType: "mock_web" as const,
        sourceId: entry.item.id,
        relevanceScore: Math.round(Math.min(1, entry.score / 8) * 100)
      }));

    const withSignal = ranked.filter((snippet) => snippet.relevanceScore >= 20);
    if (withSignal.length === 0) {
      return {
        snippets: [
          {
            title: "No strong evidence found",
            text: "No relevant evidence snippets matched this prompt in mock retrieval. Treat the result as low-confidence until stronger sources are available.",
            sourceType: "mock_web",
            sourceId: "generic-insufficient-evidence",
            relevanceScore: 20
          }
        ],
        retrievalModeUsed: "mock",
        fallbackToMock: false
      };
    }

    return {
      snippets: withSignal,
      retrievalModeUsed: "mock",
      fallbackToMock: false
    };
  }
}
