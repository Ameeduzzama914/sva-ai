export type FounderAccessPlan = "free" | "pro" | "ultra";

export const FOUNDER_EMAIL = "mohammed.ameeduzzama@gmail.com";

export function isFounderEmail(email?: string | null) {
  return email?.trim().toLowerCase() === FOUNDER_EMAIL;
}

export const getEffectivePlanForEmail = (
  email: string | null | undefined,
  plan: FounderAccessPlan
): FounderAccessPlan => {
  // Founder-only internal access override. Do not extend to other users.
  return isFounderEmail(email) ? "ultra" : plan;
};
