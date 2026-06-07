import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, message: "Use Razorpay checkout to upgrade. No plan change was made." },
    { status: 410 }
  );
}
