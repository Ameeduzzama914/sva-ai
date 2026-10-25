export const META_PIXEL_ID = "1993876124619806";
export const META_CONSENT_KEY = "sva_meta_analytics_consent";
export const META_CONSENT_EVENT = "sva:meta-consent-changed";
export const META_PENDING_REGISTRATION_KEY = "sva_meta_registration_pending";
export const META_REGISTRATION_TRACKED_KEY = "sva_meta_registration_tracked";

const PUBLIC_PAGEVIEW_PATHS = new Set([
  "/",
  "/contact",
  "/forgot-password",
  "/login",
  "/pricing",
  "/privacy",
  "/refund-policy",
  "/signup",
  "/terms"
]);

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

export const shouldTrackMetaPageView = (pathname: string): boolean =>
  PUBLIC_PAGEVIEW_PATHS.has(pathname) && typeof window !== "undefined" && window.location.search === "";

export type MetaPageViewState = {
  consentGranted: boolean;
  pixelReady: boolean;
  pathname: string;
  search: string;
  lastPageView: string | null;
};

export const getMetaPageViewKey = (pathname: string, search: string): string | null =>
  PUBLIC_PAGEVIEW_PATHS.has(pathname) && search === "" ? pathname : null;

export const shouldSendMetaPageView = ({ consentGranted, pixelReady, pathname, search, lastPageView }: MetaPageViewState): boolean => {
  const pageViewKey = getMetaPageViewKey(pathname, search);
  return consentGranted && pixelReady && pageViewKey !== null && lastPageView !== pageViewKey;
};

const isSafeConversionLocation = (event: "CompleteRegistration" | "Purchase"): boolean => {
  if (typeof window === "undefined" || window.location.search !== "") return false;
  if (event === "CompleteRegistration") return window.location.pathname === "/app" || window.location.pathname === "/billing";
  return window.location.pathname === "/pricing" || window.location.pathname === "/billing";
};

export const trackMetaEvent = (event: "CompleteRegistration" | "Purchase", parameters?: MetaEventParameters): boolean => {
  if (!hasMetaConsent() || !isSafeConversionLocation(event) || typeof window.fbq !== "function") return false;
  window.fbq("track", event, parameters);
  return true;
};

export const queueMetaCompleteRegistration = (): void => {
  if (!hasMetaConsent() || sessionStorage.getItem(META_REGISTRATION_TRACKED_KEY) === "1") return;
  sessionStorage.setItem(META_PENDING_REGISTRATION_KEY, "1");
};

export const flushMetaCompleteRegistration = (): void => {
  if (typeof window === "undefined" || sessionStorage.getItem(META_PENDING_REGISTRATION_KEY) !== "1") return;
  if (!trackMetaEvent("CompleteRegistration", { content_name: "SVA account" })) return;
  sessionStorage.removeItem(META_PENDING_REGISTRATION_KEY);
  sessionStorage.setItem(META_REGISTRATION_TRACKED_KEY, "1");
};

