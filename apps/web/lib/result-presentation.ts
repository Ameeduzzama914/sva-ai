import type { VerificationResult } from "./models";

const emptyContentPatterns = [
  /^none[.!]?$/i,
  /^n\/?a[.!]?$/i,
  /^not applicable[.!]?$/i,
  /^no (major )?(risks?|caveats?)( detected)?[.!]?$/i,
  /^no risk flags[.!]?$/i,
  /^unknown[.!]?$/i,
  /^-+$/
];

export const getCanonicalTrustScore = (
  result: Pick<VerificationResult, "finalConfidenceScore"> | null | undefined
): number => {
  const score = Number(result?.finalConfidenceScore);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
};

export const getReliabilityLabel = (score: number): string => {
  if (score >= 85) return "Very Strong Reliability";
  if (score >= 75) return "Strong Reliability";
  if (score >= 66) return "Reliable";
  if (score >= 50) return "Mixed Reliability";
  return "Low Reliability";
};

export const getEvidenceDirection = (
  result: Pick<VerificationResult, "evidenceAlignmentScore"> | null | undefined
): string => {
  const score = result?.evidenceAlignmentScore ?? 0;
  if (score >= 66) return "Supportive";
  if (score >= 45) return "Mixed";
  return "Limited";
};

export const getContradictionRisk = (
  result: Pick<VerificationResult, "contradictionScore"> | null | undefined
): string => {
  const score = result?.contradictionScore ?? 0;
  if (score < 20) return "Low";
  if (score < 50) return "Moderate";
  return "High";
};

export const getMeaningfulText = (value?: string | null): string => {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized || emptyContentPatterns.some((pattern) => pattern.test(normalized))) return "";
  return normalized;
};

const looksLikeGenericCaveat = (value: string): boolean =>
  /population-level variability and unresolved study gaps may limit generalizability/i.test(value) ||
  /areas with sparse or lower-authority evidence reduce certainty/i.test(value) ||
  /^evidence quality is strong overall/i.test(value);

export const getMeaningfulCaveats = (
  result: VerificationResult | null | undefined
): string => {
  if (!result) return "";
  const sectionText = getMeaningfulText(result.sections?.risksAndCaveats);
  if (sectionText && !looksLikeGenericCaveat(sectionText)) return sectionText;
  return (result.judgeRiskFlags ?? [])
    .map((flag) => getMeaningfulText(flag))
    .filter(Boolean)
    .join(" ");
};

export const normalizeEmbeddedScores = (value: string, score: number): string =>
  value
    .replace(/\b\d{1,3}\s*\/\s*100\b/g, `${score}/100`)
    .replace(/\b\d{1,3}%\s+confidence\b/gi, `${score}/100 confidence`);

export const buildVerifiedAnswerText = ({
  trustScore,
  answer,
  evidenceDirection,
  contradictionRisk,
  caveats
}: {
  trustScore: number;
  answer: string;
  evidenceDirection: string;
  contradictionRisk: string;
  caveats?: string;
}): string => {
  const lines = [
    `Verdict: ${getReliabilityLabel(trustScore)}`,
    `Reliability: ${trustScore}/100`,
    `Answer: ${normalizeEmbeddedScores(getMeaningfulText(answer), trustScore)}`,
    `Evidence Direction: ${evidenceDirection}`,
    `Contradiction Risk: ${contradictionRisk}`
  ];
  const meaningfulCaveats = getMeaningfulText(caveats);
  if (meaningfulCaveats) lines.push(`Risks & Caveats: ${meaningfulCaveats}`);
  return lines.join("\n");
};

export const getCanonicalVerifiedAnswer = (
  result: VerificationResult | null | undefined
): string => {
  if (!result) return "";
  const trustScore = getCanonicalTrustScore(result);
  const answer =
    getMeaningfulText(result.sections?.coreConclusion) ||
    getMeaningfulText(result.finalAnswer) ||
    "No verified answer was generated.";

  return buildVerifiedAnswerText({
    trustScore,
    answer,
    evidenceDirection: getEvidenceDirection(result),
    contradictionRisk: getContradictionRisk(result),
    caveats: getMeaningfulCaveats(result)
  });
};
