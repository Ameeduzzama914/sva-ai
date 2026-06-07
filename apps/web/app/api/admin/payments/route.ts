import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../lib/server/admin-auth";
import { listRecentPayments } from "../../../../lib/server/payments";

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) return admin.response;

  const payments = await listRecentPayments();
  const successful = payments.filter((payment) => payment.status === "success");

  return NextResponse.json({
    ok: true,
    payments,
    summary: {
      totalPayments: payments.length,
      totalRevenue: successful.reduce((sum, payment) => sum + payment.amount, 0),
      proUpgrades: successful.filter((payment) => payment.plan === "pro").length,
      ultraUpgrades: successful.filter((payment) => payment.plan === "ultra").length,
      failedPayments: payments.filter((payment) => payment.status === "failed").length
    },
    emptyMessage: payments.length === 0 ? "No payment records found. Apply the payments migration to enable persistent billing history." : null
  });
}
