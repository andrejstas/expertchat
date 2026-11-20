import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { getSettings } from "./settings";
import { isValidExpertId } from "./expertId";
import { EXPERTS_DIR, MEMORY_DIR } from "./dataDir";
import type { ExpertConfig, MemoryCategory, MemoryFile } from "./types";

const CATEGORIES: MemoryCategory[] = ["readonly", "editable", "journal", "archived"];

export async function listExperts(): Promise<ExpertConfig[]> {
  const entries = await fs.readdir(EXPERTS_DIR).catch(() => [] as string[]);
  const files = entries.filter((f) => f.endsWith(".md") && f !== "README.md");
  const experts = await Promise.all(files.map((f) => loadExpert(f.replace(/\.md$/, ""))));
  return experts;
}

export async function loadExpert(id: string): Promise<ExpertConfig> {
  const filePath = path.join(EXPERTS_DIR, `${id}.md`);
  const raw = await fs.readFile(filePath, "utf-8");
  const { data, content } = matter(raw);

  if (!data.name || !data.description) {
    throw new Error(`Expert "${id}" missing required frontmatter (name, description).`);
  }

  let memoryDir: string | null;
  if (data.memoryDir === false || data.memoryDir === null) {
    memoryDir = null;
  } else if (typeof data.memoryDir === "string") {
    memoryDir = path.resolve(EXPERTS_DIR, data.memoryDir);
  } else {
    const defaultDir = path.join(MEMORY_DIR, id);
    try {
      const stat = await fs.stat(defaultDir);
      memoryDir = stat.isDirectory() ? defaultDir : null;
    } catch {
      memoryDir = null;
    }
  }

  return {
    id,
    name: data.name,
    description: data.description,
    model: data.model || (await getSettings()).expertModel,
    modelOverride: Boolean(data.model),
    memoryDir,
    systemPrompt: content.trim(),
  };
}

export async function loadMemoryInventory(memoryDir: string | null): Promise<MemoryFile[]> {
  if (!memoryDir) return [];
  const out: MemoryFile[] = [];
  for (const cat of CATEGORIES) {
    const dir = path.join(memoryDir, cat);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const abs = path.join(dir, name);
      const stat = await fs.stat(abs);
      if (!stat.isFile()) continue;
      const raw = await fs.readFile(abs, "utf-8");
      const { data, content } = matter(raw);
      const pinned = data.pinned === true;
      out.push({
        category: cat,
        name,
        relativePath: `${cat}/${name}`,
        absolutePath: abs,
        size: stat.size,
        preview: extractPreview(content),
        pinned,
        body: pinned ? content.trim() : undefined,
      });
    }
  }
  out.sort((a, b) => {
    const ci = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
    if (ci !== 0) return ci;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export function isPathInsideMemoryDir(memoryDir: string, candidate: string): boolean {
  const norm = path.resolve(candidate);
  const base = path.resolve(memoryDir);
  return norm === base || norm.startsWith(base + path.sep);
}

function extractPreview(content: string): string {
  const headings: string[] = [];
  for (const raw of content.split("\n")) {
    const m = /^#{1,3}\s+(.+?)\s*#*\s*$/.exec(raw.trim());
    if (m && m[1]) {
      const text = m[1].replace(/[*_`]/g, "").trim();
      if (text) headings.push(text);
    }
  }
  if (headings.length > 0) {
    const shown = headings.slice(0, 8);
    let out = "Sections: " + shown.join(" · ");
    if (headings.length > shown.length) out += ` (+${headings.length - shown.length} more)`;
    return out.length > 250 ? out.slice(0, 247) + "..." : out;
  }
  for (const raw of content.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(">")) continue;
    if (/^-{3,}$/.test(trimmed)) continue;
    return trimmed.length > 200 ? trimmed.slice(0, 197) + "..." : trimmed;
  }
  return "";
}

export async function createExpert(opts: {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  withMemory: boolean;
}): Promise<void> {
  if (!isValidExpertId(opts.id)) throw new Error("invalid expert id");
  const file = matter.stringify(`\n${opts.systemPrompt.trim()}\n`, {
    name: opts.name,
    description: opts.description,
  }, { lineWidth: -1 } as any);
  await fs.mkdir(EXPERTS_DIR, { recursive: true });
  // "wx" fails if the file exists, so an existing expert is never overwritten.
  await fs.writeFile(path.join(EXPERTS_DIR, `${opts.id}.md`), file, { encoding: "utf-8", flag: "wx" });

  if (!opts.withMemory) return;
  const dir = path.join(MEMORY_DIR, opts.id);
  for (const cat of ["readonly", "editable", "journal"]) {
    await fs.mkdir(path.join(dir, cat), { recursive: true });
  }
  const profile = path.join(dir, "readonly", "profile.md");
  await fs.writeFile(
    profile,
    `---\npinned: true\n---\n\n# Profile\n\n- (facts about the user relevant to ${opts.name})\n`,
    { encoding: "utf-8", flag: "wx" },
  ).catch(() => {});
}
