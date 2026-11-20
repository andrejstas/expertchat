import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";

export const dynamic = "force-dynamic";

const MIMES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

export async function GET(req: NextRequest) {
  const rel = req.nextUrl.searchParams.get("path");
  if (!rel) return new Response("path required", { status: 400 });

  const root = process.cwd();
  const abs = path.resolve(root, rel);
  // Restrict to chats/<expert>/<chatId>.attachments/ — refuse anything else.
  if (!abs.startsWith(path.join(root, "chats") + path.sep) || !abs.includes(".attachments")) {
    return new Response("forbidden", { status: 403 });
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(abs);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const ext = abs.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIMES[ext] ?? "application/octet-stream";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
