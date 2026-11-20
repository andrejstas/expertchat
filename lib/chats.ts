import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { FileChange } from "./types";

const CHATS_ROOT = "chats";

export interface AttachmentRef {
  type: "image" | "pdf" | "text";
  path: string;        // absolute path
  relPath: string;     // relative to project root
  name: string;
  size: number;
  mime: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: AttachmentRef[];
  changes?: FileChange[];
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORT_VALUES: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"] as const;
export const DEFAULT_EFFORT: Effort = "xhigh";

export interface ChatMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  msgCount: number;
  effort: Effort;
}

export interface Chat extends ChatMeta {
  messages: ChatMessage[];
}

async function chatsDir(expertId: string): Promise<string> {
  // Chats live in top-level chats/<expert> — separate from memory.
  const dir = path.join(process.cwd(), CHATS_ROOT, expertId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function chatFile(dir: string, id: string): string {
  return path.join(dir, `${id}.jsonl`);
}

function generateId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}-${rand}`;
}

function deriveTitle(firstUserMessage: string): string {
  const firstLine = firstUserMessage.trim().split("\n")[0];
  return firstLine.length > 50 ? firstLine.slice(0, 47) + "…" : firstLine;
}

interface MetaLine {
  type: "meta";
  id: string;
  title: string;
  titleAuto: boolean;
  createdAt: string;
  effort?: Effort;
}

async function readChatFile(file: string): Promise<{ meta: MetaLine; messages: ChatMessage[]; updatedAt: string } | null> {
  let content: string;
  let stat;
  try {
    [content, stat] = await Promise.all([fs.readFile(file, "utf-8"), fs.stat(file)]);
  } catch {
    return null;
  }
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;
  let meta: MetaLine;
  try {
    meta = JSON.parse(lines[0]);
    if (meta.type !== "meta") return null;
  } catch {
    return null;
  }
  const messages: ChatMessage[] = [];
  for (const line of lines.slice(1)) {
    try {
      messages.push(JSON.parse(line));
    } catch {
      // skip corrupted line
    }
  }
  return { meta, messages, updatedAt: stat.mtime.toISOString() };
}

export async function listChats(expertId: string): Promise<ChatMeta[]> {
  const dir = await chatsDir(expertId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: ChatMeta[] = [];
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const data = await readChatFile(path.join(dir, name));
    if (!data) continue;
    out.push({
      id: data.meta.id,
      title: data.meta.title,
      createdAt: data.meta.createdAt,
      updatedAt: data.updatedAt,
      msgCount: data.messages.length,
      effort: data.meta.effort ?? DEFAULT_EFFORT,
    });
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

export async function getChat(expertId: string, id: string): Promise<Chat | null> {
  const dir = await chatsDir(expertId);
  const data = await readChatFile(chatFile(dir, id));
  if (!data) return null;
  return {
    id: data.meta.id,
    title: data.meta.title,
    createdAt: data.meta.createdAt,
    updatedAt: data.updatedAt,
    msgCount: data.messages.length,
    effort: data.meta.effort ?? DEFAULT_EFFORT,
    messages: data.messages,
  };
}

export async function createChat(expertId: string, title?: string): Promise<ChatMeta> {
  const dir = await chatsDir(expertId);
  const id = generateId();
  const now = new Date().toISOString();
  const meta: MetaLine = {
    type: "meta",
    id,
    title: title || "New chat",
    titleAuto: !title,
    createdAt: now,
    effort: DEFAULT_EFFORT,
  };
  await fs.writeFile(chatFile(dir, id), JSON.stringify(meta) + "\n", "utf-8");
  return { id, title: meta.title, createdAt: now, updatedAt: now, msgCount: 0, effort: DEFAULT_EFFORT };
}

export async function setChatEffort(expertId: string, id: string, effort: Effort): Promise<void> {
  const dir = await chatsDir(expertId);
  const file = chatFile(dir, id);
  const data = await readChatFile(file);
  if (!data) throw new Error(`Chat ${id} not found`);
  const newMeta: MetaLine = { ...data.meta, effort };
  const allLines = [JSON.stringify(newMeta), ...data.messages.map((m) => JSON.stringify(m))];
  await fs.writeFile(file, allLines.join("\n") + "\n", "utf-8");
}

export async function appendMessage(
  expertId: string,
  id: string,
  msg: { role: "user" | "assistant"; content: string; attachments?: AttachmentRef[]; changes?: FileChange[] },
): Promise<void> {
  const dir = await chatsDir(expertId);
  const file = chatFile(dir, id);
  const data = await readChatFile(file);
  if (!data) throw new Error(`Chat ${id} not found`);

  // If this is the first user message AND title is still auto, derive a title.
  const isFirstUserMsg = msg.role === "user" && !data.messages.some((m) => m.role === "user");
  const shouldUpdateTitle = isFirstUserMsg && data.meta.titleAuto;

  const now = new Date().toISOString();
  const lineObj: ChatMessage = {
    role: msg.role,
    content: msg.content,
    timestamp: now,
  };
  if (msg.attachments && msg.attachments.length > 0) {
    lineObj.attachments = msg.attachments;
  }
  if (msg.changes && msg.changes.length > 0) {
    lineObj.changes = msg.changes;
  }
  const line = JSON.stringify(lineObj);

  if (shouldUpdateTitle) {
    // Rewrite meta with derived title, keep existing messages, append new line.
    const newMeta: MetaLine = {
      ...data.meta,
      title: deriveTitle(msg.content),
      titleAuto: true,
    };
    const allLines = [
      JSON.stringify(newMeta),
      ...data.messages.map((m) => JSON.stringify(m)),
      line,
    ];
    await fs.writeFile(file, allLines.join("\n") + "\n", "utf-8");
  } else {
    // Pure append.
    await fs.appendFile(file, line + "\n", "utf-8");
  }
}

export async function renameChat(expertId: string, id: string, title: string): Promise<void> {
  const dir = await chatsDir(expertId);
  const file = chatFile(dir, id);
  const data = await readChatFile(file);
  if (!data) throw new Error(`Chat ${id} not found`);

  const newMeta: MetaLine = {
    ...data.meta,
    title: title.trim() || data.meta.title,
    titleAuto: false,
  };
  const allLines = [JSON.stringify(newMeta), ...data.messages.map((m) => JSON.stringify(m))];
  await fs.writeFile(file, allLines.join("\n") + "\n", "utf-8");
}

// Replace message at atIndex with new content AND drop everything after it.
// Used for "edit message and resend" flow — the truncated tail will be replaced
// by a fresh assistant response after the next /api/chat call.
export async function editMessageAt(
  expertId: string,
  id: string,
  atIndex: number,
  newContent: string,
): Promise<void> {
  const dir = await chatsDir(expertId);
  const file = chatFile(dir, id);
  const data = await readChatFile(file);
  if (!data) throw new Error(`Chat ${id} not found`);
  if (atIndex < 0 || atIndex >= data.messages.length) {
    throw new Error("atIndex out of range");
  }
  const original = data.messages[atIndex];
  const replaced: ChatMessage = {
    role: original.role,
    content: newContent,
    timestamp: new Date().toISOString(),
  };
  const truncated = [...data.messages.slice(0, atIndex), replaced];
  const lines = [JSON.stringify(data.meta), ...truncated.map((m) => JSON.stringify(m))];
  await fs.writeFile(file, lines.join("\n") + "\n", "utf-8");
}

export interface SearchHit {
  expertId: string;
  chatId: string;
  chatTitle: string;
  updatedAt: string;
  matchRole: "user" | "assistant";
  snippet: string;
}

export async function searchAcrossChats(query: string, limit = 30): Promise<SearchHit[]> {
  if (!query.trim()) return [];
  const q = query.toLowerCase();

  const root = path.join(process.cwd(), CHATS_ROOT);
  let expertDirs: string[];
  try {
    expertDirs = await fs.readdir(root);
  } catch {
    return [];
  }

  const hits: SearchHit[] = [];
  for (const expertId of expertDirs) {
    const dir = path.join(root, expertId);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const data = await readChatFile(path.join(dir, name));
      if (!data) continue;
      // Search across messages.
      for (const msg of data.messages) {
        const lc = msg.content.toLowerCase();
        const idx = lc.indexOf(q);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 40);
        const end = Math.min(msg.content.length, idx + q.length + 80);
        const prefix = start > 0 ? "…" : "";
        const suffix = end < msg.content.length ? "…" : "";
        hits.push({
          expertId,
          chatId: data.meta.id,
          chatTitle: data.meta.title,
          updatedAt: data.updatedAt,
          matchRole: msg.role,
          snippet: prefix + msg.content.slice(start, end).replace(/\s+/g, " ").trim() + suffix,
        });
        if (hits.length >= limit * 3) break;
      }
      if (hits.length >= limit * 3) break;
    }
    if (hits.length >= limit * 3) break;
  }

  hits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return hits.slice(0, limit);
}

export async function deleteChat(expertId: string, id: string): Promise<void> {
  const dir = await chatsDir(expertId);
  try {
    await fs.unlink(chatFile(dir, id));
  } catch {
    // already gone, fine
  }
  await fs.unlink(sessionFile(dir, id)).catch(() => {});
  // Also remove the attachments directory if it exists.
  const attDir = path.join(dir, `${id}.attachments`);
  try {
    await fs.rm(attDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// Soft estimate: ~3.5 chars per token for mixed Slovak/English content.
export function estimateTokens(messages: { content: string }[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.round(totalChars / 3.5);
}

// A Claude CLI session that already holds this chat's history, so the next turn
// can `--resume` it (history served from prompt cache) instead of re-sending the
// whole transcript. Valid only while the chat's messages still match exactly.
export interface ChatSession {
  sessionId: string;
  messageCount: number;
  fingerprint: string;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function sessionFile(dir: string, id: string): string {
  return path.join(dir, `${id}.session.json`);
}

export function fingerprintMessages(messages: { role: string; content: string }[]): string {
  const hash = crypto.createHash("sha256");
  for (const m of messages) {
    hash.update(m.role);
    hash.update("\0");
    hash.update(m.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function loadChatSession(expertId: string, id: string): Promise<ChatSession | null> {
  if (!SAFE_ID.test(expertId) || !SAFE_ID.test(id)) return null;
  try {
    const raw = await fs.readFile(sessionFile(await chatsDir(expertId), id), "utf-8");
    const s = JSON.parse(raw);
    if (typeof s.sessionId !== "string" || typeof s.messageCount !== "number" || typeof s.fingerprint !== "string") {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export async function saveChatSession(expertId: string, id: string, session: ChatSession): Promise<void> {
  if (!SAFE_ID.test(expertId) || !SAFE_ID.test(id)) return;
  await fs.writeFile(sessionFile(await chatsDir(expertId), id), JSON.stringify(session), "utf-8");
}

export async function clearChatSession(expertId: string, id: string): Promise<void> {
  if (!SAFE_ID.test(expertId) || !SAFE_ID.test(id)) return;
  await fs.unlink(sessionFile(await chatsDir(expertId), id)).catch(() => {});
}
