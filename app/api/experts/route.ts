import { listExperts } from "@/lib/experts";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const experts = await listExperts();
    return NextResponse.json(
      experts.map(({ id, name, description, model, modelOverride }) => ({ id, name, description, model, modelOverride })),
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
