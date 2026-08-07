import { NextResponse } from "next/server";
import { getAdminEmail, isAdminEmail } from "../admin";
import { getAuthenticatedUser } from "./auth";

const unauthorized = (reason: string) => {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[admin-auth] 401 Unauthorized:", reason);
  }

  return NextResponse.json(
    {
      ok: false,
      message: "Unauthorized",
      ...(process.env.NODE_ENV !== "production" ? { reason } : {})
    },
    { status: 401 }
  );
};

export const requireAdminSession = async (
  _request?: Request
): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; response: NextResponse }
> => {
  if (!getAdminEmail()) {
    return { ok: false, response: unauthorized("ADMIN_EMAIL is not configured") };
  }

  const sessionUser = await getAuthenticatedUser();
  if (sessionUser && isAdminEmail(sessionUser.email)) {
    return { ok: true, userId: sessionUser.userId, email: sessionUser.email };
  }

  if (!sessionUser) {
    return { ok: false, response: unauthorized("no_server_session") };
  }

  return { ok: false, response: unauthorized(`server_session_email (${sessionUser.email}) is not the configured admin`) };
};
