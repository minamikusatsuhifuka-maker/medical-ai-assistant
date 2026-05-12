import { NextResponse } from "next/server";
import { logUsage } from "../../lib/log-usage";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const result = await logUsage(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[/api/log-usage] error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
