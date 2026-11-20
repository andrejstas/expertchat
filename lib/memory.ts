import fs from "node:fs/promises";
import path from "node:path";
import { MEMORY_DIR } from "./dataDir";

const ROOT = path.resolve(process.cwd());

export function isAllowedMemoryPath(p: string): boolean {
  const abs = path.resolve(p);
  const allowed = [MEMORY_DIR, path.dirname(ROOT)];
  return allowed.some((dir) => abs.startsWith(dir + path.sep) || abs === dir);
}

export async function readMemoryFile(absPath: string): Promise<string> {
  if (!isAllowedMemoryPath(absPath)) throw new Error("Memory path not allowed");
  try {
    return await fs.readFile(absPath, "utf-8");
  } catch {
    return "";
  }
}

export async function writeMemoryFile(absPath: string, content: string): Promise<void> {
  if (!isAllowedMemoryPath(absPath)) throw new Error("Memory path not allowed");
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, "utf-8");
}
