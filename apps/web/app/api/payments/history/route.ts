import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { listPaymentsForUser } from "../../../lib/server/payments";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first." }, { status: 401 });
  }

  const payments = await listPaymentsForUser(user.email);
  return NextResponse.json({ ok: true, payments });
}
