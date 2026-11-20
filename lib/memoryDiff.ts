import fs from "node:fs/promises";
import path from "node:path";
import type { DiffHunk, FileChange } from "./types";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_LCS_CELLS = 4_000_000;
const CONTEXT = 3;

export type MemorySnapshot = Map<string, string>;

export async function snapshotMemory(root: string): Promise<MemorySnapshot> {
  const snap: MemorySnapshot = new Map();
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        try {
          const stat = await fs.stat(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          snap.set(path.relative(root, full), await fs.readFile(full, "utf-8"));
        } catch {
          // vanished mid-walk
        }
      }
    }
  }
  await walk(root);
  return snap;
}

export function diffSnapshots(before: MemorySnapshot, after: MemorySnapshot): FileChange[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  const changes: FileChange[] = [];
  for (const p of paths) {
    const a = before.get(p);
    const b = after.get(p);
    if (a === b) continue;
    const status = a === undefined ? "added" : b === undefined ? "deleted" : "modified";
    const ops = diffLines(splitLines(a ?? ""), splitLines(b ?? ""));
    changes.push({
      path: p,
      status,
      additions: ops.filter((o) => o[0] === "+").length,
      deletions: ops.filter((o) => o[0] === "-").length,
      hunks: buildHunks(ops),
    });
  }
  return changes.sort((x, y) => x.path.localeCompare(y.path));
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Returns unified-diff style ops: " line", "-line", "+line".
function diffLines(a: string[], b: string[]): string[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head = a.slice(0, start).map((l) => " " + l);
  const tail = a.slice(endA).map((l) => " " + l);
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  let mid: string[];
  if (midA.length * midB.length > MAX_LCS_CELLS) {
    mid = [...midA.map((l) => "-" + l), ...midB.map((l) => "+" + l)];
  } else {
    mid = lcsDiff(midA, midB);
  }
  return [...head, ...mid, ...tail];
}

function lcsDiff(a: string[], b: string[]): string[] {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const table = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * w + j] = a[i] === b[j]
        ? table[(i + 1) * w + j + 1] + 1
        : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(" " + a[i]);
      i++;
      j++;
    } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
      out.push("-" + a[i++]);
    } else {
      out.push("+" + b[j++]);
    }
  }
  while (i < n) out.push("-" + a[i++]);
  while (j < m) out.push("+" + b[j++]);
  return out;
}

function buildHunks(ops: string[]): DiffHunk[] {
  const changed = ops.map((o, idx) => (o[0] !== " " ? idx : -1)).filter((idx) => idx >= 0);
  if (changed.length === 0) return [];

  const ranges: [number, number][] = [];
  for (const idx of changed) {
    const from = Math.max(0, idx - CONTEXT);
    const to = Math.min(ops.length - 1, idx + CONTEXT);
    const last = ranges[ranges.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else ranges.push([from, to]);
  }

  const hunks: DiffHunk[] = [];
  let oldLine = 1;
  let newLine = 1;
  let cursor = 0;
  for (const [from, to] of ranges) {
    for (; cursor < from; cursor++) {
      if (ops[cursor][0] !== "+") oldLine++;
      if (ops[cursor][0] !== "-") newLine++;
    }
    const hunk: DiffHunk = { oldStart: oldLine, newStart: newLine, lines: ops.slice(from, to + 1) };
    for (; cursor <= to; cursor++) {
      if (ops[cursor][0] !== "+") oldLine++;
      if (ops[cursor][0] !== "-") newLine++;
    }
    hunks.push(hunk);
  }
  return hunks;
}
