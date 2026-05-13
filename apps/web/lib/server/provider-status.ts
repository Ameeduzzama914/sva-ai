export type ProviderStatus = {
  openrouterConfigured: boolean;
  liveProviderCount: number;
  hasLiveProvider: boolean;
  retrievalProvider: "none" | "web";
  webRetrievalConfigured: boolean;
};

export const getProviderStatus = (): ProviderStatus => {
  const openrouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  const liveProviderCount = openrouterConfigured ? 3 : 0;
  const retrievalProvider = process.env.RETRIEVAL_PROVIDER?.toLowerCase() === "none" ? "none" : "web";
  const webRetrievalConfigured = Boolean(process.env.WEB_RETRIEVAL_API_KEY);

  return {
    openrouterConfigured,
    liveProviderCount,
    hasLiveProvider: openrouterConfigured,
    retrievalProvider,
    webRetrievalConfigured
  };
};
