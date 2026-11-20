import { runClaudeJson } from "@/lib/claude-cli";
import { listExperts } from "@/lib/experts";
import { getSettings } from "@/lib/settings";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { message } = (await req.json()) as { message: string };
  const experts = await listExperts();

  if (experts.length === 0) return NextResponse.json({ expertId: null });
  if (experts.length === 1) return NextResponse.json({ expertId: experts[0].id });

  const description = experts
    .map((e) => `- ${e.id}: ${e.name} — ${e.description}`)
    .join("\n");

  const systemPrompt =
    "You are a router. Pick the single most relevant expert for the user's message. Respond with ONLY the expert id, nothing else.";
  const prompt = `Available experts:\n${description}\n\nUser message:\n"""${message}"""\n\nRespond with only the expert id.`;

  let text: string;
  try {
    const { routerModel } = await getSettings();
    text = await runClaudeJson({ prompt, systemPrompt, model: routerModel });
  } catch (e) {
    console.error("Router failed:", e);
    return NextResponse.json({ expertId: experts[0].id });
  }

  const matched = experts.find((e) => text.includes(e.id));
  return NextResponse.json({ expertId: matched?.id ?? experts[0].id });
}
