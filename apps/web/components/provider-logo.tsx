export type ProviderLogoName = "openai" | "gemini" | "deepseek" | "mistral" | "meta" | "google";

type ProviderLogoProps = {
  provider?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const logoByProvider: Record<ProviderLogoName, { src: string; alt: string }> = {
  openai: { src: "/provider-logos/openai.svg", alt: "OpenAI logo" },
  gemini: { src: "/provider-logos/gemini.svg", alt: "Google Gemini logo" },
  deepseek: { src: "/provider-logos/deepseek.svg", alt: "DeepSeek logo" },
  mistral: { src: "/provider-logos/mistral.svg", alt: "Mistral AI logo" },
  meta: { src: "/provider-logos/meta.svg", alt: "Meta AI logo" },
  google: { src: "/provider-logos/google.svg", alt: "Google logo" }
};

const sizeClass = {
  sm: "h-6 w-6",
  md: "h-7 w-7",
  lg: "h-8 w-8"
};

export const normalizeProviderLogoName = (provider?: string | null): ProviderLogoName | null => {
  const value = provider?.toLowerCase() ?? "";
  if (value.includes("openai") || value.includes("gpt")) {
    return "openai";
  }
  if (value.includes("gemini")) {
    return "gemini";
  }
  if (value.includes("deepseek")) {
    return "deepseek";
  }
  if (value.includes("mistral")) {
    return "mistral";
  }
  if (value.includes("llama") || value.includes("meta")) {
    return "meta";
  }
  if (value.includes("gemma") || value.includes("google")) {
    return "google";
  }
  return null;
};

export const ProviderLogo = ({ provider, className = "", size = "md" }: ProviderLogoProps) => {
  const logoName = normalizeProviderLogoName(provider);
  if (!logoName) {
    return null;
  }

  const logo = logoByProvider[logoName];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white p-1.5 shadow-sm ring-1 ring-black/10 ${sizeClass[size]} ${className}`}
    >
      <img src={logo.src} alt={logo.alt} className="block h-full w-full object-contain" loading="lazy" />
    </span>
  );
};
