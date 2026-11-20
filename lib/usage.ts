import fs from "node:fs/promises";
import path from "node:path";

const EVENTS_FILE = path.join(process.cwd(), ".usage.jsonl");
const CONFIG_FILE = path.join(process.cwd(), ".usage-config.json");

// Soft defaults — user can recalibrate via Sync.
const DEFAULT_WEEKLY_CAP = 5_000_000;
const DEFAULT_FIVE_HOUR_CAP = 1_000_000;

export interface UsageEvent {
  ts: string;
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  cost: number;
  model?: string;
}

export interface UsageConfig {
  weeklyCapTokens: number;
  fiveHourCapTokens: number;
  weeklyOffset: number;     // tokens to add to local weekly count to match claude.ai
  fiveHourOffset: number;   // same for rolling 5h window
  syncedAt: string | null;  // ISO timestamp of last sync
}

export interface UsageStats {
  weeklyCapTokens: number;
  fiveHourCapTokens: number;
  weekTokens: number;       // local + offset
  fiveHourTokens: number;   // local + offset
  weekTokensLocal: number;  // raw local count, without offset
  fiveHourTokensLocal: number;
  totalEvents: number;
  weekCost: number;
  syncedAt: string | null;
  syncedAgeSec: number | null;
}

export async function recordUsage(e: Omit<UsageEvent, "ts">): Promise<void> {
  const event: UsageEvent = { ts: new Date().toISOString(), ...e };
  try {
    await fs.appendFile(EVENTS_FILE, JSON.stringify(event) + "\n", "utf-8");
  } catch (err) {
    console.error("usage record failed", err);
  }
}

async function loadConfig(): Promise<UsageConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    const data = JSON.parse(raw);
    return {
      weeklyCapTokens: typeof data.weeklyCapTokens === "number" && data.weeklyCapTokens > 0
        ? data.weeklyCapTokens
        : DEFAULT_WEEKLY_CAP,
      fiveHourCapTokens: typeof data.fiveHourCapTokens === "number" && data.fiveHourCapTokens > 0
        ? data.fiveHourCapTokens
        : DEFAULT_FIVE_HOUR_CAP,
      weeklyOffset: typeof data.weeklyOffset === "number" ? data.weeklyOffset : 0,
      fiveHourOffset: typeof data.fiveHourOffset === "number" ? data.fiveHourOffset : 0,
      syncedAt: typeof data.syncedAt === "string" ? data.syncedAt : null,
    };
  } catch {
    return {
      weeklyCapTokens: DEFAULT_WEEKLY_CAP,
      fiveHourCapTokens: DEFAULT_FIVE_HOUR_CAP,
      weeklyOffset: 0,
      fiveHourOffset: 0,
      syncedAt: null,
    };
  }
}

async function saveConfig(c: UsageConfig): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(c, null, 2), "utf-8");
}

export async function setCaps(weekly?: number, fiveHour?: number): Promise<void> {
  const c = await loadConfig();
  if (typeof weekly === "number" && weekly > 0) c.weeklyCapTokens = Math.max(1_000, Math.round(weekly));
  if (typeof fiveHour === "number" && fiveHour > 0) c.fiveHourCapTokens = Math.max(1_000, Math.round(fiveHour));
  await saveConfig(c);
}

// Calibrate against claude.ai dashboard. User enters their current % for each window;
// we backsolve target tokens and store offsets so displayed counts match.
export async function applySync(weeklyPct: number, fiveHourPct: number): Promise<void> {
  const c = await loadConfig();
  const local = await computeLocal();

  const weeklyTarget = (Math.max(0, Math.min(100, weeklyPct)) / 100) * c.weeklyCapTokens;
  const fiveHourTarget = (Math.max(0, Math.min(100, fiveHourPct)) / 100) * c.fiveHourCapTokens;

  c.weeklyOffset = Math.round(weeklyTarget - local.weekTokens);
  c.fiveHourOffset = Math.round(fiveHourTarget - local.fiveHourTokens);
  c.syncedAt = new Date().toISOString();
  await saveConfig(c);
}

async function readEvents(): Promise<UsageEvent[]> {
  try {
    const raw = await fs.readFile(EVENTS_FILE, "utf-8");
    return raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean) as UsageEvent[];
  } catch {
    return [];
  }
}

interface LocalCounts {
  weekTokens: number;
  fiveHourTokens: number;
  weekCost: number;
  totalEvents: number;
}

async function computeLocal(): Promise<LocalCounts> {
  const events = await readEvents();
  const now = Date.now();
  const weekCutoff = now - 7 * 86400 * 1000;
  const fiveHourCutoff = now - 5 * 3600 * 1000;

  let weekTokens = 0;
  let fiveHourTokens = 0;
  let weekCost = 0;
  for (const e of events) {
    const t = new Date(e.ts).getTime();
    if (Number.isNaN(t)) continue;
    const tokens = (e.input ?? 0) + (e.output ?? 0) + (e.cacheCreation ?? 0) + (e.cacheRead ?? 0);
    if (t >= weekCutoff) {
      weekTokens += tokens;
      weekCost += e.cost ?? 0;
    }
    if (t >= fiveHourCutoff) {
      fiveHourTokens += tokens;
    }
  }
  return { weekTokens, fiveHourTokens, weekCost, totalEvents: events.length };
}

export async function getStats(): Promise<UsageStats> {
  const [local, c] = await Promise.all([computeLocal(), loadConfig()]);
  const week = Math.max(0, local.weekTokens + c.weeklyOffset);
  const fiveHour = Math.max(0, local.fiveHourTokens + c.fiveHourOffset);
  const syncedAgeSec = c.syncedAt
    ? Math.round((Date.now() - new Date(c.syncedAt).getTime()) / 1000)
    : null;
  return {
    weeklyCapTokens: c.weeklyCapTokens,
    fiveHourCapTokens: c.fiveHourCapTokens,
    weekTokens: week,
    fiveHourTokens: fiveHour,
    weekTokensLocal: local.weekTokens,
    fiveHourTokensLocal: local.fiveHourTokens,
    totalEvents: local.totalEvents,
    weekCost: Math.round(local.weekCost * 100) / 100,
    syncedAt: c.syncedAt,
    syncedAgeSec,
  };
}
