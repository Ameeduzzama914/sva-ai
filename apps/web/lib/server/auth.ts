import { cookies } from "next/headers";
import { getUserById, toPublicUser, type PublicUser } from "./store";

export const AUTH_COOKIE = "sva_user_id";

export const getAuthenticatedUser = async (): Promise<PublicUser | null> => {
  const cookieStore = await cookies();
  const userId = cookieStore.get(AUTH_COOKIE)?.value;
  if (!userId) {
    return null;
  }
  const user = await getUserById(userId);
  return user ? toPublicUser(user) : null;
};
