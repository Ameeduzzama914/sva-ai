import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, message: "Direct plan upgrades are disabled. Use Razorpay checkout." },
    { status: 410 }
  );
}
