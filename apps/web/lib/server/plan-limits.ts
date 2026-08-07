import type { UserPlan } from "./store";
import { getSvaPlan, SVA_PLANS } from "../plans";

export const PLAN_DAILY_VERIFICATION_LIMIT: Record<UserPlan, number> = {
  free: SVA_PLANS.free.dailyVerificationLimit,
  pro: SVA_PLANS.pro.dailyVerificationLimit,
  ultra: SVA_PLANS.ultra.dailyVerificationLimit
};

export const PLAN_MONTHLY_VERIFICATION_LIMIT: Record<UserPlan, number> = {
  free: SVA_PLANS.free.monthlyVerificationLimit,
  pro: SVA_PLANS.pro.monthlyVerificationLimit,
  ultra: SVA_PLANS.ultra.monthlyVerificationLimit
};

export const getPlanDailyVerificationLimit = (plan: UserPlan): number => getSvaPlan(plan).dailyVerificationLimit;
export const getPlanMonthlyVerificationLimit = (plan: UserPlan): number => getSvaPlan(plan).monthlyVerificationLimit;
