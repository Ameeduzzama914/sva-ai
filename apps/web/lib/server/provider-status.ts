export type ProviderStatus = {
  openrouterConfigured: boolean;
  liveProviderCount: number;
  hasLiveProvider: boolean;
  retrievalProvider: "none";
  webRetrievalConfigured: boolean;
};

export const getProviderStatus = (): ProviderStatus => {
  const openrouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  const liveProviderCount = openrouterConfigured ? 3 : 0;
  return {
    openrouterConfigured,
    liveProviderCount,
    hasLiveProvider: openrouterConfigured,
    retrievalProvider: "none",
    webRetrievalConfigured: false
  };
};
