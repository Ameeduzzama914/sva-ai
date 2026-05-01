export type ProviderStatus = {
  openaiConfigured: boolean;
  geminiConfigured: boolean;
  deepseekConfigured: boolean;
  liveProviderCount: number;
  hasLiveProvider: boolean;
  retrievalProvider: "mock" | "web";
  webRetrievalConfigured: boolean;
};

export const getProviderStatus = (): ProviderStatus => {
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const deepseekConfigured = Boolean(process.env.DEEPSEEK_API_KEY);
  const liveProviderCount = [openaiConfigured, geminiConfigured, deepseekConfigured].filter(Boolean).length;
  const hasLiveProvider = liveProviderCount > 0;
  const retrievalProvider = process.env.RETRIEVAL_PROVIDER?.toLowerCase() === "web" ? "web" : "mock";
  const webRetrievalConfigured = Boolean(process.env.WEB_RETRIEVAL_API_KEY);

  return {
    openaiConfigured,
    geminiConfigured,
    deepseekConfigured,
    liveProviderCount,
    hasLiveProvider,
    retrievalProvider,
    webRetrievalConfigured
  };
};
