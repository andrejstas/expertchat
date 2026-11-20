import path from "node:path";

export const DATA_DIR = path.resolve(process.env.EXPERT_CHAT_DATA_DIR || path.join(process.cwd(), "data"));
export const EXPERTS_DIR = path.join(DATA_DIR, "experts");
export const MEMORY_DIR = path.join(DATA_DIR, "memory");
