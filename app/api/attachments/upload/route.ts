import { saveAttachment, resolveCanonicalMime, MAX_BYTES } from "@/lib/attachments";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const expertId = req.nextUrl.searchParams.get("expertId");
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!expertId || !chatId) {
    return NextResponse.json({ error: "expertId and chatId required" }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no 'file' field" }, { status: 400 });
  }

  const canonicalMime = resolveCanonicalMime(file.type, file.name || "");
  if (!canonicalMime) {
    return NextResponse.json(
      { error: `unsupported type: ${file.type || "unknown"} (${file.name})` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (${file.size} bytes, max ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const meta = await saveAttachment(expertId, chatId, buf, canonicalMime, file.name || "untitled");
    return NextResponse.json(meta);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
