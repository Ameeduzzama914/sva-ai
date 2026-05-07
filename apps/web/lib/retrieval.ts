import type { EvidenceSnippet } from "./models";
import { MockRetrievalProvider } from "./retrieval-mock";
import { WebRetrievalProvider } from "./retrieval-web";

export interface RetrievalResult {
  snippets: EvidenceSnippet[];
  retrievalModeUsed: "mock" | "web" | "none";
  fallbackToMock: boolean;
}

export interface RetrievalProvider {
  retrieve(prompt: string, limit?: number): Promise<RetrievalResult>;
}

class FallbackRetrievalProvider implements RetrievalProvider {
  constructor(
    private readonly primary: RetrievalProvider,
    private readonly fallback: RetrievalProvider
  ) {}

  async retrieve(prompt: string, limit = 4): Promise<RetrievalResult> {
    const primaryResult = await this.primary.retrieve(prompt, limit);
    if (primaryResult.snippets.length > 0) {
      return primaryResult;
    }

    const fallbackResult = await this.fallback.retrieve(prompt, limit);
    return {
      ...fallbackResult,
      fallbackToMock: true
    };
  }
}

const selectRetrievalProvider = (): RetrievalProvider => {
  const mode = process.env.RETRIEVAL_PROVIDER?.toLowerCase();
  const mock = new MockRetrievalProvider();
  const web = new WebRetrievalProvider();

  if (mode === "web") {
    return new FallbackRetrievalProvider(web, mock);
  }

  if (mode === "none") {
    return {
      async retrieve() {
        return { snippets: [], retrievalModeUsed: "none", fallbackToMock: false };
      }
    };
  }

  return mock;
};

export const retrievalProvider: RetrievalProvider = selectRetrievalProvider();
