import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_EXPERT_MODEL, DEFAULT_ROUTER_MODEL, isValidModelId } from "./models";

const SETTINGS_FILE = path.join(process.cwd(), ".settings.json");

export interface AppSettings {
  expertModel: string;
  routerModel: string;
}

export async function getSettings(): Promise<AppSettings> {
  let data: any = {};
  try {
    data = JSON.parse(await fs.readFile(SETTINGS_FILE, "utf-8"));
  } catch {}
  return {
    expertModel: isValidModelId(data.expertModel) ? data.expertModel : DEFAULT_EXPERT_MODEL,
    routerModel: isValidModelId(data.routerModel) ? data.routerModel : DEFAULT_ROUTER_MODEL,
  };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...patch };
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return next;
}
