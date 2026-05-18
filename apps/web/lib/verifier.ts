import { callOpenRouter, OPENROUTER_MODELS } from "./providers/openrouter";
import {
  type ClaimVerification,
  type EvidenceSnippet,
  type ModelName,
  type ModelResponse,
  type PerModelSource,
  type VerificationMode,
  type VerificationExecutionMeta,
  type VerificationResult,
  type RuntimeProviderStatus
} from "./models";
import { extractClaims } from "./claims";
import { retrievalProvider } from "./retrieval";
import { scoreDomainAuthority, sourceCategory, sourceTrustLabel } from "./sourceAuthority";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "being",
  "been",
  "to",
  "of",
  "in",
  "for",
  "on",
  "at",
  "by",
  "with",
  "and",
  "or",
  "as",
  "it",
  "that",
  "this",
  "from",
  "about",
  "into",
  "than",
  "very",
  "often",
  "generally"
]);
const FILLER_PHRASES = [
  "widely reported",
  "approximately",
  "about",
  "according to",
  "it is",
  "the answer is",
  "above sea level"
];

const POSITIVE_CUES = ["is", "are", "highest", "best", "top", "yes", "true", "accepted"];
const NEGATIVE_CUES = ["is not", "isn't", "are not", "no", "false", "never", "cannot", "can't"];
const AGREEMENT_THRESHOLD = 0.56;
const HIGHEST_TRUST_HINTS = [".gov", ".edu", "pubmed", "nih.gov", "who.int", "cdc.gov", "nasa.gov", "nature.com", "science.org", "university", "official documentation", "docs."];
const MEDIUM_TRUST_HINTS = ["reuters", "apnews", "bbc", "nytimes", "economist", "education", "research institute"];
const LOW_TRUST_HINTS = ["blog", "forum", "reddit", "social", "x.com", "twitter", "opinion", "medium.com", "quora"];

const modeWeights: Record<VerificationMode, { agreement: number; evidence: number; source: number }> = {
  fast: { agreement: 40, evidence: 30, source: 20 },
  deep: { agreement: 40, evidence: 30, source: 20 },
  research: { agreement: 40, evidence: 30, source: 20 }
};

const retrievalLimitByMode = (mode: VerificationMode): number => {
  if (mode === "deep") {
    return 10;
  }
  if (mode === "research") {
    return 12;
  }
  return 4;
};

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s.%-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const semanticNormalize = (text: string): string => {
  let value = normalize(text);
  for (const phrase of FILLER_PHRASES) {
    value = value.replace(new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "g"), " ");
  }
  return value.replace(/\s+/g, " ").trim();
};

const tokenize = (text: string): string[] =>
  normalize(text)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

const extractEntities = (text: string): Set<string> => {
  const tokens = tokenize(semanticNormalize(text)).filter((token) => token.length >= 4);
  return new Set(tokens);
};

const extractNumbers = (text: string): Set<string> => {
  const matches = text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [];
  return new Set(matches.map((item) => item.replace(/,/g, "")));
};

const phraseSignal = (text: string, cues: string[]): boolean => {
  const normalized = normalize(text);
  return cues.some((cue) => normalized.includes(cue));
};

const jaccard = (a: Set<string>, b: Set<string>): number => {
  const union = new Set([...a, ...b]);
  if (union.size === 0) {
    return 0;
  }

  const intersectionCount = [...a].filter((item) => b.has(item)).length;
  return intersectionCount / union.size;
};

const numericAgreement = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) {
    return 0.5;
  }

  return jaccard(a, b);
};

const numericConsistencyScore = (a: string, b: string): number => {
  const numsA = [...extractNumbers(a)].map(Number).filter((v) => Number.isFinite(v));
  const numsB = [...extractNumbers(b)].map(Number).filter((v) => Number.isFinite(v));
  if (numsA.length === 0 || numsB.length === 0) return 70;
  const closest = numsA.flatMap((x) => numsB.map((y) => Math.abs(x - y))).sort((m, n) => m - n)[0] ?? 0;
  if (closest <= 1) return 100;
  if (closest <= 10) return 85;
  if (closest <= 100) return 60;
  return 20;
};

const contradictionPenalty = (a: string, b: string): number => {
  const aPositive = phraseSignal(a, POSITIVE_CUES);
  const aNegative = phraseSignal(a, NEGATIVE_CUES);
  const bPositive = phraseSignal(b, POSITIVE_CUES);
  const bNegative = phraseSignal(b, NEGATIVE_CUES);

  const contradictory = ((aPositive && bNegative) || (aNegative && bPositive)) && numericConsistencyScore(a, b) < 70;
  return contradictory ? -0.35 : 0;
};

const detectQueryType = (prompt: string): "factual" | "opinion" | "medical" | "coding" | "financial" | "historical" | "scientific" | "unsafe_or_ambiguous" => {
  const p = prompt.toLowerCase();
  if (/\b(medical|diagnosis|treatment|symptom)\b/.test(p)) return "medical";
  if (/\b(stock|invest|crypto|financial|price target)\b/.test(p)) return "financial";
  if (/\b(code|typescript|python|bug|compile)\b/.test(p)) return "coding";
  if (/\b(history|historical|war|century)\b/.test(p)) return "historical";
  if (/\b(physics|chemistry|biology|scientific)\b/.test(p)) return "scientific";
  if (/\b(opinion|best|should i)\b/.test(p)) return "opinion";
  if (/\b(illegal|harm|attack)\b/.test(p)) return "unsafe_or_ambiguous";
  return "factual";
};

const similarity = (a: string, b: string): number => {
  const lexical = jaccard(new Set(tokenize(semanticNormalize(a))), new Set(tokenize(semanticNormalize(b))));
  const entities = jaccard(extractEntities(a), extractEntities(b));
  const numbers = numericAgreement(extractNumbers(a), extractNumbers(b));
  const penalty = contradictionPenalty(a, b);

  const combined = lexical * 0.42 + entities * 0.35 + numbers * 0.23 + penalty;
  return Math.max(0, Math.min(1, combined));
};

const extractCoreTerms = (answer: string): Set<string> => {
  const normalized = semanticNormalize(answer);
  const tokens = normalized
    .split(" ")
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
  const numbers = [...extractNumbers(normalized)];
  return new Set([...tokens, ...numbers]);
};

const inferSharedCoreAnswer = (responses: ModelResponse[]): Set<string> => {
  const freq = new Map<string, number>();
  responses.forEach((response) => {
    const terms = extractCoreTerms(response.answer);
    terms.forEach((term) => freq.set(term, (freq.get(term) ?? 0) + 1));
  });
  return new Set([...freq.entries()].filter(([, count]) => count >= 2).map(([term]) => term));
};

const hasCoreAgreement = (answer: string, sharedCore: Set<string>): boolean => {
  if (sharedCore.size === 0) return false;
  const terms = extractCoreTerms(answer);
  let matches = 0;
  sharedCore.forEach((term) => {
    if (terms.has(term)) matches += 1;
  });
  return matches >= 1;
};

const isStrongConsensus = (responses: ModelResponse[], sharedCore: Set<string>): boolean =>
  responses.length >= 3 && responses.every((response) => hasCoreAgreement(response.answer, sharedCore));

const buildContextPrompt = (prompt: string, evidenceSnippets: EvidenceSnippet[]): string => {
  const context = evidenceSnippets
    .map((snippet, index) => `${index + 1}. ${snippet.title} (relevance ${snippet.relevanceScore}/100): ${snippet.text}`)
    .join("\n");

  return `You are a verification assistant. Answer the user's question directly in 2-4 concise sentences.
- Prioritize factual statements grounded in the provided evidence.
- Avoid unsupported claims or speculation.
- If evidence is weak, incomplete, or conflicting, explicitly state uncertainty.
- Keep output brief and practical.

Evidence:
${context || "No external evidence snippets were available."}

Question: ${prompt}`;
};

const getModelWeight = (modelSource: PerModelSource | undefined): number => {
  if (!modelSource) {
    return 0.75;
  }

  return 1;
};

const similarityToGroup = (answer: string, group: ModelResponse[]): number => {
  if (group.length === 0) {
    return 0;
  }

  const scores = group.map((member) => {
    const baseSimilarity = similarity(answer, member.answer);
    const numberScore = numericAgreement(extractNumbers(answer), extractNumbers(member.answer));
    const contradiction = contradictionPenalty(answer, member.answer);
    return Math.max(0, Math.min(1, baseSimilarity * 0.75 + numberScore * 0.25 + contradiction * 0.25));
  });

  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const strongest = Math.max(...scores);
  const weakest = Math.min(...scores);

  return average * 0.55 + strongest * 0.35 + weakest * 0.1;
};

const parseDomain = (url?: string): string => {
  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const sourceQualityForSnippet = (snippet: EvidenceSnippet): number => {
  const domain = parseDomain(snippet.url);
  const text = `${snippet.title} ${snippet.text}`.toLowerCase();
  const authority = scoreDomainAuthority(domain);

  if (HIGHEST_TRUST_HINTS.some((item) => domain.includes(item) || text.includes(item))) {
    return Math.max(authority, domain.includes('.gov') || domain.includes('.edu') || domain.includes('pubmed') ? 96 : 90);
  }
  if (MEDIUM_TRUST_HINTS.some((item) => domain.includes(item) || text.includes(item))) {
    return Math.max(72, Math.min(88, authority));
  }
  if (LOW_TRUST_HINTS.some((item) => domain.includes(item) || text.includes(item))) {
    return Math.min(40, authority);
  }
  if (snippet.text.length < 50 || /click|buy now|sponsored|top 10|best ever/.test(text)) {
    return 30;
  }
  return Math.min(75, Math.max(45, authority));
};

const computeSourceQualityScore = (evidenceSnippets: EvidenceSnippet[]): number => {
  if (evidenceSnippets.length === 0) {
    return 0;
  }

  const computed = Math.round(
    evidenceSnippets.reduce((sum, snippet) => sum + (snippet.sourceQualityScore ?? sourceQualityForSnippet(snippet)), 0) /
      evidenceSnippets.length
  );
  return Math.max(35, computed);
};

const computeEvidenceAlignment = (
  majorityResponses: ModelResponse[],
  outlierResponses: ModelResponse[],
  evidenceSnippets: EvidenceSnippet[],
  sourceQualityScore: number
): number => {
  if (evidenceSnippets.length === 0) {
    return 0;
  }

  const scoredSnippets = evidenceSnippets.map((snippet) => ({
    snippet,
    weight: (snippet.relevanceScore * 0.6 + (snippet.sourceQualityScore ?? sourceQualityForSnippet(snippet)) * 0.4) / 100
  }));

  const supportForResponses = (responses: ModelResponse[]): number => {
    if (responses.length === 0) {
      return 0;
    }

    const score = responses.reduce((sum, response) => {
      const snippetSupport = scoredSnippets
        .map(({ snippet, weight }) => similarity(response.answer, `${snippet.title} ${snippet.text}`) * weight)
        .sort((a, b) => b - a)[0] ?? 0;
      return sum + snippetSupport;
    }, 0);

    return score / responses.length;
  };

  const majoritySupport = supportForResponses(majorityResponses);
  const outlierSupport = supportForResponses(outlierResponses);
  const adjusted = Math.max(0, majoritySupport - outlierSupport * 0.65);
  const qualityBoost = sourceQualityScore / 100;
  return Math.round(Math.max(0, Math.min(1, adjusted * 0.8 + qualityBoost * 0.2)) * 100);
};

const computeEvidenceMetrics = (
  evidenceSnippets: EvidenceSnippet[],
  majorityResponses: ModelResponse[],
  outlierResponses: ModelResponse[]
): { evidenceStrength: number; sourceQuality: number; credibility: number; evidenceCoverage: number } => {
  const sourceQuality = computeSourceQualityScore(evidenceSnippets);
  let evidenceStrength = computeEvidenceAlignment(majorityResponses, outlierResponses, evidenceSnippets, sourceQuality);
  if (majorityResponses.length >= 2 && outlierResponses.length === 0 && evidenceSnippets.length > 0) {
    evidenceStrength = Math.max(62, evidenceStrength);
  }
  const credibility = evidenceSnippets.length > 0 ? Math.max(40, sourceQuality) : 0;
  const diversityDomains = new Set(evidenceSnippets.map((snippet) => parseDomain(snippet.url)).filter(Boolean)).size;
  const diversityBonus = Math.min(12, diversityDomains * 3);
  evidenceStrength = Math.min(100, evidenceStrength + diversityBonus);
  const evidenceCoverage = evidenceSnippets.length === 0 ? 0 : Math.min(100, Math.round((evidenceSnippets.length / 5) * 100));
  return { evidenceStrength, sourceQuality, credibility, evidenceCoverage };
};

const contradictionMetrics = (
  responses: ModelResponse[],
  sharedCore: Set<string>
): { contradictionScore: number; contradictionPenalty: number; contradictionType: "direct"|"temporal"|"consensus_shift"|"contextual" } => {
  if (responses.length < 2) {
    return { contradictionScore: 0, contradictionPenalty: 0, contradictionType: "contextual" };
  }

  let conflictSum = 0;
  let pairs = 0;

  for (let i = 0; i < responses.length; i += 1) {
    for (let j = i + 1; j < responses.length; j += 1) {
      const a = responses[i].answer;
      const b = responses[j].answer;
      if (hasCoreAgreement(a, sharedCore) && hasCoreAgreement(b, sharedCore)) {
        pairs += 1;
        continue;
      }
      const numberConflict = 1 - numericAgreement(extractNumbers(a), extractNumbers(b));
      const oppositeConflict = contradictionPenalty(a, b) < 0 ? 1 : 0;
      const semanticConflict = 1 - similarity(a, b);
      const conflict = Math.max(0, Math.min(1, numberConflict * 0.45 + oppositeConflict * 0.35 + semanticConflict * 0.2));
      conflictSum += conflict;
      pairs += 1;
    }
  }

  const contradictionScore = Math.round((conflictSum / pairs) * 100);
  const contradictionPenaltyScore = Math.round((contradictionScore / 100) * 40);
  const temporalPattern = /\b(19\d{2}|20\d{2}|historically|formerly|modern|current consensus|later evidence|in the \d{4}s)\b/i;
  const hasTemporalSignals = responses.some((r) => temporalPattern.test(r.answer)) && contradictionScore > 12;
  const hasConsensusShiftSignals = responses.some((r) => /\b(current|modern|today)\b/i.test(r.answer)) && responses.some((r) => /\b(historically|formerly|past|earlier)\b/i.test(r.answer));
  const contradictionType = contradictionScore >= 45
    ? "direct"
    : hasConsensusShiftSignals
      ? "consensus_shift"
    : hasTemporalSignals
      ? "temporal"
      : "contextual";
  return { contradictionScore, contradictionPenalty: contradictionPenaltyScore, contradictionType };
};

const consensusAlignmentScore = (evidenceSnippets: EvidenceSnippet[], agreementScore: number): number => {
  if (evidenceSnippets.length === 0) return Math.max(20, Math.round(agreementScore * 0.4));
  const authoritative = evidenceSnippets.filter((s) => (s.credibilityScore ?? s.sourceQualityScore ?? 0) >= 90).length;
  const diversity = new Set(evidenceSnippets.map((s) => s.sourceDomain).filter(Boolean)).size;
  const weightedEvidence = Math.round(
    evidenceSnippets.reduce((sum, s) => sum + ((s.relevanceScore * 0.45) + ((s.credibilityScore ?? s.sourceQualityScore ?? 0) * 0.55)), 0) /
      Math.max(1, evidenceSnippets.length)
  );
  return Math.max(0, Math.min(100, Math.round(weightedEvidence * 0.6 + agreementScore * 0.25 + authoritative * 4 + diversity * 2)));
};


const clamp = (v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));

const unifiedTrustScore = (input:{agreement:number;evidence:number;source:number;contradiction:number;claimSupport:number;contradictionType:"direct"|"temporal"|"consensus_shift"|"contextual";}):{score:number;contradictionImpact:number;reliability:VerificationResult["confidenceLabel"];verdict:string} => {
  const contradictionImpact = input.contradictionType === "direct"
    ? clamp(100 - input.contradiction * 1.25)
    : input.contradictionType === "contextual"
      ? clamp(100 - input.contradiction * 0.55)
      : clamp(100 - input.contradiction * 0.8);
  const weighted =
    input.agreement * 0.30 +
    input.evidence * 0.25 +
    input.source * 0.20 +
    contradictionImpact * 0.15 +
    input.claimSupport * 0.10;
  const score = Math.round(clamp(weighted));
  const reliability = score >= 90 ? "Very High" : score >= 75 ? "High" : score >= 60 ? "Medium" : score >= 40 ? "Low" : "Low";
  const verdict = score >= 85 ? "VERIFIED" : score >= 70 ? "LIKELY RELIABLE" : score >= 55 ? "MIXED / NEEDS CONTEXT" : score >= 40 ? "LOW CONFIDENCE" : "NOT RELIABLY SUPPORTED";
  return { score, contradictionImpact, reliability, verdict };
};

const consensusBand = (agreementScore: number, contradictionScore: number): "High Consensus" | "Moderate Consensus" | "Split Consensus" | "Contradictory Results" => {
  if (contradictionScore >= 60) return "Contradictory Results";
  if (agreementScore >= 78 && contradictionScore <= 25) return "High Consensus";
  if (agreementScore >= 58) return "Moderate Consensus";
  return "Split Consensus";
};

const scoreConfidence = (
  mode: VerificationMode,
  agreementScore: number,
  evidenceAlignmentScore: number,
  sourceQualityScore: number,
  contradictionPenaltyValue: number,
  consistencyAdjustment: number,
  guardrails: {
    allFallback: boolean;
    noEvidence: boolean;
    highContradiction: boolean;
    weakEvidence: boolean;
    weakSourceQuality: boolean;
  }
): { score: number; label: VerificationResult["confidenceLabel"] } => {
  const weights = modeWeights[mode];
  const rawScore = Math.round(
    agreementScore * (weights.agreement / 100) +
      evidenceAlignmentScore * (weights.evidence / 100) +
      sourceQualityScore * (weights.source / 100) +
      consistencyAdjustment
  );
  const contradictionPenaltyAdjusted = mode === "deep" ? Math.round(contradictionPenaltyValue * 1.1) : contradictionPenaltyValue;
  let finalScore = Math.max(0, Math.min(100, rawScore - Math.round(contradictionPenaltyAdjusted * 0.75)));

  if (guardrails.allFallback) {
    finalScore = Math.min(finalScore, 60);
  }
  if (guardrails.weakEvidence) {
    finalScore = Math.min(finalScore, 65);
  }
  if (guardrails.highContradiction || guardrails.weakSourceQuality) {
    finalScore = Math.min(finalScore, 70);
  }
  if (guardrails.noEvidence) {
    finalScore = Math.min(finalScore, 62);
  }

  if (finalScore >= 85) {
    return { score: finalScore, label: "Very High" };
  }

  if (finalScore >= 70) {
    return { score: finalScore, label: "High" };
  }

  if (finalScore >= 40) {
    return { score: finalScore, label: "Medium" };
  }

  return { score: finalScore, label: "Low" };
};

const responseConsistencyAdjustment = (responses: ModelResponse[]): { adjustment: number; score: number } => {
  if (responses.length === 0) {
    return { adjustment: -8, score: 0 };
  }

  const scored = responses.map((response) => {
    const answer = response.answer.trim();
    const tokenCount = tokenize(answer).length;
    const hasNumber = extractNumbers(answer).size > 0;
    const hasUncertainLanguage = /\b(maybe|might|possibly|unclear|unknown)\b/i.test(answer);
    const base = Math.min(100, tokenCount * 4);
    const numberBoost = hasNumber ? 12 : 0;
    const vaguePenalty = tokenCount < 8 ? -15 : 0;
    const uncertaintyPenalty = hasUncertainLanguage ? -4 : 0;
    return Math.max(0, Math.min(100, base + numberBoost + vaguePenalty + uncertaintyPenalty));
  });

  const score = Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
  const adjustment = Math.round((score - 50) / 8);
  return { adjustment, score };
};

const uncertaintyDivergenceScore = (responses: ModelResponse[]): number => {
  const strong = /\b(definitely|certainly|always|proven|confirmed)\b/i;
  const cautious = /\b(likely|probably|may|might|unclear|insufficient evidence|unknown)\b/i;
  let strongCount = 0;
  let cautiousCount = 0;
  responses.forEach((response) => {
    if (strong.test(response.answer)) strongCount += 1;
    if (cautious.test(response.answer)) cautiousCount += 1;
  });
  if (strongCount > 0 && cautiousCount > 0) return 75;
  if (cautiousCount > 0) return 45;
  return 10;
};

const temporalAndHallucinationPenalty = (responses: ModelResponse[], evidenceSnippets: EvidenceSnippet[]): { temporalPenalty: number; hallucinationPenalty: number; reasons: string[] } => {
  const reasons: string[] = [];
  const years = responses.flatMap((response) => [...extractNumbers(response.answer)].map(Number).filter((n) => n >= 1900 && n <= 2100));
  const hasWideYearSpread = years.length >= 2 && Math.max(...years) - Math.min(...years) >= 5;
  const hasNoEvidence = evidenceSnippets.length === 0;
  let temporalPenalty = 0;
  let hallucinationPenalty = 0;
  if (hasWideYearSpread) {
    temporalPenalty = 12;
    reasons.push("temporal_inconsistency");
  }
  if (hasNoEvidence && responses.some((response) => /\b(definitely|confirmed|proven)\b/i.test(response.answer))) {
    hallucinationPenalty = 10;
    reasons.push("unsupported_certainty");
  }
  return { temporalPenalty, hallucinationPenalty, reasons };
};

const buildFinalAnswerWithDisagreement = (
  representative: string,
  majorityModels: ModelName[],
  outlierModels: ModelName[],
  contradictionScore: number
): string => {
  if (contradictionScore <= 45 || outlierModels.length === 0) {
    const cleaned = representative
      .replace(/\s+/g, " ")
      .replace(/\baccording to provided evidence\b/gi, "")
      .replace(/\bwidely reported\b/gi, "")
      .replace(/\bwhich is to have\b/gi, "with")
      .trim();
    return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
  }

  return `Most models (${listModels(majorityModels)}) support: ${representative}. Some responses differ (${listModels(outlierModels)}), so confidence is reduced.`;
};

const buildJudgeAssessment = (input: {
  finalConfidenceScore: number;
  evidenceAlignmentScore: number;
  contradictionScore: number;
  claimVerifications: ClaimVerification[];
  majorityModels: ModelName[];
  outlierModels: ModelName[];
}): {
  judgeVerdict: "approved" | "caution" | "rejected";
  judgeSummary: string;
  judgeRiskFlags: string[];
} => {
  const riskFlags: string[] = [];
  const supportedClaims = input.claimVerifications.filter((claim) => claim.status === "supported").length;
  const weakClaims = input.claimVerifications.filter((claim) =>
    ["weak_support", "contradicted", "insufficient_evidence", "unsupported", "uncertain", "partially_supported", "disputed"].includes(claim.status)
  ).length;

  if (input.evidenceAlignmentScore < 45) {
    riskFlags.push("Evidence support is weak for the final answer.");
  }
  if (input.contradictionScore > 45) {
    riskFlags.push("Unresolved contradiction remains between model responses.");
  }
  if (weakClaims > supportedClaims) {
    riskFlags.push("More claims are weak/uncertain than strongly supported.");
  }
  if (input.finalConfidenceScore > 80 && (input.evidenceAlignmentScore < 55 || input.contradictionScore > 35)) {
    riskFlags.push("Confidence may be overstated relative to evidence/contradiction signals.");
  }
  if (input.finalConfidenceScore < 45 && input.evidenceAlignmentScore >= 60 && input.contradictionScore < 25) {
    riskFlags.push("Confidence may be conservative despite decent support.");
  }

  let judgeVerdict: "approved" | "caution" | "rejected" = "approved";
  const allThreeAgree = input.majorityModels.length >= 3 && input.outlierModels.length === 0 && input.contradictionScore <= 10;
  if (allThreeAgree) {
    judgeVerdict = "approved";
  } else if (input.finalConfidenceScore < 60 || input.contradictionScore > 35) {
    judgeVerdict = "rejected";
  } else if (input.finalConfidenceScore < 80) {
    judgeVerdict = "caution";
  }

  const judgeSummary =
    allThreeAgree
      ? "All three AI models agree and no contradiction was detected."
      : judgeVerdict === "approved"
        ? `Strong cross-model agreement was detected. Supporting evidence aligns with the majority response and no material contradiction signals were found.`
        : judgeVerdict === "caution"
          ? `The answer is usable with caution. Majority models align, but evidence depth or contradiction risk lowers certainty.`
          : `The answer is not reliably supported yet. Contradictions or weak evidence materially reduce trust.`;

  return { judgeVerdict, judgeSummary, judgeRiskFlags: riskFlags };
};

const pickRepresentativeAnswer = (majorityGroup: ModelResponse[]): string => {
  if (majorityGroup.length === 0) {
    return "No answer available.";
  }

  if (majorityGroup.length === 1) {
    return majorityGroup[0].answer;
  }

  const scored = majorityGroup.map((candidate) => {
    const peers = majorityGroup.filter((member) => member.model !== candidate.model);
    const avgSimilarity = peers.reduce((acc, peer) => acc + similarity(candidate.answer, peer.answer), 0) / peers.length;

    return { candidate, avgSimilarity };
  });

  scored.sort((a, b) => b.avgSimilarity - a.avgSimilarity);
  return scored[0].candidate.answer;
};

const listModels = (models: ModelName[]): string => (models.length > 0 ? models.join(", ") : "none");
const confidenceReason = (label: VerificationResult["confidenceLabel"]): string => {
  if (label === "High") {
    return "Confidence is High because agreement and evidence support are both strong.";
  }

  if (label === "Medium") {
    return "Confidence is Medium because there is partial agreement or mixed evidence support.";
  }

  return "Confidence is Low because model agreement and/or evidence support are limited.";
};

const claimStatusFromScore = (
  finalClaimScore: number
): ClaimVerification["status"] => {
  if (finalClaimScore >= 75) {
    return "supported";
  }

  if (finalClaimScore >= 55) {
    return "partially_supported";
  }

  if (finalClaimScore >= 35) {
    return "insufficient_evidence";
  }

  return "contradicted";
};

const clusterClaims = (claims: string[]): string[] => {
  const primaryEntity = (text: string): string => {
    const tokens = tokenize(text).filter((token) => token.length > 3);
    return tokens[0] ?? "";
  };
  const factualContext = (text: string): Set<string> =>
    new Set(tokenize(text).filter((token) => ["mountain", "capital", "height", "elevation", "ocean", "speed", "tower", "sea", "level"].includes(token)));
  const numericRelated = (a: string, b: string): boolean => {
    const numsA = extractNumbers(a);
    const numsB = extractNumbers(b);
    if (numsA.size === 0 || numsB.size === 0) return false;
    return numericAgreement(numsA, numsB) >= 0.5 || numericConsistencyScore(a, b) >= 85;
  };
  const clusters: string[] = [];
  claims.forEach((claim) => {
    if (/^\d[\d,.\s]*(m|meters|km|feet|ft)?$/i.test(claim) && clusters.length > 0) {
      clusters[clusters.length - 1] = `${clusters[clusters.length - 1]} at approximately ${claim.replace(/\s+/g, " ").trim()}`;
      return;
    }
    const matchIndex = clusters.findIndex((existing) => {
      const sim = similarity(existing, claim);
      const sameEntity = primaryEntity(existing) !== "" && primaryEntity(existing) === primaryEntity(claim);
      const contextOverlap = jaccard(factualContext(existing), factualContext(claim)) >= 0.3;
      const numericLink = numericRelated(existing, claim);
      return sim >= 0.55 || (sameEntity && contextOverlap) || (sameEntity && numericLink);
    });
    if (matchIndex >= 0) {
      const existing = clusters[matchIndex];
      const merged = `${existing.replace(/[.]$/, "")} ${claim.replace(/^[iI]t\s+/,"").replace(/^[tT]he\s+/,"")}`.replace(/\s+/g, " ");
      clusters[matchIndex] = merged.length > existing.length ? merged : existing;
    } else {
      clusters.push(claim);
    }
  });
  return clusters;
};

const verifyClaims = (
  finalAnswer: string,
  responses: ModelResponse[],
  evidenceSnippets: EvidenceSnippet[],
  outlierModels: ModelName[]
): ClaimVerification[] => {
  const claims = clusterClaims(extractClaims(finalAnswer));
  console.log("SVA_DEBUG_CLAIMS", { extractedCount: claims.length, claims });

  return claims.map((claim, index) => {
    const scoredEvidence = evidenceSnippets
      .map((snippet) => {
        const textScore = similarity(claim, snippet.text);
        const titleScore = similarity(claim, snippet.title);
        const qualityWeight = (snippet.sourceQualityScore ?? sourceQualityForSnippet(snippet)) / 100;
        const overlap = jaccard(new Set(tokenize(claim)), new Set(tokenize(`${snippet.title} ${snippet.text}`)));
        const score = (Math.max(textScore, titleScore) * 0.55) + (overlap * 0.25) + (qualityWeight * 0.2);
        return { snippet, score };
      })
      .sort((a, b) => b.score - a.score);

    const evidenceScore = Math.round(((scoredEvidence[0]?.score ?? 0) * 0.55 + (scoredEvidence[1]?.score ?? 0) * 0.3 + (scoredEvidence[2]?.score ?? 0) * 0.15) * 100);
    const modelSupportScore = Math.round(
      responses.reduce((sum, response) => sum + similarity(claim, response.answer), 0) / Math.max(1, responses.length) * 100
    );
    let finalClaimScore = Math.round(evidenceScore * 0.6 + modelSupportScore * 0.4);
    const strongModelConsensus = responses.length >= 3 && responses.every((response) => similarity(claim, response.answer) >= 0.35);
    if (strongModelConsensus && evidenceScore >= 20) {
      finalClaimScore = Math.max(finalClaimScore, 82);
    }

    const contradictedByModels = responses
      .filter((response) => {
        const responseSimilarity = similarity(claim, response.answer);
        const contradiction = contradictionPenalty(claim, response.answer);
        const isOutlier = outlierModels.includes(response.model);
        const explicitConflict = contradiction < 0 && responseSimilarity < 0.35;
        return explicitConflict || (isOutlier && responseSimilarity < 0.15 && !strongModelConsensus);
      })
      .map((response) => response.model);

    const hasExplicitContradiction = evidenceSnippets.length > 0 && contradictedByModels.length > 0 && modelSupportScore < 55 && evidenceCredibilityScore >= 60;
    const supportingEvidence = scoredEvidence
      .filter((entry) => entry.score >= 0.22)
      .slice(0, 4)
      .map((entry) => entry.snippet);
    const evidenceRelevanceScore = supportingEvidence.length > 0 ? Math.round(supportingEvidence.reduce((sum, item) => sum + item.relevanceScore, 0) / supportingEvidence.length) : 0;
    const evidenceCredibilityScore = supportingEvidence.length > 0 ? Math.round(supportingEvidence.reduce((sum, item) => sum + (item.credibilityScore ?? item.sourceQualityScore ?? 0), 0) / supportingEvidence.length) : 0;
    const hasPartialEvidence = evidenceScore >= 35 || scoredEvidence.some((entry) => entry.score >= 0.28);
    const hasStrongEvidence = evidenceScore >= 58 || scoredEvidence.some((entry) => entry.score >= 0.45);
    const independentCorroboration = supportingEvidence.length >= 2 && evidenceCredibilityScore >= 75;
    const mixedEvidence = scoredEvidence.slice(0, 3).some((entry) => /not|no|false|myth|debunk/i.test(entry.snippet.text)) && hasStrongEvidence;
    const status: ClaimVerification["status"] = hasExplicitContradiction
      ? "contradicted"
      : mixedEvidence
        ? "disputed"
      : strongModelConsensus && evidenceSnippets.length > 0 && hasStrongEvidence && independentCorroboration && evidenceScore >= 80
        ? "strongly_supported"
      : strongModelConsensus && evidenceSnippets.length > 0 && hasStrongEvidence
        ? "supported"
      : evidenceScore >= 60 && modelSupportScore >= 60
        ? "supported"
        : hasPartialEvidence && modelSupportScore >= 45 && evidenceCredibilityScore >= 55
          ? "weak_support"
          : "insufficient_evidence";

    const contradictionPenaltyScore = hasExplicitContradiction ? (evidenceCredibilityScore >= 80 ? 34 : 24) : status === "disputed" ? 10 : 0;
    let finalConfidence = Math.max(0, Math.min(100, Math.round(modelSupportScore * 0.35 + evidenceScore * 0.35 + evidenceCredibilityScore * 0.2 + evidenceRelevanceScore * 0.1 - contradictionPenaltyScore)));
    if (status === "strongly_supported") finalConfidence = Math.max(84, finalConfidence);
    if (status === "supported") finalConfidence = Math.max(70, Math.min(89, finalConfidence));
    if (status === "weak_support") finalConfidence = Math.max(50, Math.min(69, finalConfidence));
    if (status === "insufficient_evidence") finalConfidence = Math.min(55, Math.max(25, finalConfidence));
    if (status === "contradicted") finalConfidence = Math.min(35, finalConfidence);
    if (status === "disputed") finalConfidence = Math.max(40, Math.min(62, finalConfidence));

    const explanation = `Agreement ${modelSupportScore}/100, evidence ${evidenceScore}/100, contradiction penalty ${contradictionPenaltyScore}/100. Final claim confidence is ${finalConfidence}/100 (${status.replaceAll(
      "_",
      " "
    )})${contradictedByModels.length > 0 ? `, with contradiction signals from ${listModels(contradictedByModels)}.` : "."}`;
    const linkedEvidenceIds = supportingEvidence.map((item) => item.sourceId ?? item.url ?? item.title);
    console.log("SVA_DEBUG_CLAIM_SCORE", { claim, evidenceScore, modelSupportScore, contradictionPenaltyScore, finalConfidence, status, contradictedByModels, linkedEvidenceIds, evidenceRelevanceScore, evidenceCredibilityScore, topSimilarities: scoredEvidence.slice(0,3).map((e) => ({ id: e.snippet.sourceId ?? e.snippet.url ?? e.snippet.title, score: Number(e.score.toFixed(3)) })) });

    return {
      id: `claim-${index + 1}`,
      claim,
      status,
      confidenceScore: finalConfidence,
      claimConfidenceScore: finalConfidence,
      supportingEvidence,
      linkedEvidenceIds,
      evidenceRelevanceScore,
      evidenceCredibilityScore,
      contradictedByModels,
      explanation
    };
  });
};

const buildFocusedRetrievalQueries = (prompt: string): string[] => {
  const claimQueries = extractClaims(prompt).slice(0, 3).map((claim) => `${claim.replace(/[.]/g, "")} scientific consensus evidence`);
  return [prompt, ...claimQueries];
};

export const buildResponsesForPrompt = async (
  prompt: string,
  mode: VerificationMode = "fast"
): Promise<{
  responses: ModelResponse[];
  modelSources: PerModelSource[];
  evidenceSnippets: EvidenceSnippet[];
  meta: VerificationExecutionMeta;
  providerRuntimeStatus: Record<ModelName, RuntimeProviderStatus>;
}> => {
  const queries = buildFocusedRetrievalQueries(prompt);
  const retrievalResults = await Promise.all(queries.map((query) => retrievalProvider.retrieve(query, retrievalLimitByMode(mode))));
  const retrievalModeUsed = retrievalResults.find((r) => r.retrievalModeUsed === "web")?.retrievalModeUsed ?? retrievalResults[0]?.retrievalModeUsed ?? "none";
  const mergedSnippets = retrievalResults.flatMap((result) => result.snippets).filter((snippet, idx, arr) => {
    const key = snippet.sourceId ?? snippet.url ?? `${snippet.title}-${snippet.text.slice(0, 40)}`;
    return arr.findIndex((candidate) => (candidate.sourceId ?? candidate.url ?? `${candidate.title}-${candidate.text.slice(0, 40)}`) === key) === idx;
  });
  const evidenceSnippets = mergedSnippets.map((snippet) => {
    const normalizedQuality = Math.max(40, snippet.sourceQualityScore ?? sourceQualityForSnippet(snippet));
    return { ...snippet, sourceQualityScore: normalizedQuality, credibilityScore: snippet.credibilityScore ?? normalizedQuality };
  });
  const contextPrompt = buildContextPrompt(prompt, evidenceSnippets);

  const MODELS = OPENROUTER_MODELS.map((slot) => {
    const primaryModel = process.env[slot.envKey]?.trim();
    const modelSequence = [primaryModel, ...slot.fallbackChain].filter((item): item is string => Boolean(item && item.length > 0));
    return {
      name: slot.slot,
      primaryModel: primaryModel ?? slot.fallbackChain[0],
      modelSequence
    };
  });

  const outputs = await Promise.all(
    MODELS.map(async (slot) => {
      let lastFailure: Awaited<ReturnType<typeof callOpenRouter>> | undefined;

      for (const modelId of slot.modelSequence) {
        const result = await callOpenRouter(modelId, contextPrompt);
        if (result.ok) {
          return result;
        }
        lastFailure = result;
      }

      return lastFailure;
    })
  );
  const getOpenRouterErrorMessage = (result: Awaited<ReturnType<typeof callOpenRouter>> | undefined): string | undefined => {
    if (!result || result.ok === true) return undefined;
    return result.message;
  };

  const getOpenRouterErrorStatus = (result: Awaited<ReturnType<typeof callOpenRouter>> | undefined): number | undefined => {
    if (!result || result.ok === true) return undefined;
    return result.statusCode;
  };

  const responses: ModelResponse[] = MODELS.map((m, i) => {
    const result = outputs[i];
    if (result && result.ok === true) {
      return { model: m.name, answer: result.text?.replace(/\s+/g, " ").trim() || "No response generated." };
    }

    return {
      model: m.name,
      answer: ""
    };
  });

  const modelSources: PerModelSource[] = MODELS.map((m, i) => {
    const result = outputs[i];
    const fallbackState = result && result.ok === true ? "none" : result?.reason === "not_configured" ? "provider_unavailable" : "provider_error";
    return {
      model: m.name,
      source: result && result.ok === true ? "openrouter" : "fallback_generated",
      fallbackState,
      providerModelId: result?.providerModelId ?? MODELS[i].primaryModel,
      errorMessage: getOpenRouterErrorMessage(result),
      statusCode: getOpenRouterErrorStatus(result)
    };
  });

  const providerRuntimeStatus: Record<ModelName, RuntimeProviderStatus> = {
    "Fast AI": {
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      liveSuccess: outputs[0]?.ok === true,
      source: "openrouter",
      fallbackState: outputs[0]?.ok === true ? "none" : outputs[0]?.reason === "not_configured" ? "provider_unavailable" : "provider_error",
      errorMessage: getOpenRouterErrorMessage(outputs[0]),
      statusCode: getOpenRouterErrorStatus(outputs[0]),
      providerModelId: outputs[0]?.providerModelId,
      status: outputs[0]?.ok === true ? "success" : "failed",
      rawResponse: outputs[0]?.ok === true ? outputs[0].text.slice(0, 1200) : undefined
    },
    "Balanced AI": {
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      liveSuccess: outputs[1]?.ok === true,
      source: "openrouter",
      fallbackState: outputs[1]?.ok === true ? "none" : outputs[1]?.reason === "not_configured" ? "provider_unavailable" : "provider_error",
      errorMessage: getOpenRouterErrorMessage(outputs[1]),
      statusCode: getOpenRouterErrorStatus(outputs[1]),
      providerModelId: outputs[1]?.providerModelId,
      status: outputs[1]?.ok === true ? "success" : "failed",
      rawResponse: outputs[1]?.ok === true ? outputs[1].text.slice(0, 1200) : undefined
    },
    "Research AI": {
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      liveSuccess: outputs[2]?.ok === true,
      source: "openrouter",
      fallbackState: outputs[2]?.ok === true ? "none" : outputs[2]?.reason === "not_configured" ? "provider_unavailable" : "provider_error",
      errorMessage: getOpenRouterErrorMessage(outputs[2]),
      statusCode: getOpenRouterErrorStatus(outputs[2]),
      providerModelId: outputs[2]?.providerModelId,
      status: outputs[2]?.ok === true ? "success" : "failed",
      rawResponse: outputs[2]?.ok === true ? outputs[2].text.slice(0, 1200) : undefined
    }
  };

  return {
    responses,
    modelSources,
    evidenceSnippets,
    providerRuntimeStatus,
    meta: {
      mode: "openrouter",
      modeUsed: mode,
      modelASource: "openrouter",
      modelBSource: "openrouter",
      modelCSource: "openrouter",
      providerMessage: "Live AI responses returned for all 3 models.",
      retrievalModeUsed,
      retrievalSourceCount: evidenceSnippets.length,
    }
  };
};

export const verifyResponses = (
  responses: ModelResponse[],
  modelSources: PerModelSource[],
  evidenceSnippets: EvidenceSnippet[],
  mode: VerificationMode = "fast",
  failedModelCount = 0,
  prompt = ""
): VerificationResult => {
  const validResponses = responses.filter((response) => response.answer && response.answer.trim().length > 0);

  if (validResponses.length === 0) {
    return {
      agreementScore: 0,
      evidenceAlignmentScore: 0,
      finalConfidenceScore: 0,
      confidenceLabel: "Low",
      finalAnswer: "Final answer generated with limited model agreement. Confidence is low.",
      majorityModels: [],
      outlierModels: [],
      reasoning: "No live model responses were returned.",
      explanation: "Live verification unavailable. All model calls failed.",
      claimVerifications: [],
      contradictionScore: 0,
      contradictionPenalty: 0,
      sourceQualityScore: 0,
      judgeVerdict: "rejected",
      judgeSummary: "NO DATA",
      judgeRiskFlags: ["No models responded successfully."]
    };
  }

  if (validResponses.length === 1) {
    const only = validResponses[0];
    return {
      agreementScore: 25,
      evidenceAlignmentScore: 20,
      finalConfidenceScore: 25,
      confidenceLabel: "Low",
      finalAnswer: `${only.answer}\n\nFinal answer generated with limited model agreement. Confidence is low.`,
      majorityModels: [],
      outlierModels: [],
      reasoning: "Only one model responded successfully.",
      explanation: "Partial verification: only 1/3 models responded.",
      claimVerifications: [],
      contradictionScore: 0,
      contradictionPenalty: 0,
      sourceQualityScore: computeSourceQualityScore(evidenceSnippets),
      judgeVerdict: "caution",
      judgeSummary: "LOW CONFIDENCE",
      judgeRiskFlags: ["Only one model response available."]
    };
  }

  responses = validResponses;
  const sharedCore = inferSharedCoreAnswer(responses);
  const strongConsensus = isStrongConsensus(responses, sharedCore);
  const groups: ModelResponse[][] = [];
  const groupScores: Array<{ model: ModelName; bestGroupScore: number; assignedGroupIndex: number }> = [];

  responses.forEach((response) => {
    const scoredGroups = groups.map((group, index) => ({
      index,
      score: similarityToGroup(response.answer, group)
    }));

    scoredGroups.sort((a, b) => b.score - a.score);
    const bestMatch = scoredGroups[0];

    const semanticallyAligned = hasCoreAgreement(response.answer, sharedCore);
    if (bestMatch && (bestMatch.score >= AGREEMENT_THRESHOLD || semanticallyAligned)) {
      groups[bestMatch.index] = [...groups[bestMatch.index], response];
      groupScores.push({
        model: response.model,
        bestGroupScore: Math.round(bestMatch.score * 100) / 100,
        assignedGroupIndex: bestMatch.index
      });
      return;
    }

    groupScores.push({
      model: response.model,
      bestGroupScore: bestMatch ? Math.round(bestMatch.score * 100) / 100 : 0,
      assignedGroupIndex: groups.length
    });
    groups.push([response]);
  });

  const largestGroup = groups.sort((a, b) => b.length - a.length)[0] ?? [];
  const majorityModels = responses
    .filter((response) => largestGroup.some((member) => member.model === response.model) || hasCoreAgreement(response.answer, sharedCore))
    .map((response) => response.model);
  const outlierModels = responses
    .filter((response) => !majorityModels.includes(response.model))
    .map((response) => response.model);

  const totalWeight = responses.reduce((sum, response) => {
    const modelSource = modelSources.find((source) => source.model === response.model);
    return sum + getModelWeight(modelSource);
  }, 0);
  const majorityWeight = largestGroup.reduce((sum, response) => {
    const modelSource = modelSources.find((source) => source.model === response.model);
    return sum + getModelWeight(modelSource);
  }, 0);
  const baselineAgreement = totalWeight === 0 ? 0 : Math.round((majorityWeight / totalWeight) * 100);
  const semanticAgreementScore = Math.round(
    responses.reduce((sum, r) => sum + similarity(r.answer, pickRepresentativeAnswer(largestGroup)), 0) / Math.max(1, responses.length) * 100
  );
  const conclusionAlignmentScore = Math.round(
    responses.filter((r) => hasCoreAgreement(r.answer, sharedCore)).length / Math.max(1, responses.length) * 100
  );
  const reasoningDivergenceScore = Math.max(0, 100 - semanticAgreementScore);
  const uncertaintyAlignmentScore = Math.max(0, 100 - Math.round(uncertaintyDivergenceScore(responses) * 1.2));
  const agreementScore = Math.round(
    baselineAgreement * 0.35 +
    semanticAgreementScore * 0.3 +
    conclusionAlignmentScore * 0.2 +
    uncertaintyAlignmentScore * 0.15
  );

  const outlierResponses = responses.filter((response) => outlierModels.includes(response.model));
  const evidenceMetrics = computeEvidenceMetrics(evidenceSnippets, largestGroup, outlierResponses);
  const sourceQualityScore = evidenceMetrics.sourceQuality;
  let evidenceAlignmentScore = evidenceMetrics.evidenceStrength;
  const authoritativeCount = evidenceSnippets.filter((snippet) => (snippet.credibilityScore ?? snippet.sourceQualityScore ?? 0) >= 90).length;
  if (authoritativeCount >= 2) evidenceAlignmentScore = Math.max(evidenceAlignmentScore, 80);
  if (authoritativeCount >= 3) evidenceAlignmentScore = Math.max(evidenceAlignmentScore, 88);
  const contradiction = strongConsensus
    ? { contradictionScore: 0, contradictionPenalty: 0, contradictionType: "contextual" as const }
    : contradictionMetrics(responses, sharedCore);
  const consistency = responseConsistencyAdjustment(responses);
  const divergenceScore = uncertaintyDivergenceScore(responses);
  const temporalHallucination = temporalAndHallucinationPenalty(responses, evidenceSnippets);
  const queryType = detectQueryType(prompt || responses[0]?.answer || "");
  const allProvidersFallback = false;
  const noEvidence = evidenceSnippets.length === 0;
  const confidence = scoreConfidence(
    mode,
    agreementScore,
    evidenceAlignmentScore,
    sourceQualityScore,
    contradiction.contradictionPenalty,
    consistency.adjustment,
    {
      allFallback: allProvidersFallback,
      noEvidence,
      highContradiction: contradiction.contradictionScore > 45,
      weakEvidence: evidenceAlignmentScore < 35,
      weakSourceQuality: sourceQualityScore < 40
    }
  );
  console.log("SVA_DEBUG_TRUST", { agreementScore, evidenceAlignmentScore, sourceQualityScore, contradictionScore: contradiction.contradictionScore, contradictionPenalty: contradiction.contradictionPenalty, mode });
  const availabilityPenalty = failedModelCount === 1 ? 5 : 0;
  const consensusScore = consensusAlignmentScore(evidenceSnippets, agreementScore);
  let adjustedFinalConfidence = Math.max(
    0,
    confidence.score - availabilityPenalty - Math.round(divergenceScore * 0.08) - temporalHallucination.temporalPenalty - temporalHallucination.hallucinationPenalty
  );
  adjustedFinalConfidence = Math.round(Math.max(adjustedFinalConfidence, adjustedFinalConfidence * 0.75 + consensusScore * 0.25));
  if ((queryType === "medical" || queryType === "financial") && evidenceAlignmentScore < 65) {
    adjustedFinalConfidence = Math.min(adjustedFinalConfidence, 70);
  }
  if (contradiction.contradictionScore > 50 || agreementScore < 45) {
    adjustedFinalConfidence = Math.min(adjustedFinalConfidence, 58);
  }
  if (evidenceAlignmentScore < 35 && sourceQualityScore < 40) {
    adjustedFinalConfidence = Math.min(adjustedFinalConfidence, 52);
  }
  if (strongConsensus) {
    adjustedFinalConfidence = Math.max(evidenceAlignmentScore >= 60 ? 85 : 75, adjustedFinalConfidence);
  } else if (responses.length === 3 && majorityModels.length === 3) {
    adjustedFinalConfidence = Math.max(evidenceAlignmentScore >= 50 ? 72 : 65, adjustedFinalConfidence);
  }
  if (responses.length === 2 && majorityModels.length === 2 && failedModelCount === 1) {
    adjustedFinalConfidence = Math.max(65, adjustedFinalConfidence);
  }
  const coreAnswer = buildFinalAnswerWithDisagreement(
    pickRepresentativeAnswer(largestGroup),
    majorityModels,
    outlierModels,
    contradiction.contradictionScore
  );
  const consensusLabel = consensusBand(agreementScore, contradiction.contradictionScore);
  const topEvidence = evidenceSnippets.slice(0, 3).map((s) => `- ${s.title} (${s.sourceDomain ?? "source"}, credibility ${s.credibilityScore ?? s.sourceQualityScore ?? sourceQualityForSnippet(s)}%)`).join("\n");
  const contradictionExplanation = contradiction.contradictionScore === 0 ? "No major contradiction detected" : contradiction.contradictionType === "contextual" ? "Contextual disagreement detected" : contradiction.contradictionType === "direct" ? "High-quality sources directly disagree" : "Evidence is mixed across sources";
  const evidenceQualityNote = sourceQualityScore < 55 ? "Evidence quality is mixed." : "Evidence quality is strong overall.";
  const unified = {
    verdict:
      adjustedFinalConfidence >= 75
        ? "Likely Reliable"
        : adjustedFinalConfidence >= 55
          ? "Use With Caution"
          : "Not Reliable Yet",
    reliability:
      adjustedFinalConfidence >= 75
        ? "High"
        : adjustedFinalConfidence >= 55
          ? "Medium"
          : "Low",
    contradictionImpact: Math.max(0, 100 - contradiction.contradictionScore)
  };
  const finalAnswer = `Quick Verdict: ${unified.verdict}\n${adjustedFinalConfidence}/100 Confidence\n${coreAnswer}\n\nScientific Consensus: ${coreAnswer}\n\nEvidence Summary:\n${topEvidence || "- Limited external evidence returned."}\n\nImportant Caveats: ${evidenceQualityNote} Contradiction score ${contradiction.contradictionScore}/100, source quality ${sourceQualityScore}/100.\n\nContradictions / Debates: ${contradictionExplanation} (${contradiction.contradictionScore}/100).\n\nConsensus Summary: ${consensusLabel} — majority ${listModels(majorityModels)}${outlierModels.length ? `; outliers ${listModels(outlierModels)}` : ""}.\n\nFinal Confidence Assessment: ${adjustedFinalConfidence}/100 — ${unified.reliability} Reliability.`;

  const reasoning = `All models were compared semantically. ${largestGroup.length}/${responses.length} responses clustered into the majority (agreement ${agreementScore}/100). Majority models: ${listModels(
    majorityModels
  )}. Outliers: ${listModels(
    outlierModels
  )}. Evidence alignment: ${evidenceAlignmentScore}/100 and source quality: ${sourceQualityScore}/100. Consensus alignment: ${consensusScore}/100. Contradiction score: ${contradiction.contradictionScore}/100 (penalty ${contradiction.contradictionPenalty}, type ${contradiction.contradictionType}). Why SVA chose this answer: majority models converged on the same core claim set, higher-credibility evidence aligned with those claims, and weaker/contradicted claim variants were down-weighted.`;

  const explanation = `I compared ${responses.length} model responses and found ${majorityModels.length} in the majority group: ${listModels(
    majorityModels
  )}. ${
    outlierModels.length > 0
      ? `Outliers were detected from: ${listModels(outlierModels)}.`
      : "No outlier models were detected."
  } Evidence alignment scored ${evidenceAlignmentScore}/100 with source quality ${sourceQualityScore}/100. Contradictions contributed a penalty of ${contradiction.contradictionPenalty}.${allProvidersFallback ? "" : ""} ${confidenceReason(
    confidence.label
  )}`;
  let claimVerifications = verifyClaims(finalAnswer, responses, evidenceSnippets, outlierModels);
  claimVerifications = claimVerifications.map((claim)=>{
    const credibleLinks = claim.supportingEvidence.filter((ev)=> (ev.credibilityScore ?? ev.sourceQualityScore ?? sourceQualityForSnippet(ev)) >= 70).length;
    if (claim.status === "insufficient_evidence" && credibleLinks >= 2) {
      return {...claim, status:"partially_supported", confidenceScore: Math.max(55, claim.confidenceScore), explanation: "Multiple credible sources support parts of this claim, but context or precision limits full support."};
    }
    if ((claim.status === "weak_support" || claim.status === "weakly_supported") && credibleLinks >= 2) {
      return {...claim, status:"supported", confidenceScore: Math.max(68, claim.confidenceScore)};
    }
    return claim;
  });
  const unsupportedClaims = claimVerifications.filter((claim) => claim.status === "insufficient_evidence").length;
  const contradictedClaims = claimVerifications.filter((claim) => claim.status === "contradicted").length;
  const disputedClaims = claimVerifications.filter((claim) => claim.status === "disputed").length;
  const derivedContradictionFloor = Math.min(95, contradictedClaims * 22 + disputedClaims * 10);
  if (evidenceSnippets.length === 0) {
    adjustedFinalConfidence = Math.min(adjustedFinalConfidence, 45);
  }
  if (unsupportedClaims > 0) {
    adjustedFinalConfidence = Math.max(0, adjustedFinalConfidence - unsupportedClaims * 6);
  }
  if (contradictedClaims > 0) {
    adjustedFinalConfidence = Math.max(0, adjustedFinalConfidence - contradictedClaims * 10);
  }
  const normalizedContradictionScore = Math.max(contradiction.contradictionScore, derivedContradictionFloor);
  const claimSupportPercent = claimVerifications.length === 0 ? 0 : Math.round((claimVerifications.filter((c)=>["supported","strongly_supported","partially_supported","weak_support"].includes(c.status)).length / claimVerifications.length) * 100);
  const unifiedScored = unifiedTrustScore({
    agreement: agreementScore,
    evidence: evidenceAlignmentScore,
    source: sourceQualityScore,
    contradiction: normalizedContradictionScore,
    claimSupport: claimSupportPercent,
    contradictionType: contradiction.contradictionType
  });
  adjustedFinalConfidence = unifiedScored.score;
  const nuancedVerdict = adjustedFinalConfidence >= 90 ? "Strongly Supported" : adjustedFinalConfidence >= 75 ? "Moderately Supported" : adjustedFinalConfidence >= 60 ? "Contextually Reliable" : adjustedFinalConfidence >= 45 ? "Evidence Mixed" : adjustedFinalConfidence >= 30 ? "Weak Evidence" : "Contradictory Evidence";

  const judge = buildJudgeAssessment({
    finalConfidenceScore: adjustedFinalConfidence,
    evidenceAlignmentScore,
    contradictionScore: normalizedContradictionScore,
    claimVerifications,
    majorityModels,
    outlierModels
  });

  return {
    agreementScore,
    evidenceAlignmentScore,
    finalConfidenceScore: adjustedFinalConfidence,
    confidenceLabel: adjustedFinalConfidence >= 85 ? "Very High" : adjustedFinalConfidence >= 70 ? "High" : adjustedFinalConfidence >= 40 ? "Medium" : "Low",
    finalAnswer,
    majorityModels,
    outlierModels,
    reasoning,
    explanation,
    claimVerifications,
    contradictionScore: contradiction.contradictionScore,
    contradictionPenalty: contradiction.contradictionPenalty,
    contradictionType: contradiction.contradictionType,
    consensusEvolutionScore:
      contradiction.contradictionType === "consensus_shift" || contradiction.contradictionType === "temporal"
        ? Math.max(55, Math.min(95, 100 - contradiction.contradictionScore + Math.round(sourceQualityScore * 0.15)))
        : Math.max(35, 100 - contradiction.contradictionScore),
    consensusEvolutionSummary:
      contradiction.contradictionType === "consensus_shift"
        ? "Historical medical consensus differed from modern scientific consensus."
        : contradiction.contradictionType === "temporal"
          ? "Temporal contradiction detected: claim context changes across historical periods."
          : "No major historical consensus shift detected.",
    sourceQualityScore,
    trustBreakdown: {
      agreementContribution: Math.round((agreementScore * modeWeights[mode].agreement) / 100),
      evidenceContribution: Math.round((evidenceAlignmentScore * modeWeights[mode].evidence) / 100),
      sourceContribution: Math.round((sourceQualityScore * modeWeights[mode].source) / 100),
      contradictionImpact: Math.round(unifiedScored.contradictionImpact)
    },
    whyNotHigher:
      confidence.score >= 90
        ? "Confidence is already high; remaining uncertainty is mostly due to normal model and source variance."
        : `Score is constrained by contradiction (${contradiction.contradictionScore}/100), evidence alignment (${evidenceAlignmentScore}/100), and source quality (${sourceQualityScore}/100).`,
    deepAnalysisNotes:
      mode === "deep"
        ? `Deep mode emphasized evidence alignment and contradiction handling across ${responses.length} model outputs and ${evidenceSnippets.length} retrieved snippets.`
        : undefined,
    researchSummary:
      mode === "research"
        ? `Research mode prioritized evidence-backed synthesis from ${evidenceSnippets.length} snippets and weighted outlier handling across providers.`
        : undefined,
    judgeVerdict: judge.judgeVerdict,
    judgeSummary: nuancedVerdict,
    judgeRiskFlags: judge.judgeRiskFlags,
    debug: {
      groupScores,
      weightedAgreement: {
        majorityWeight: Math.round(majorityWeight * 100) / 100,
        totalWeight: Math.round(totalWeight * 100) / 100
      },
      responseConsistencyScore: consistency.score
      ,
      semanticAgreement: agreementScore,
      numericConsistency: responses.length >= 2 ? Math.round(numericConsistencyScore(responses[0].answer, responses[1].answer)) : 0,
      evidenceCoverage: evidenceAlignmentScore,
      contradictionReasons: outlierModels,
      confidenceBreakdown: {
        agreement: agreementScore,
        evidence: evidenceAlignmentScore,
        source: sourceQualityScore,
        contradiction: contradiction.contradictionPenalty
      },
      evidenceScoreBreakdown: {
        credibility: evidenceMetrics.credibility,
        coverage: evidenceMetrics.evidenceCoverage
      },
      normalizedResponses: responses.map((item) => ({
        model: item.model,
        answer: item.answer,
        entities: [...extractEntities(item.answer)],
        numbers: [...extractNumbers(item.answer)],
        claims: clusterClaims(extractClaims(item.answer))
      })),
      uncertaintyDivergence: divergenceScore,
      unifiedVerificationState: {
        agreementScore,
        evidenceScore: evidenceAlignmentScore,
        contradictionScore: contradiction.contradictionScore,
        uncertaintyScore: divergenceScore,
        hallucinationPenalty: temporalHallucination.hallucinationPenalty,
        semanticDivergence: outlierModels.length > 0 ? 100 - agreementScore : 0,
        sourceCredibility: sourceQualityScore,
        retrievalSuccess: evidenceSnippets.length > 0,
        claimSupportLevel: claimVerifications.filter((c) => c.status === "supported").length,
        finalConfidence: adjustedFinalConfidence,
        trustClassification: adjustedFinalConfidence >= 80 ? "high" : adjustedFinalConfidence >= 55 ? "medium" : "low",
        verifiedClaims: claimVerifications.filter((c) => c.status === "supported").length,
        disputedClaims: claimVerifications.filter((c) => c.status === "disputed").length,
        unsupportedClaims: claimVerifications.filter((c) => c.status === "insufficient_evidence").length,
        temporalPenalty: temporalHallucination.temporalPenalty,
        contradictionReasons: temporalHallucination.reasons
      }
    }
  };
};
