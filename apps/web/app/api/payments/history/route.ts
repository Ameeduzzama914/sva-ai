import { NextResponse } from "next/server";
import { getPaymentSessionUser } from "../../../../lib/server/payment-session";
import { listPaymentsForUser } from "../../../../lib/server/payments";

export async function GET(request: Request) {
  const user = await getPaymentSessionUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first.", payments: [] }, { status: 401 });
  }

  try {
    const payments = await listPaymentsForUser(user.email);
    return NextResponse.json({ ok: true, payments });
  } catch (error) {
    console.error("[payments] history unavailable:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ok: true, payments: [] });
  }
}
