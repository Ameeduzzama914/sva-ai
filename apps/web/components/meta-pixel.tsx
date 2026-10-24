"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { META_CONSENT_EVENT, META_CONSENT_KEY, META_PIXEL_ID, flushMetaCompleteRegistration, hasMetaConsent, setMetaConsent, shouldTrackMetaPageView } from "../lib/meta-pixel";

const MetaPixelTracker = () => {
  const pathname = usePathname();
  const [consent, setConsent] = useState<"unknown" | "granted" | "denied">("unknown");
  const [pixelReady, setPixelReady] = useState(false);
  const lastPageView = useRef<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(META_CONSENT_KEY);
    setConsent(stored === "granted" ? "granted" : stored === "denied" ? "denied" : "unknown");
    const onConsent = (event: Event) => setConsent((event as CustomEvent<{ granted: boolean }>).detail.granted ? "granted" : "denied");
    window.addEventListener(META_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(META_CONSENT_EVENT, onConsent);
  }, []);

  useEffect(() => {
    if (!pixelReady || !hasMetaConsent() || !shouldTrackMetaPageView(pathname) || typeof window.fbq !== "function" || lastPageView.current === pathname) return;
    lastPageView.current = pathname;
    window.fbq("track", "PageView");
  }, [pathname, pixelReady]);

  useEffect(() => {
    if (!pixelReady) return;
    flushMetaCompleteRegistration();
  }, [pathname, pixelReady]);

  const chooseConsent = (granted: boolean) => {
    setMetaConsent(granted);
    setConsent(granted ? "granted" : "denied");
  };

  return (
    <>
      {consent === "granted" ? (
        <Script id="meta-pixel" strategy="afterInteractive" onReady={() => setPixelReady(true)}>{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
          (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','${META_PIXEL_ID}');
        `}</Script>
      ) : null}
      {consent === "unknown" ? (
        <aside className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-2xl rounded-xl border border-white/10 bg-[#0b0e14]/95 p-4 text-sm text-slate-200 shadow-2xl backdrop-blur" aria-label="Analytics cookie consent">
          <p>Allow analytics cookies to help SVA measure visits, registrations, and verified purchases. Sensitive account and verification content is never sent.</p>
          <div className="mt-3 flex gap-3">
            <button type="button" className="rounded-lg bg-violet-500 px-4 py-2 font-medium text-white" onClick={() => chooseConsent(true)}>Allow analytics</button>
            <button type="button" className="rounded-lg border border-white/15 px-4 py-2 text-slate-200" onClick={() => chooseConsent(false)}>Decline</button>
          </div>
        </aside>
      ) : null}
    </>
  );
};

export const MetaPixel = () => <Suspense fallback={null}><MetaPixelTracker /></Suspense>;

