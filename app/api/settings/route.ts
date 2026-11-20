import { getSettings, updateSettings, type AppSettings } from "@/lib/settings";
import { isValidModelId } from "@/lib/models";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as Partial<AppSettings>;
  const patch: Partial<AppSettings> = {};
  for (const key of ["expertModel", "routerModel"] as const) {
    if (body[key] === undefined) continue;
    if (!isValidModelId(body[key])) {
      return NextResponse.json({ error: `invalid ${key}` }, { status: 400 });
    }
    patch[key] = body[key];
  }
  return NextResponse.json(await updateSettings(patch));
}
