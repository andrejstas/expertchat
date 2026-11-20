import { appendMessage } from "@/lib/chats";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expertId = req.nextUrl.searchParams.get("expertId");
  const id = req.nextUrl.searchParams.get("id");
  if (!expertId || !id) return NextResponse.json({ error: "expertId and id required" }, { status: 400 });
  const body = (await req.json()) as {
    role: "user" | "assistant";
    content: string;
    attachments?: any[];
    changes?: any[];
  };
  if (!body.role || typeof body.content !== "string") {
    return NextResponse.json({ error: "role and content required" }, { status: 400 });
  }
  await appendMessage(expertId, id, {
    role: body.role,
    content: body.content,
    attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
    changes: body.role === "assistant" && Array.isArray(body.changes) ? body.changes : undefined,
  });
  return NextResponse.json({ ok: true });
}
