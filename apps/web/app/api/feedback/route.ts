import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { trackEvent } from "../../../lib/server/store";

type Body = { feedback?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const user = await getAuthenticatedUser();
  await trackEvent("feedback_submitted", user?.userId, { feedback: body.feedback?.slice(0, 500) ?? "" });
  return NextResponse.json({ ok: true });
}
