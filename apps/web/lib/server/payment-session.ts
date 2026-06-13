import { getAuthenticatedUser, SESSION_EMAIL_HEADER } from "./auth";
import type { PublicUser } from "./store";
import { getEffectivePlanForEmail } from "../founder-access";

const normalizeEmail = (email: string | null | undefined): string => email?.trim().toLowerCase() ?? "";

export const getPaymentSessionUser = async (request: Request): Promise<PublicUser | null> => {
  const user = await getAuthenticatedUser(request);
  if (user) return user;

  const sessionEmail = normalizeEmail(request.headers.get(SESSION_EMAIL_HEADER));
  if (!sessionEmail) return null;
  const plan = getEffectivePlanForEmail(sessionEmail, "free");
  const dailyLimit = plan === "ultra" ? 150 : 10;

  return {
    userId: `local:${sessionEmail}`,
    email: sessionEmail,
    plan,
    usageCount: 0,
    createdAt: new Date().toISOString(),
    usedToday: 0,
    dailyLimit,
    onboardingCompleted: false,
    creditsRemaining: dailyLimit,
    creditsResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    monthlyUsage: 0,
    dailyUsage: 0
  };
};
