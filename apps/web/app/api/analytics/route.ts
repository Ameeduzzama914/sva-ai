import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { trackEvent } from "../../../lib/server/store";

type Body = {
  event?: "mode_selected";
  metadata?: Record<string, string | number | boolean | null>;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.event) {
    return NextResponse.json({ ok: false, message: "Missing event." }, { status: 400 });
  }
  const user = await getAuthenticatedUser();
  await trackEvent(body.event, user?.userId, body.metadata);
  return NextResponse.json({ ok: true });
}
