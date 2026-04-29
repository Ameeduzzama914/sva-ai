export type ModelName = "GPT" | "Claude" | "Gemini" | "DeepSeek" | "Perplexity";

export type ModelAnswerSource = "real_provider" | "fallback_generated";

export type ModelFallbackState = "none" | "provider_unavailable" | "provider_error";

export interface ModelResponse {
  model: ModelName;
  answer: string;
}

export interface PerModelSource {
  model: ModelName;
  source: ModelAnswerSource;
  fallbackState: ModelFallbackState;
}

export interface EvidenceSnippet {
  title: string;
  text: string;
  sourceType: "mock_web" | "web_search";
  sourceId?: string;
  url?: string;
  relevanceScore: number;
  sourceQualityScore?: number;
}

export type ClaimVerificationStatus =
  | "supported"
  | "partially_supported"
  | "contradicted"
  | "insufficient_evidence"
  | "unsupported"
  | "uncertain";

export interface ClaimVerification {
  id: string;
  claim: string;
  status: ClaimVerificationStatus;
  confidenceScore: number;
  claimConfidenceScore?: number;
  supportingEvidence: EvidenceSnippet[];
  contradictedByModels: ModelName[];
  explanation: string;
}

export interface VerificationResult {
  agreementScore: number;
  evidenceAlignmentScore: number;
  finalConfidenceScore: number;
  confidenceLabel: "High" | "Medium" | "Low";
  finalAnswer: string;
  majorityModels: ModelName[];
  outlierModels: ModelName[];
  reasoning: string;
  explanation: string;
  claimVerifications: ClaimVerification[];
  contradictionScore?: number;
  contradictionPenalty?: number;
  sourceQualityScore?: number;
  judgeVerdict?: "approved" | "caution" | "rejected";
  judgeSummary?: string;
  judgeRiskFlags?: string[];
  deepAnalysisNotes?: string;
  researchSummary?: string;
  trustBreakdown?: {
    agreementContribution: number;
    evidenceContribution: number;
    sourceContribution: number;
    contradictionImpact: number;
  };
  whyNotHigher?: string;
  debug?: {
    groupScores?: Array<{ model: ModelName; bestGroupScore: number; assignedGroupIndex: number }>;
    weightedAgreement?: { majorityWeight: number; totalWeight: number };
    modelSupportScore?: number;
    responseConsistencyScore?: number;
  };
}

export interface VerificationExecutionMeta {
  mode: "real_provider" | "fallback_only";
  modeUsed?: "fast" | "deep" | "research";
  gptSource: "openai" | "fallback";
  claudeSource: "claude" | "fallback";
  geminiSource: "gemini" | "fallback";
  deepseekSource: "deepseek" | "fallback";
  perplexitySource?: "perplexity" | "fallback";
  providerMessage: string;
  retrievalModeUsed: "mock" | "web";
  retrievalSourceCount: number;
  retrievalFallbackToMock: boolean;
  responseQualityFlag?: "normal" | "low_response_count";
}

export interface VerifyApiSuccess {
  ok: true;
  verification: VerificationResult;
  responses: ModelResponse[];
  modelSources: PerModelSource[];
  evidenceSnippets: EvidenceSnippet[];
  meta: VerificationExecutionMeta;
  warnings?: string[];
  usage?: {
    plan: "free" | "pro";
    usedToday: number;
    dailyLimit: number;
  };
}

export interface VerifyApiError {
  ok: false;
  message: string;
}

export type VerificationMode = "fast" | "deep" | "research";

export type VerifyApiResponse = VerifyApiSuccess | VerifyApiError;

export const STARTER_PROMPT = "What is the tallest mountain in the world above sea level?";
