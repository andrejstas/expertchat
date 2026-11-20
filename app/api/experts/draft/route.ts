import { runClaudeJson } from "@/lib/claude-cli";
import { getSettings } from "@/lib/settings";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { EXPERTS_DIR } from "@/lib/dataDir";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GUIDE = path.join(process.cwd(), "docs", "creating-experts.md");

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { name?: string; language?: string; brief?: string };
  const name = body.name?.trim();
  const brief = body.brief?.trim();
  const language = body.language?.trim() || "English";
  if (!name || !brief) {
    return NextResponse.json({ error: "name and brief required" }, { status: 400 });
  }

  // A same-language existing expert is the best style reference for tone and section headings.
  const exampleId = language.toLowerCase() === "slovak" ? "fire-advisor" : "ai-mentor";
  const [guide, example] = await Promise.all([
    fs.readFile(GUIDE, "utf-8"),
    fs.readFile(path.join(EXPERTS_DIR, `${exampleId}.md`), "utf-8").catch(() => ""),
  ]);

  const systemPrompt = `You write expert definitions for a personal chat app. Follow this guide exactly:

<guide>
${guide}
</guide>

${example ? `Example of an existing expert (match its level of concreteness, not its domain):\n\n<example>\n${example}\n</example>\n\n` : ""}Output format — exactly this, nothing before or after:

DESCRIPTION: <one sentence for the sidebar and auto-router, ending with "Speaks ${language}.">
===PROMPT===
<the system prompt body: the 7 sections from the guide, as markdown "## " headings, written in ${language}>

Do not include frontmatter, memory writing rules, Mermaid or calendar instructions — the app injects those.`;

  const prompt = `Expert name: ${name}\nLanguage: ${language}\n\nWhat the user wants from this expert:\n"""${brief}"""`;

  let text: string;
  try {
    const { expertModel } = await getSettings();
    text = await runClaudeJson({ prompt, systemPrompt, model: expertModel });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const m = /DESCRIPTION:\s*(.+?)\s*\n\s*===PROMPT===\s*\n([\s\S]+)$/.exec(text.trim());
  if (!m) {
    return NextResponse.json({ error: "Claude returned an unexpected format", raw: text }, { status: 502 });
  }
  return NextResponse.json({ description: m[1].trim(), systemPrompt: m[2].trim() });
}
