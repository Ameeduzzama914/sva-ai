import type { EvidenceSnippet } from "./models";
import { WebRetrievalProvider } from "./retrieval-web";

export interface RetrievalResult {
  snippets: EvidenceSnippet[];
  retrievalModeUsed: "web" | "none";
}

export interface RetrievalProvider {
  retrieve(prompt: string, limit?: number): Promise<RetrievalResult>;
}

const selectRetrievalProvider = (): RetrievalProvider => {
  const mode = process.env.RETRIEVAL_PROVIDER?.toLowerCase();
  const web = new WebRetrievalProvider();

  if (mode === "none") {
    return {
      async retrieve() {
        return { snippets: [], retrievalModeUsed: "none" };
      }
    };
  }
  return {
    async retrieve(prompt: string, limit = 5) {
      const webResult = await web.retrieve(prompt, limit);
      if (webResult.snippets.length > 0) return webResult;
      return { snippets: [], retrievalModeUsed: "none" };
    }
  };
};

export const retrievalProvider: RetrievalProvider = selectRetrievalProvider();
