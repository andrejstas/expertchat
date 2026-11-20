import { editMessageAt } from "@/lib/chats";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expertId = req.nextUrl.searchParams.get("expertId");
  const id = req.nextUrl.searchParams.get("id");
  if (!expertId || !id) {
    return NextResponse.json({ error: "expertId and id required" }, { status: 400 });
  }
  const body = (await req.json()) as { atIndex: number; newContent: string };
  if (typeof body.atIndex !== "number" || typeof body.newContent !== "string") {
    return NextResponse.json({ error: "atIndex (number) and newContent (string) required" }, { status: 400 });
  }
  await editMessageAt(expertId, id, body.atIndex, body.newContent);
  return NextResponse.json({ ok: true });
}
