import { NextResponse } from "next/server";
import os from "node:os";
import fs from "node:fs/promises";

export const dynamic = "force-dynamic";

export async function GET() {
  const loadavg = os.loadavg();
  const cores = os.cpus().length;
  const cpuLoadPct = Math.min(100, Math.round((loadavg[0] / cores) * 100));

  let memUsedPct = 0;
  let memUsedGB = 0;
  let memTotalGB = 0;

  // /proc/meminfo gives us MemAvailable (more accurate than freemem on Linux,
  // which counts cached pages as "used"). Fall back to os.* on non-Linux.
  try {
    const meminfo = await fs.readFile("/proc/meminfo", "utf-8");
    const parse = (key: string): number => {
      const m = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
      return m ? parseInt(m[1], 10) * 1024 : 0;
    };
    const total = parse("MemTotal");
    const available = parse("MemAvailable");
    if (total > 0 && available > 0) {
      const used = total - available;
      memUsedPct = Math.round((used / total) * 100);
      memUsedGB = +(used / 1024 ** 3).toFixed(1);
      memTotalGB = +(total / 1024 ** 3).toFixed(1);
    }
  } catch {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    memUsedPct = Math.round((used / total) * 100);
    memUsedGB = +(used / 1024 ** 3).toFixed(1);
    memTotalGB = +(total / 1024 ** 3).toFixed(1);
  }

  return NextResponse.json({
    cpuLoadPct,
    cpuLoadAvg: +loadavg[0].toFixed(2),
    cores,
    memUsedPct,
    memUsedGB,
    memTotalGB,
  });
}
