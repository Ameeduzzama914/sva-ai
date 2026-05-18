export type ModelName = "Fast AI" | "Balanced AI" | "Research AI";

export type ModelAnswerSource = "openrouter" | "fallback_generated";

export type ModelFallbackState = "none" | "provider_unavailable" | "provider_error";

export interface ModelResponse { model: ModelName; answer: string; }
export interface PerModelSource { model: ModelName; source: ModelAnswerSource; fallbackState: ModelFallbackState; providerModelId?: string; errorMessage?: string; statusCode?: number; }
export type SourceClassification = "government" | "educational" | "scientific" | "news" | "encyclopedia" | "blog" | "forum" | "unknown";
export type SourceCategory =
  | "Official Source"
  | "Academic"
  | "Scientific Journal"
  | "Government"
  | "Major News"
  | "Educational"
  | "Encyclopedia"
  | "Forum"
  | "Social Media"
  | "Blog"
  | "Unknown";
export type TrustTier = "Very High Trust" | "High Trust" | "Medium Trust" | "Low Trust" | "Very Low Trust";
export interface RetrievedSource { title: string; url: string; snippet: string; domain: string; position: number; }
export interface RetrievalResponse { sources: RetrievedSource[]; mode: "web" | "none"; error?: string; }
export interface EvidenceSnippet { title: string; text: string; sourceType: "web_search"; sourceId?: string; source?: string; url?: string; sourceDomain?: string; sourceClassification?: SourceClassification; sourceCategory?: SourceCategory; domainTrustScore?: number; trustTier?: TrustTier; trustLabel?: "High Trust"|"Medium Trust"|"Low Trust"; relevanceScore: number; sourceQualityScore?: number; credibilityScore?: number; timestamp?: string; evidenceType?: "reference"|"news"|"documentation"|"general"; }
export type ClaimVerificationStatus = "strongly_supported"|"supported"|"partially_supported"|"disputed"|"contradicted"|"insufficient_evidence";
export interface ClaimVerification { id: string; claim: string; status: ClaimVerificationStatus; confidenceScore: number; claimConfidenceScore?: number; supportingEvidence: EvidenceSnippet[]; linkedEvidenceIds?: string[]; evidenceRelevanceScore?: number; evidenceCredibilityScore?: number; contradictedByModels: ModelName[]; explanation: string; }
export interface VerificationResult { agreementScore:number; evidenceAlignmentScore:number; finalConfidenceScore:number; confidenceLabel:"Very High"|"High"|"Medium"|"Low"; finalAnswer:string; majorityModels:ModelName[]; outlierModels:ModelName[]; reasoning:string; explanation:string; claimVerifications:ClaimVerification[]; contradictionScore?:number; contradictionPenalty?:number; contradictionType?:"direct"|"temporal"|"consensus_shift"|"contextual"; consensusEvolutionScore?:number; consensusEvolutionSummary?:string; sourceQualityScore?:number; judgeVerdict?:"approved"|"caution"|"rejected"; judgeSummary?:string; judgeRiskFlags?:string[]; deepAnalysisNotes?:string; researchSummary?:string; trustBreakdown?:{agreementContribution:number;evidenceContribution:number;sourceContribution:number;contradictionImpact:number;}; whyNotHigher?:string; debug?:{groupScores?:Array<{model:ModelName;bestGroupScore:number;assignedGroupIndex:number}>;weightedAgreement?:{majorityWeight:number;totalWeight:number};modelSupportScore?:number;responseConsistencyScore?:number;semanticAgreement?:number;numericConsistency?:number;evidenceCoverage?:number;contradictionReasons?:ModelName[];confidenceBreakdown?:{agreement:number;evidence:number;source:number;contradiction:number};evidenceScoreBreakdown?:{credibility:number;coverage:number};normalizedResponses?:Array<{model:ModelName;answer:string;entities:string[];numbers:string[];claims:string[]}>;uncertaintyDivergence?:number;unifiedVerificationState?:{agreementScore:number;evidenceScore:number;contradictionScore:number;uncertaintyScore:number;hallucinationPenalty:number;semanticDivergence:number;sourceCredibility:number;retrievalSuccess:boolean;claimSupportLevel:number;finalConfidence:number;trustClassification:"high"|"medium"|"low";verifiedClaims:number;disputedClaims:number;unsupportedClaims:number;temporalPenalty:number;contradictionReasons:string[]};}; }
export interface VerificationExecutionMeta { mode?: "openrouter"; modeUsed?:"fast"|"deep"|"research"; gptSource?:ModelAnswerSource; geminiSource?:ModelAnswerSource; deepseekSource?:ModelAnswerSource; modelASource?:ModelAnswerSource; modelBSource?:ModelAnswerSource; modelCSource?:ModelAnswerSource; providerMessage?:string; retrievalModeUsed?:"web"|"none"; retrievalSourceCount?:number; responseQualityFlag?:"normal"|"low_response_count"; }
export interface RuntimeProviderStatus { configured:boolean; liveSuccess:boolean; source:ModelAnswerSource; fallbackState:ModelFallbackState; status?:"pending"|"success"|"failed"|"timeout"|"fallback"; errorMessage?:string; statusCode?:number; providerModelId?:string; latencyMs?:number; rawResponse?:string; }
export interface VerificationUsageSummary { plan:"free"|"pro"|"plus"; usedToday:number; dailyLimit:number; creditsRemaining:number; }
export interface VerifyApiSuccess { ok:true; verification:VerificationResult; responses:ModelResponse[]; modelSources:PerModelSource[]; evidenceSnippets:EvidenceSnippet[]; meta:VerificationExecutionMeta; providerRuntimeStatus:Record<ModelName,RuntimeProviderStatus>; warnings?:string[]; usage?:VerificationUsageSummary; }
export interface VerifyApiError { ok:false; message:string; }
export type VerificationMode = "fast"|"deep"|"research";
export type VerifyApiResponse = VerifyApiSuccess | VerifyApiError;
export const STARTER_PROMPT = "What is the tallest mountain in the world above sea level?";

export type FuturePlanModelName = "GPT" | "Gemini" | "DeepSeek" | "Claude" | "Perplexity";
