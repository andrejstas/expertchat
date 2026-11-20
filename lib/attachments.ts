import fs from "node:fs/promises";
import path from "node:path";

const CHATS_ROOT = "chats";
const ATTACHMENTS_SUFFIX = ".attachments";

// Allowed types & extensions; mime can be lax so we map by extension too.
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
};

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
};

const MIME_ALIASES: Record<string, string> = {
  "text/x-markdown": "text/markdown",
  "application/markdown": "text/markdown",
  "application/x-markdown": "text/markdown",
};

export const MAX_BYTES = 5 * 1024 * 1024;

export interface AttachmentMeta {
  type: "image" | "pdf" | "text";
  path: string;       // absolute path on disk
  relPath: string;    // relative to project root, for display / model
  name: string;       // original filename
  size: number;
  mime: string;
}

function attachmentsDir(expertId: string, chatId: string): string {
  return path.join(process.cwd(), CHATS_ROOT, expertId, `${chatId}${ATTACHMENTS_SUFFIX}`);
}

export async function ensureAttachmentsDir(expertId: string, chatId: string): Promise<string> {
  const dir = attachmentsDir(expertId, chatId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function attachmentsDirFor(expertId: string, chatId: string): string {
  return attachmentsDir(expertId, chatId);
}

export function isAllowedMime(mime: string): boolean {
  return mime in ALLOWED;
}

export function resolveCanonicalMime(rawMime: string, filename: string): string | null {
  if (rawMime in ALLOWED) return rawMime;
  if (rawMime in MIME_ALIASES) return MIME_ALIASES[rawMime];
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext in EXT_TO_MIME) return EXT_TO_MIME[ext];
  return null;
}

export function classifyType(mime: string): "image" | "pdf" | "text" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  return "text";
}

export function extensionFor(mime: string, fallback: string): string {
  return ALLOWED[mime] ?? fallback;
}

export async function saveAttachment(
  expertId: string,
  chatId: string,
  bytes: Buffer,
  mime: string,
  originalName: string,
): Promise<AttachmentMeta> {
  if (!isAllowedMime(mime)) throw new Error(`unsupported type: ${mime}`);
  if (bytes.length > MAX_BYTES) throw new Error(`file too large: ${bytes.length}`);

  const dir = await ensureAttachmentsDir(expertId, chatId);
  const ext = extensionFor(mime, originalName.split(".").pop() ?? "bin");
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${id}.${ext}`;
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, bytes);

  const relPath = path.relative(process.cwd(), abs);
  return {
    type: classifyType(mime),
    path: abs,
    relPath,
    name: originalName,
    size: bytes.length,
    mime,
  };
}

export async function deleteAttachmentsDir(expertId: string, chatId: string): Promise<void> {
  const dir = attachmentsDir(expertId, chatId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
