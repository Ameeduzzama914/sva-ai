import type { EvidenceSnippet } from "./models";
import { MockRetrievalProvider } from "./retrieval-mock";
import { WebRetrievalProvider } from "./retrieval-web";

export interface RetrievalResult {
  snippets: EvidenceSnippet[];
  retrievalModeUsed: "web" | "mock" | "none";
}

export interface RetrievalProvider {
  retrieve(prompt: string, limit?: number): Promise<RetrievalResult>;
}

const selectRetrievalProvider = (): RetrievalProvider => {
  const mode = process.env.RETRIEVAL_PROVIDER?.toLowerCase();
  const web = new WebRetrievalProvider();
  const mock = new MockRetrievalProvider();

  if (mode === "none") {
    return {
      async retrieve() {
        return { snippets: [], retrievalModeUsed: "none" };
      }
    };
  }
  if (mode === "mock") {
    return mock;
  }

  return {
    async retrieve(prompt: string, limit = 5) {
      const webResult = await web.retrieve(prompt, limit);
      if (webResult.snippets.length > 0) return webResult;
      return mock.retrieve(prompt, limit);
    }
  };
};

export const retrievalProvider: RetrievalProvider = selectRetrievalProvider();
