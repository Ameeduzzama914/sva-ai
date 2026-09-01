"use client";

import { useState } from "react";
import { getOAuthCallbackUrl, getSupabaseBrowserClient } from "../lib/supabase-browser";
import { ProviderLogo } from "./provider-logo";
import { Button } from "./ui/button";

type GoogleAuthButtonProps = {
  onError: (message: string) => void;
};

export const GoogleAuthButton = ({ onError }: GoogleAuthButtonProps) => {
  const [submitting, setSubmitting] = useState(false);

  const continueWithGoogle = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      onError("Google sign-in is temporarily unavailable.");
      return;
    }

    setSubmitting(true);
    onError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getOAuthCallbackUrl() }
    });

    if (error) {
      setSubmitting(false);
      onError("Google sign-in could not be started. Please try again.");
    }
  };

  return (
    <Button type="button" variant="primary" className="w-full gap-2" onClick={() => void continueWithGoogle()} disabled={submitting}>
      <ProviderLogo provider="google" size="sm" className="border-0 bg-white" />
      {submitting ? "Connecting to Google..." : "Continue with Google"}
    </Button>
  );
};
