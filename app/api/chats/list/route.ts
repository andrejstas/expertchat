import { listChats } from "@/lib/chats";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expertId = req.nextUrl.searchParams.get("expertId");
  if (!expertId) return NextResponse.json({ error: "expertId required" }, { status: 400 });
  const chats = await listChats(expertId);
  return NextResponse.json({ chats });
}
