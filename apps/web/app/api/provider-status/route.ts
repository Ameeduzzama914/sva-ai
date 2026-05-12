import { NextResponse } from "next/server";
import { getProviderStatus } from "../../../lib/server/provider-status";

export async function GET() {
  return NextResponse.json({ ok: true, status: getProviderStatus() }, { status: 200 });
}
