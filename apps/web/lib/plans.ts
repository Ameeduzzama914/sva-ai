export type PlanId = "free" | "pro" | "ultra";

export type SvaPlanConfig = {
  id: PlanId;
  label: string;
  priceInr: number;
  razorpayAmountPaise: number;
  dailyVerificationLimit: number;
  monthlyVerificationLimit: number;
  promptTokenLimit: number;
  recentConversationLimit: number;
  comparisonOutputTokenLimit: number;
  synthesisOutputTokenLimit: number;
  concurrencyLimit: number;
  features: readonly string[];
};

export const SVA_PLANS: Record<PlanId, SvaPlanConfig> = {
  free: {
    id: "free",
    label: "Free",
    priceInr: 0,
    razorpayAmountPaise: 0,
    dailyVerificationLimit: 2,
    monthlyVerificationLimit: 30,
    promptTokenLimit: 1200,
    recentConversationLimit: 3,
    comparisonOutputTokenLimit: 160,
    synthesisOutputTokenLimit: 220,
    concurrencyLimit: 1,
    features: ["Verified Mode", "three-model comparison", "basic confidence and disagreement display"]
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceInr: 799,
    razorpayAmountPaise: 79900,
    dailyVerificationLimit: 8,
    monthlyVerificationLimit: 200,
    promptTokenLimit: 3000,
    recentConversationLimit: 6,
    comparisonOutputTokenLimit: 250,
    synthesisOutputTokenLimit: 400,
    concurrencyLimit: 1,
    features: ["Verified Mode", "three-model comparison", "final verified synthesis", "confidence and disagreement analysis", "saved history", "standard priority"]
  },
  ultra: {
    id: "ultra",
    label: "Ultra",
    priceInr: 1299,
    razorpayAmountPaise: 129900,
    dailyVerificationLimit: 15,
    monthlyVerificationLimit: 450,
    promptTokenLimit: 5000,
    recentConversationLimit: 10,
    comparisonOutputTokenLimit: 300,
    synthesisOutputTokenLimit: 550,
    concurrencyLimit: 2,
    features: ["Verified Mode", "three-model comparison", "final verified synthesis", "confidence and disagreement analysis", "saved history", "longer questions", "priority processing"]
  }
};

export const getSvaPlan = (plan: PlanId): SvaPlanConfig => SVA_PLANS[plan] ?? SVA_PLANS.free;

export const getVerificationAllowance = (plan: PlanId) => ({
  daily: getSvaPlan(plan).dailyVerificationLimit,
  monthly: getSvaPlan(plan).monthlyVerificationLimit
});

export const VERIFIED_MODE = "verified" as const;
