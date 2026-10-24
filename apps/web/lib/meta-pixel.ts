export const META_PIXEL_ID = "1993876124619806";
export const META_CONSENT_KEY = "sva_meta_analytics_consent";
export const META_CONSENT_EVENT = "sva:meta-consent-changed";

type MetaEventParameters = Record<string, string | number | boolean>;

declare global {
  interface Window {
    fbq?: ((command: string, event: string, parameters?: MetaEventParameters) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
    };
    _fbq?: Window["fbq"];
  }
}

export const hasMetaConsent = (): boolean =>
  typeof window !== "undefined" && window.localStorage.getItem(META_CONSENT_KEY) === "granted";

export const setMetaConsent = (granted: boolean): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(META_CONSENT_KEY, granted ? "granted" : "denied");
  window.dispatchEvent(new CustomEvent(META_CONSENT_EVENT, { detail: { granted } }));
};

export const trackMetaEvent = (event: "CompleteRegistration" | "Purchase", parameters?: MetaEventParameters): void => {
  if (!hasMetaConsent() || typeof window.fbq !== "function") return;
  window.fbq("track", event, parameters);
};

