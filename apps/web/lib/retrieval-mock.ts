import type { RetrievalProvider, RetrievalResult } from "./retrieval";

const MOCK_SNIPPETS = [
  {
    title: "Mount Everest elevation",
    text: "Mount Everest is widely reported at about 8,849 meters above sea level.",
    keywords: ["everest", "mountain", "tallest", "elevation", "height"]
  },
  {
    title: "Land-speed context",
    text: "Production car speed claims vary by test method, road conditions, and official verification.",
    keywords: ["car", "fastest", "speed", "vehicle", "top speed"]
  }
];

export class MockRetrievalProvider implements RetrievalProvider {
  async retrieve(prompt: string): Promise<RetrievalResult> {
    const lower = prompt.toLowerCase();
    const matched = MOCK_SNIPPETS.filter((snippet) => snippet.keywords.some((keyword) => lower.includes(keyword)));

    if (matched.length === 0) {
      return {
        snippets: [
          {
            title: "No strong evidence found",
            text: "No relevant mock evidence matched this prompt.",
            sourceType: "mock_web",
            sourceId: "no-strong-evidence",
            relevanceScore: 20
          }
        ],
        retrievalModeUsed: "mock",
        fallbackToMock: false
      };
    }

    return {
      snippets: matched.map((snippet) => ({
        title: snippet.title,
        text: snippet.text,
        sourceType: "mock_web" as const,
        relevanceScore: 70
      })),
      retrievalModeUsed: "mock",
      fallbackToMock: false
    };
  }
}
