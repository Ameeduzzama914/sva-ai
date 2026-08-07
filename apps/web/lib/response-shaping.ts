import { getSvaPlan, type PlanId } from "./plans";

export type VerificationComplexity = "simple" | "normal" | "complex";

export type ResponseShape = {
  complexity: VerificationComplexity;
  comparisonMaxTokens: number;
  synthesisMaxTokens: number;
};

const HIGH_STAKES_OR_CURRENT = /\b(today|latest|current|breaking|news|medical|diagnosis|treatment|symptom|dose|legal|law|tax|financial|investment|stock|crypto|safety|risk|urgent)\b/i;
const TECHNICAL = /\b(code|typescript|javascript|python|api|database|sql|architecture|debug|error|stack trace|algorithm|security|compliance|integration|webhook)\b/i;
const MULTIPART = /(\?|\b(and|also|compare|contrast|explain why|step by step|pros and cons|tradeoffs?)\b)/gi;

const wordCount = (prompt: string): number => prompt.trim().split(/\s+/).filter(Boolean).length;

export const classifyVerificationComplexity = (prompt: string): VerificationComplexity => {
  const normalized = prompt.trim();
  const words = wordCount(normalized);
  const questionMarks = (normalized.match(/\?/g) ?? []).length;
  const multipartSignals = (normalized.match(MULTIPART) ?? []).length;

  if (HIGH_STAKES_OR_CURRENT.test(normalized) || TECHNICAL.test(normalized) || words > 90 || questionMarks > 1 || multipartSignals >= 3) {
    return "complex";
  }

  if (words <= 18 && questionMarks <= 1 && multipartSignals <= 1) {
    return "simple";
  }

  return "normal";
};

export const resolveResponseShape = (plan: PlanId, prompt: string): ResponseShape => {
  const planConfig = getSvaPlan(plan);
  const complexity = classifyVerificationComplexity(prompt);

  if (complexity === "simple") {
    return {
      complexity,
      comparisonMaxTokens: Math.min(100, planConfig.comparisonOutputTokenLimit),
      synthesisMaxTokens: Math.min(140, planConfig.synthesisOutputTokenLimit)
    };
  }

  if (complexity === "normal") {
    return {
      complexity,
      comparisonMaxTokens: Math.min(220, planConfig.comparisonOutputTokenLimit),
      synthesisMaxTokens: Math.min(350, planConfig.synthesisOutputTokenLimit)
    };
  }

  return {
    complexity,
    comparisonMaxTokens: planConfig.comparisonOutputTokenLimit,
    synthesisMaxTokens: planConfig.synthesisOutputTokenLimit
  };
};
