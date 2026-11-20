import { createChat } from "@/lib/chats";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expertId = req.nextUrl.searchParams.get("expertId");
  if (!expertId) return NextResponse.json({ error: "expertId required" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const meta = await createChat(expertId, body.title);
  return NextResponse.json(meta);
}
