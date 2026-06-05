import type { UserPlan } from "./store";

export const PLAN_DAILY_VERIFICATION_LIMIT: Record<UserPlan, number> = {
  free: 10,
  pro: 50,
  ultra: 150
};

export const getPlanDailyVerificationLimit = (plan: UserPlan): number => PLAN_DAILY_VERIFICATION_LIMIT[plan];
