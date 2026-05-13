import type { EvidenceSnippet } from "./models";
import { MockRetrievalProvider } from "./retrieval-mock";
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
  return web;
};

export const retrievalProvider: RetrievalProvider = selectRetrievalProvider();
