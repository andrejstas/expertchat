import { loadExpert, isPathInsideMemoryDir } from "@/lib/experts";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expertId = req.nextUrl.searchParams.get("expertId");
  const relativePath = req.nextUrl.searchParams.get("path");
  if (!expertId || !relativePath) {
    return NextResponse.json({ error: "expertId and path required" }, { status: 400 });
  }

  const expert = await loadExpert(expertId);
  if (!expert.memoryDir) {
    return NextResponse.json({ error: "expert has no memory" }, { status: 404 });
  }

  const abs = path.resolve(expert.memoryDir, relativePath);
  if (!isPathInsideMemoryDir(expert.memoryDir, abs)) {
    return NextResponse.json({ error: "path not allowed" }, { status: 403 });
  }

  try {
    const content = await fs.readFile(abs, "utf-8");
    return NextResponse.json({ relativePath, content });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }
}

export async function PUT(req: NextRequest) {
  const expertId = req.nextUrl.searchParams.get("expertId");
  const relativePath = req.nextUrl.searchParams.get("path");
  if (!expertId || !relativePath) {
    return NextResponse.json({ error: "expertId and path required" }, { status: 400 });
  }
  const body = (await req.json()) as { content?: string };
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content (string) required" }, { status: 400 });
  }

  const expert = await loadExpert(expertId);
  if (!expert.memoryDir) {
    return NextResponse.json({ error: "expert has no memory" }, { status: 404 });
  }

  const abs = path.resolve(expert.memoryDir, relativePath);
  if (!isPathInsideMemoryDir(expert.memoryDir, abs)) {
    return NextResponse.json({ error: "path not allowed" }, { status: 403 });
  }

  // Block writes to readonly/ and archived/ categories — that's the contract.
  const norm = relativePath.replace(/\\/g, "/");
  if (norm.startsWith("readonly/") || norm.startsWith("archived/")) {
    return NextResponse.json({ error: `${norm.split("/")[0]}/ files cannot be edited from UI` }, { status: 403 });
  }

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body.content, "utf-8");
  return NextResponse.json({ ok: true });
}
