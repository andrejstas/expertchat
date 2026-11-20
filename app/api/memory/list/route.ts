import { loadExpert, loadMemoryInventory } from "@/lib/experts";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expertId = req.nextUrl.searchParams.get("expertId");
  if (!expertId) return NextResponse.json({ error: "expertId required" }, { status: 400 });

  const expert = await loadExpert(expertId);
  const inventory = await loadMemoryInventory(expert.memoryDir);

  return NextResponse.json({
    memoryDir: expert.memoryDir,
    files: inventory.map((f) => ({
      category: f.category,
      name: f.name,
      relativePath: f.relativePath,
      size: f.size,
      preview: f.preview,
    })),
  });
}
