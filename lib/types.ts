export interface ExpertConfig {
  id: string;
  name: string;
  description: string;
  model: string;
  modelOverride: boolean;
  memoryDir: string | null;
  systemPrompt: string;
}

export interface AttachmentRefLite {
  type: "image" | "pdf" | "text";
  path: string;       // absolute path on server
  relPath: string;
  name: string;
  size: number;
  mime: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  attachments?: AttachmentRefLite[];
}

export interface ChatRequest {
  expertId?: string;
  autoRoute?: boolean;
  messages: ChatMessage[];
}

export type MemoryCategory = "readonly" | "editable" | "journal" | "archived";

export interface MemoryFile {
  category: MemoryCategory;
  name: string;
  relativePath: string;
  absolutePath: string;
  size: number;
  preview: string;
  pinned: boolean;
  body?: string;
}

// A memory file changed by the expert during one reply. Hunk lines are
// prefixed like a unified diff: " " context, "+" added, "-" removed.
export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: string[];
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}
