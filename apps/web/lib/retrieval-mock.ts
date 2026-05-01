import type { RetrievalProvider, RetrievalResult } from "./retrieval";

export class MockRetrievalProvider implements RetrievalProvider {
  async retrieve(_prompt: string): Promise<RetrievalResult> {
    return {
      snippets: [],
      retrievalModeUsed: "none",
      fallbackToMock: false
    };
  }
}
