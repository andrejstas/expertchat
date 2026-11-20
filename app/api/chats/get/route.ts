import { getChat } from "@/lib/chats";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expertId = req.nextUrl.searchParams.get("expertId");
  const id = req.nextUrl.searchParams.get("id");
  if (!expertId || !id) return NextResponse.json({ error: "expertId and id required" }, { status: 400 });
  const chat = await getChat(expertId, id);
  if (!chat) return NextResponse.json({ error: "chat not found" }, { status: 404 });
  return NextResponse.json(chat);
}
