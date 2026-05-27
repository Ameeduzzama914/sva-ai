import { NextResponse } from "next/server";
import { getProviderStatus } from "../../../lib/server/provider-status";
import { getAuthenticatedUser } from "../../../lib/server/auth";

export async function GET() {
  const user = await getAuthenticatedUser();
  const status = getProviderStatus(user?.plan ?? "free");
  return NextResponse.json({ ok: true, status }, { status: 200 });
}
