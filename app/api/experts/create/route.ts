import { createExpert } from "@/lib/experts";
import { isValidExpertId } from "@/lib/expertId";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    id?: string;
    name?: string;
    description?: string;
    systemPrompt?: string;
    withMemory?: boolean;
  };
  const name = body.name?.trim();
  const description = body.description?.trim();
  const systemPrompt = body.systemPrompt?.trim();
  if (!name || !description || !systemPrompt) {
    return NextResponse.json({ error: "name, description and systemPrompt required" }, { status: 400 });
  }
  if (!isValidExpertId(body.id)) {
    return NextResponse.json({ error: "id must be kebab-case (a-z, 0-9, -)" }, { status: 400 });
  }
  try {
    await createExpert({ id: body.id, name, description, systemPrompt, withMemory: body.withMemory !== false });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return NextResponse.json({ error: `expert "${body.id}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ id: body.id });
}
