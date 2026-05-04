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

const POSITIVE_CUES = ["is", "are", "highest", "best", "top", "yes", "true", "accepted"];
const NEGATIVE_CUES = ["is not", "isn't", "are not", "no", "false", "never", "cannot", "can't"];
const AGREEMENT_THRESHOLD = 0.56;
const HIGH_TRUST_DOMAINS = ["wikipedia.org", "britannica.com", "nasa.gov", "who.int", "cdc.gov", ".gov", ".edu"];
const MEDIUM_TRUST_HINTS = ["news", "blog", "magazine", "opinion", "guide"];

const modeWeights: Record<VerificationMode, { agreement: number; evidence: number; source: number }> = {
  fast: { agreement: 35, evidence: 40, source: 25 },
  deep: { agreement: 30, evidence: 50, source: 20 },
  research: { agreement: 20, evidence: 60, source: 20 }
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

const tokenize = (text: string): string[] =>
  normalize(text)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

const extractEntities = (text: string): Set<string> => {
  const tokens = tokenize(text).filter((token) => token.length >= 4);
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

const contradictionPenalty = (a: string, b: string): number => {
  const aPositive = phraseSignal(a, POSITIVE_CUES);
  const aNegative = phraseSignal(a, NEGATIVE_CUES);
  const bPositive = phraseSignal(b, POSITIVE_CUES);
  const bNegative = phraseSignal(b, NEGATIVE_CUES);

  const contradictory = (aPositive && bNegative) || (aNegative && bPositive);
  return contradictory ? -0.35 : 0;
};

const similarity = (a: string, b: string): number => {
  const lexical = jaccard(new Set(tokenize(a)), new Set(tokenize(b)));
  const entities = jaccard(extractEntities(a), extractEntities(b));
  const numbers = numericAgreement(extractNumbers(a), extractNumbers(b));
  const penalty = contradictionPenalty(a, b);

  const combined = lexical * 0.42 + entities * 0.35 + numbers * 0.23 + penalty;
  return Math.max(0, Math.min(1, combined));
};

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

  if (HIGH_TRUST_DOMAINS.some((item) => domain.includes(item) || text.includes(item.replace(".", "")))) {
    return 88;
  }

  if (MEDIUM_TRUST_HINTS.some((item) => domain.includes(item) || text.includes(item))) {
    return 56;
  }

  if (snippet.text.length < 50 || /click|buy now|sponsored|top 10|best ever/.test(text)) {
    return 32;
  }

  return 68;
};

const computeSourceQualityScore = (evidenceSnippets: EvidenceSnippet[]): number => {
  if (evidenceSnippets.length === 0) {
    return 0;
  }

  return Math.round(
    evidenceSnippets.reduce((sum, snippet) => sum + (snippet.sourceQualityScore ?? sourceQualityForSnippet(snippet)), 0) /
      evidenceSnippets.length
  );
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

const contradictionMetrics = (
  responses: ModelResponse[]
): { contradictionScore: number; contradictionPenalty: number } => {
  if (responses.length < 2) {
    return { contradictionScore: 0, contradictionPenalty: 0 };
  }

  let conflictSum = 0;
  let pairs = 0;

  for (let i = 0; i < responses.length; i += 1) {
    for (let j = i + 1; j < responses.length; j += 1) {
      const a = responses[i].answer;
      const b = responses[j].answer;
      const numberConflict = 1 - numericAgreement(extractNumbers(a), extractNumbers(b));
      const oppositeConflict = contradictionPenalty(a, b) < 0 ? 1 : 0;
      const semanticConflict = 1 - similarity(a, b);
      const conflict = Math.max(0, Math.min(1, numberConflict * 0.45 + oppositeConflict * 0.35 + semanticConflict * 0.2));
      conflictSum += conflict;
      pairs += 1;
    }
  }

  const contradictionScore = Math.round((conflictSum / pairs) * 100);
  const contradictionPenaltyScore = Math.round((contradictionScore / 100) * 28);
  return { contradictionScore, contradictionPenalty: contradictionPenaltyScore };
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
  let finalScore = Math.max(0, Math.min(100, rawScore - contradictionPenaltyAdjusted));

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
    finalScore = Math.min(finalScore, 55);
  }

  if (finalScore >= 78) {
    return { score: finalScore, label: "High" };
  }

  if (finalScore >= 62) {
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

const buildFinalAnswerWithDisagreement = (
  representative: string,
  majorityModels: ModelName[],
  outlierModels: ModelName[],
  contradictionScore: number
): string => {
  if (contradictionScore <= 45 || outlierModels.length === 0) {
    return representative;
  }

  return `Models disagree. Most responses (${listModels(
    majorityModels
  )}) support: "${representative}". However, outlier models (${listModels(
    outlierModels
  )}) indicate competing interpretations, so this answer should be treated with caution.`;
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
    ["contradicted", "insufficient_evidence", "unsupported", "uncertain"].includes(claim.status)
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
  if (input.finalConfidenceScore < 50 || input.contradictionScore > 60 || input.evidenceAlignmentScore < 30) {
    judgeVerdict = "rejected";
  } else if (riskFlags.length > 0 || input.finalConfidenceScore < 70) {
    judgeVerdict = "caution";
  }

  const judgeSummary =
    judgeVerdict === "approved"
      ? `The answer is reasonably well-supported by evidence and model agreement. Majority: ${listModels(input.majorityModels)}.`
      : judgeVerdict === "caution"
        ? `The answer is usable with caution. Majority: ${listModels(input.majorityModels)}; outliers: ${listModels(input.outlierModels)}.`
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

const verifyClaims = (
  finalAnswer: string,
  responses: ModelResponse[],
  evidenceSnippets: EvidenceSnippet[],
  outlierModels: ModelName[]
): ClaimVerification[] => {
  const claims = extractClaims(finalAnswer);

  return claims.map((claim, index) => {
    const scoredEvidence = evidenceSnippets
      .map((snippet) => {
        const textScore = similarity(claim, snippet.text);
        const titleScore = similarity(claim, snippet.title);
        const qualityWeight = (snippet.sourceQualityScore ?? sourceQualityForSnippet(snippet)) / 100;
        return {
          snippet,
          score: Math.max(textScore, titleScore) * (0.7 + qualityWeight * 0.3)
        };
      })
      .sort((a, b) => b.score - a.score);

    const evidenceScore = Math.round((scoredEvidence[0]?.score ?? 0) * 100);
    const modelSupportScore = Math.round(
      responses.reduce((sum, response) => sum + similarity(claim, response.answer), 0) / Math.max(1, responses.length) * 100
    );
    const finalClaimScore = Math.round(evidenceScore * 0.6 + modelSupportScore * 0.4);

    const contradictedByModels = responses
      .filter((response) => {
        const responseSimilarity = similarity(claim, response.answer);
        const contradiction = contradictionPenalty(claim, response.answer);
        const isOutlier = outlierModels.includes(response.model);
        return contradiction < 0 || (isOutlier && responseSimilarity < 0.2);
      })
      .map((response) => response.model);

    const status =
      finalClaimScore < 35 && contradictedByModels.length > 0 ? "contradicted" : claimStatusFromScore(finalClaimScore);

    const supportingEvidence = scoredEvidence
      .filter((entry) => entry.score >= 0.3)
      .slice(0, 2)
      .map((entry) => entry.snippet);

    const explanation = `Best evidence support is ${evidenceScore}/100 and cross-model support is ${modelSupportScore}/100. Final claim confidence is ${finalClaimScore}/100 (${status.replaceAll(
      "_",
      " "
    )})${contradictedByModels.length > 0 ? `, with contradiction signals from ${listModels(contradictedByModels)}.` : "."}`;

    return {
      id: `claim-${index + 1}`,
      claim,
      status,
      confidenceScore: finalClaimScore,
      claimConfidenceScore: finalClaimScore,
      supportingEvidence,
      contradictedByModels,
      explanation
    };
  });
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
  const retrievalResult = await retrievalProvider.retrieve(prompt, retrievalLimitByMode(mode));
  const evidenceSnippets = retrievalResult.snippets;
  const contextPrompt = buildContextPrompt(prompt, evidenceSnippets);

  const MODELS: { id: string; name: ModelName }[] = OPENROUTER_MODELS.map((slot) => ({
    id: process.env[slot.envKey] || slot.defaultModel,
    name: slot.slot
  }));

  const outputs = await Promise.all(MODELS.map((m) => callOpenRouter(m.id, contextPrompt)));
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
      return { model: m.name, answer: result.text };
    }

    return {
      model: m.name,
      answer: `No live response from ${m.name}. ${result && "message" in result ? result.message : "OpenRouter request failed."}`
    };
  });

  const modelSources: PerModelSource[] = MODELS.map((m, i) => {
    const result = outputs[i];
    const fallbackState = result && result.ok === true ? "none" : result?.reason === "not_configured" ? "provider_unavailable" : "provider_error";
    return {
      model: m.name,
      source: result && result.ok === true ? "openrouter" : "fallback_generated",
      fallbackState,
      providerModelId: result?.providerModelId ?? m.id,
      errorMessage: getOpenRouterErrorMessage(result),
      statusCode: getOpenRouterErrorStatus(result)
    };
  });

  const providerRuntimeStatus: Record<ModelName, RuntimeProviderStatus> = {
    GPT: {
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      liveSuccess: outputs[0]?.ok === true,
      source: "openrouter",
      fallbackState: outputs[0]?.ok === true ? "none" : outputs[0]?.reason === "not_configured" ? "provider_unavailable" : "provider_error",
      errorMessage: getOpenRouterErrorMessage(outputs[0]),
      statusCode: getOpenRouterErrorStatus(outputs[0]),
      providerModelId: outputs[0]?.providerModelId
    },
    Gemini: {
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      liveSuccess: outputs[1]?.ok === true,
      source: "openrouter",
      fallbackState: outputs[1]?.ok === true ? "none" : outputs[1]?.reason === "not_configured" ? "provider_unavailable" : "provider_error",
      errorMessage: getOpenRouterErrorMessage(outputs[1]),
      statusCode: getOpenRouterErrorStatus(outputs[1]),
      providerModelId: outputs[1]?.providerModelId
    },
    DeepSeek: {
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      liveSuccess: outputs[2]?.ok === true,
      source: "openrouter",
      fallbackState: outputs[2]?.ok === true ? "none" : outputs[2]?.reason === "not_configured" ? "provider_unavailable" : "provider_error",
      errorMessage: getOpenRouterErrorMessage(outputs[2]),
      statusCode: getOpenRouterErrorStatus(outputs[2]),
      providerModelId: outputs[2]?.providerModelId
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
      gptSource: "openrouter",
      geminiSource: "openrouter",
      deepseekSource: "openrouter",
      providerMessage: "OpenRouter responses returned for all 3 models.",
      retrievalModeUsed: retrievalResult.retrievalModeUsed,
      retrievalSourceCount: evidenceSnippets.length,
      retrievalFallbackToMock: false
    }
  };
};

export const verifyResponses = (
  responses: ModelResponse[],
  modelSources: PerModelSource[],
  evidenceSnippets: EvidenceSnippet[],
  mode: VerificationMode = "fast"
): VerificationResult => {
  const validResponses = responses.filter((response) => {
    const source = modelSources.find((item) => item.model === response.model);
    return source?.source === "openrouter";
  });

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
  const groups: ModelResponse[][] = [];
  const groupScores: Array<{ model: ModelName; bestGroupScore: number; assignedGroupIndex: number }> = [];

  responses.forEach((response) => {
    const scoredGroups = groups.map((group, index) => ({
      index,
      score: similarityToGroup(response.answer, group)
    }));

    scoredGroups.sort((a, b) => b.score - a.score);
    const bestMatch = scoredGroups[0];

    if (bestMatch && bestMatch.score >= AGREEMENT_THRESHOLD) {
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
  const majorityModels = largestGroup.map((member) => member.model);
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
  const agreementScore = totalWeight === 0 ? 0 : Math.round((majorityWeight / totalWeight) * 100);

  const outlierResponses = responses.filter((response) => outlierModels.includes(response.model));
  const sourceQualityScore = computeSourceQualityScore(evidenceSnippets);
  const evidenceAlignmentScore = computeEvidenceAlignment(largestGroup, outlierResponses, evidenceSnippets, sourceQualityScore);
  const contradiction = contradictionMetrics(responses);
  const consistency = responseConsistencyAdjustment(responses);
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
  const finalAnswer = buildFinalAnswerWithDisagreement(
    pickRepresentativeAnswer(largestGroup),
    majorityModels,
    outlierModels,
    contradiction.contradictionScore
  );

  const reasoning = `${largestGroup.length}/${responses.length} model responses clustered into the majority (weighted agreement ${agreementScore}/100). Majority models: ${listModels(
    majorityModels
  )}. Outliers: ${listModels(
    outlierModels
  )}. Evidence alignment: ${evidenceAlignmentScore}/100. Source quality: ${sourceQualityScore}/100. Contradiction score: ${contradiction.contradictionScore}/100 (penalty ${contradiction.contradictionPenalty}).`;

  const explanation = `I compared ${responses.length} model responses and found ${majorityModels.length} in the majority group: ${listModels(
    majorityModels
  )}. ${
    outlierModels.length > 0
      ? `Outliers were detected from: ${listModels(outlierModels)}.`
      : "No outlier models were detected."
  } Evidence alignment scored ${evidenceAlignmentScore}/100 with source quality ${sourceQualityScore}/100. Contradictions contributed a penalty of ${contradiction.contradictionPenalty}.${allProvidersFallback ? "" : ""} ${confidenceReason(
    confidence.label
  )}`;
  const claimVerifications = verifyClaims(finalAnswer, responses, evidenceSnippets, outlierModels);
  const judge = buildJudgeAssessment({
    finalConfidenceScore: confidence.score,
    evidenceAlignmentScore,
    contradictionScore: contradiction.contradictionScore,
    claimVerifications,
    majorityModels,
    outlierModels
  });

  return {
    agreementScore,
    evidenceAlignmentScore,
    finalConfidenceScore: confidence.score,
    confidenceLabel: confidence.label,
    finalAnswer,
    majorityModels,
    outlierModels,
    reasoning,
    explanation,
    claimVerifications,
    contradictionScore: contradiction.contradictionScore,
    contradictionPenalty: contradiction.contradictionPenalty,
    sourceQualityScore,
    trustBreakdown: {
      agreementContribution: Math.round((agreementScore * modeWeights[mode].agreement) / 100),
      evidenceContribution: Math.round((evidenceAlignmentScore * modeWeights[mode].evidence) / 100),
      sourceContribution: Math.round((sourceQualityScore * modeWeights[mode].source) / 100),
      contradictionImpact: contradiction.contradictionPenalty
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
    judgeSummary: judge.judgeSummary,
    judgeRiskFlags: judge.judgeRiskFlags,
    debug: {
      groupScores,
      weightedAgreement: {
        majorityWeight: Math.round(majorityWeight * 100) / 100,
        totalWeight: Math.round(totalWeight * 100) / 100
      },
      responseConsistencyScore: consistency.score
    }
  };
};
