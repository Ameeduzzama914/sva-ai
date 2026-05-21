import { Badge } from "./ui/badge";
import type { EvidenceSnippet, VerificationResult } from "../lib/models";

type EvidenceCardProps = {
  snippet: EvidenceSnippet;
  linkedClaimsCount: number;
  sourceReliabilityLabel: (score: number) => "Highly Trusted" | "Trusted" | "Moderate" | "Weak Source";
  variant?: "top" | "support" | "weak";
};

export const EvidenceCard = ({
  snippet,
  linkedClaimsCount,
  sourceReliabilityLabel,
  variant = "top"
}: EvidenceCardProps) => {
  const credibility = snippet.credibilityScore ?? snippet.sourceQualityScore ?? 0;
  const borderClass =
    variant === "weak"
      ? "border-amber-700/40 bg-amber-950/20 hover:border-amber-500/50"
      : variant === "support"
        ? "border-slate-700/80 bg-slate-900/50 hover:border-slate-500/60"
        : "border-slate-700/80 bg-slate-900/60 hover:border-violet-400/50";

  return (
    <article
      className={`flex min-w-0 flex-col rounded-xl border p-4 transition ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-100">{snippet.title}</h4>
        {snippet.url ? (
          <a
            href={snippet.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:border-violet-400/50 hover:text-violet-300"
            aria-label="Open source"
            title="Open source"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-4.19l5.22 5.22a.75.75 0 0 1-1.06 1.06l-5.22-5.22v4.19a.75.75 0 0 1-1.5 0v-6Zm10-1a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-.75.75h-6a.75.75 0 0 1 0-1.5h4.19l-5.22-5.22a.75.75 0 0 1 1.06-1.06l5.22 5.22V4.25a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
            </svg>
          </a>
        ) : null}
      </div>

      {snippet.sourceDomain ? (
        <p className="mt-1 truncate text-xs text-slate-500">{snippet.sourceDomain}</p>
      ) : null}

      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-300">{snippet.text}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="success">Credibility {credibility}%</Badge>
        <Badge variant="violet">{sourceReliabilityLabel(credibility)}</Badge>
        {snippet.trustTier ? <Badge variant="indigo">{snippet.trustTier}</Badge> : null}
        {snippet.sourceCategory ? <Badge variant="cyan">{snippet.sourceCategory}</Badge> : null}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Relevance {snippet.relevanceScore}% · {snippet.sourceClassification ?? "unknown"} ·{" "}
        {linkedClaimsCount > 0 ? `${linkedClaimsCount} linked claim${linkedClaimsCount === 1 ? "" : "s"}` : "Background source"}
      </p>
    </article>
  );
};

export const getLinkedClaimsCount = (
  snippet: EvidenceSnippet,
  verification: VerificationResult | null
): number => {
  const evidenceId = snippet.sourceId ?? snippet.url ?? snippet.title;
  return (
    verification?.claimVerifications.filter((claim) => claim.linkedEvidenceIds?.includes(evidenceId))
      .length ?? 0
  );
};
