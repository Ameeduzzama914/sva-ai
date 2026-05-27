import { NextResponse } from "next/server";
import { getAdminEmail, isAdminEmail } from "../admin";
import { getAuthenticatedUser } from "./auth";

/** Mirrors the browser session email sent from admin dashboard fetches (see lib/admin-api.ts). */
const ADMIN_SESSION_EMAIL_HEADER = "x-sva-admin-email";

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

/**
 * Same authorization as /admin: isAdminEmail(session.email).
 * Server cookie session is accepted when present; otherwise the browser
 * localStorage session email is validated via ADMIN_SESSION_EMAIL_HEADER.
 */
export const requireAdminSession = async (
  request?: Request
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

  const browserSessionEmail = request?.headers.get(ADMIN_SESSION_EMAIL_HEADER);
  if (browserSessionEmail && isAdminEmail(browserSessionEmail)) {
    return {
      ok: true,
      userId: `admin-browser:${browserSessionEmail.trim().toLowerCase()}`,
      email: browserSessionEmail.trim()
    };
  }

  if (!sessionUser && !browserSessionEmail) {
    return {
      ok: false,
      response: unauthorized(
        "no_session: log in on /admin with the founder account (browser session or server cookie)"
      )
    };
  }

  if (browserSessionEmail && !isAdminEmail(browserSessionEmail)) {
    return {
      ok: false,
      response: unauthorized("browser_session_email is not the configured admin")
    };
  }

  if (sessionUser) {
    return {
      ok: false,
      response: unauthorized(`server_session_email (${sessionUser.email}) is not the configured admin`)
    };
  }

  return { ok: false, response: unauthorized("not_admin") };
};
