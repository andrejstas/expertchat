import { getStats, setCaps, applySync } from "@/lib/usage";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getStats();
  return NextResponse.json(stats);
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    weeklyCapTokens?: number;
    fiveHourCapTokens?: number;
    syncWeeklyPct?: number;
    syncFiveHourPct?: number;
  };

  // Update caps if provided
  if (typeof body.weeklyCapTokens === "number" || typeof body.fiveHourCapTokens === "number") {
    await setCaps(body.weeklyCapTokens, body.fiveHourCapTokens);
  }

  // Calibrate from claude.ai dashboard if both percentages provided
  if (
    typeof body.syncWeeklyPct === "number" &&
    typeof body.syncFiveHourPct === "number"
  ) {
    await applySync(body.syncWeeklyPct, body.syncFiveHourPct);
  }

  return NextResponse.json({ ok: true });
}
