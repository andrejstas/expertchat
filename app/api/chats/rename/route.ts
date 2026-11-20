import { renameChat } from "@/lib/chats";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const expertId = req.nextUrl.searchParams.get("expertId");
  const id = req.nextUrl.searchParams.get("id");
  if (!expertId || !id) return NextResponse.json({ error: "expertId and id required" }, { status: 400 });
  const body = (await req.json()) as { title: string };
  if (typeof body.title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  await renameChat(expertId, id, body.title);
  return NextResponse.json({ ok: true });
}
