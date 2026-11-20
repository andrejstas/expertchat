import { loadExpert } from "@/lib/experts";
import { isValidExpertId } from "@/lib/expertId";
import { expertIconSvg } from "@/lib/expertIcon";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidExpertId(id)) return new Response("not found", { status: 404 });
  let name: string;
  try {
    name = (await loadExpert(id)).name;
  } catch {
    return new Response("not found", { status: 404 });
  }
  return new Response(expertIconSvg(id, name), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
