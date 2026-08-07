import { getAuthenticatedUser } from "./auth";
import type { PublicUser } from "./store";

export const getPaymentSessionUser = async (request: Request): Promise<PublicUser | null> => {
  return getAuthenticatedUser(request);
};
