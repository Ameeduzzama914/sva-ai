import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { clearUserHistory, getUserHistory } from "../../../lib/server/store";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first." }, { status: 401 });
  }

  const history = await getUserHistory(user.userId);
  return NextResponse.json({ ok: true, history });
}

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first." }, { status: 401 });
  }
  await clearUserHistory(user.userId);
  return NextResponse.json({ ok: true, history: [] });
}
