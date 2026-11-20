"use client";

import { useEffect, useRef, useState } from "react";

interface UsageStats {
  weeklyCapTokens: number;
  fiveHourCapTokens: number;
  weekTokens: number;
  fiveHourTokens: number;
  weekTokensLocal: number;
  fiveHourTokensLocal: number;
  totalEvents: number;
  weekCost: number;
  syncedAt: string | null;
  syncedAgeSec: number | null;
}

function formatTokens(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return (n / 1_000).toFixed(n < 10_000 ? 1 : 0) + "k";
  return (n / 1_000_000).toFixed(2) + "M";
}

function formatAge(sec: number): string {
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

export default function UsageBar() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftCap, setDraftCap] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [syncMode, setSyncMode] = useState(false);
  const [syncWeekly, setSyncWeekly] = useState("");
  const [syncFiveHour, setSyncFiveHour] = useState("");
  const [syncing, setSyncing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage")
      .then((r) => r.json())
      .then((s: UsageStats) => {
        if (!cancelled) setStats(s);
      })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [refreshTick]);

  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!stats) {
    return <div className="text-[10px] text-ink-500 px-1 py-2">Loading…</div>;
  }

  const pct = Math.min(100, Math.round((stats.weekTokens / stats.weeklyCapTokens) * 100));
  const barColor =
    pct < 30 ? "bg-emerald-500"
    : pct < 60 ? "bg-accent-500"
    : pct < 85 ? "bg-amber-500"
    : "bg-rose-500";

  function commitCap() {
    const m = draftCap.match(/^([\d.]+)\s*([kKmM]?)$/);
    if (!m) {
      setEditing(false);
      return;
    }
    const n = parseFloat(m[1]);
    const mult = m[2].toLowerCase() === "m" ? 1_000_000 : m[2].toLowerCase() === "k" ? 1_000 : 1;
    const tokens = Math.round(n * mult);
    if (tokens > 0) {
      fetch("/api/usage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyCapTokens: tokens }),
      }).then(() => setRefreshTick((t) => t + 1));
    }
    setEditing(false);
  }

  async function commitSync() {
    const w = parseFloat(syncWeekly);
    const h = parseFloat(syncFiveHour);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    setSyncing(true);
    try {
      await fetch("/api/usage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncWeeklyPct: w, syncFiveHourPct: h }),
      });
      setRefreshTick((t) => t + 1);
      setSyncMode(false);
    } finally {
      setSyncing(false);
    }
  }

  function openSync() {
    setSyncMode(true);
    // Pre-fill with current displayed % as anchor
    const currentWeekPct = Math.round((stats!.weekTokens / stats!.weeklyCapTokens) * 100);
    const currentFiveHourPct = Math.round((stats!.fiveHourTokens / stats!.fiveHourCapTokens) * 100);
    setSyncWeekly(String(currentWeekPct));
    setSyncFiveHour(String(currentFiveHourPct));
  }

  if (syncMode) {
    return (
      <div className="px-1 py-1 space-y-2 animate-fade-up">
        <div className="text-[10.5px] uppercase tracking-wider text-ink-300 font-semibold">
          Sync from claude.ai
        </div>
        <div className="text-[10.5px] text-ink-500 leading-snug">
          Open <a href="https://claude.ai/settings/usage" target="_blank" rel="noopener noreferrer" className="text-accent-300 hover:text-accent-200 underline">claude.ai/settings/usage</a> and copy the two %s shown there.
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-ink-400">
            <div className="mb-0.5 font-mono uppercase tracking-wider">5h %</div>
            <input
              type="number"
              min="0"
              max="100"
              autoFocus
              value={syncFiveHour}
              onChange={(e) => setSyncFiveHour(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitSync(); }}
              className="w-full bg-ink-900 border border-ink-800 focus:border-accent-500 rounded px-2 py-1 text-[12px] font-mono text-ink-100 focus:outline-none"
              placeholder="42"
            />
          </label>
          <label className="text-[10px] text-ink-400">
            <div className="mb-0.5 font-mono uppercase tracking-wider">Weekly %</div>
            <input
              type="number"
              min="0"
              max="100"
              value={syncWeekly}
              onChange={(e) => setSyncWeekly(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitSync(); }}
              className="w-full bg-ink-900 border border-ink-800 focus:border-accent-500 rounded px-2 py-1 text-[12px] font-mono text-ink-100 focus:outline-none"
              placeholder="65"
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setSyncMode(false)}
            className="text-[11px] text-ink-400 hover:text-ink-100 px-2 py-1 rounded hover:bg-ink-900 transition"
          >
            Cancel
          </button>
          <button
            onClick={commitSync}
            disabled={syncing}
            className="text-[11px] bg-gradient-to-br from-accent-400 to-accent-600 hover:from-accent-300 hover:to-accent-500 disabled:opacity-50 text-white font-medium px-2.5 py-1 rounded transition"
          >
            {syncing ? "Syncing…" : "Apply"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-1 py-1">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-semibold flex items-center gap-1.5">
          <span>Max usage · 7d</span>
          {stats.syncedAgeSec != null && (
            <span
              className={`text-[9.5px] normal-case tracking-normal ${
                stats.syncedAgeSec < 1800
                  ? "text-emerald-500"
                  : stats.syncedAgeSec < 14400
                    ? "text-amber-500"
                    : "text-rose-500"
              }`}
              title={`Last synced ${formatAge(stats.syncedAgeSec)}. Re-sync when stale.`}
            >
              · synced {formatAge(stats.syncedAgeSec)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={openSync}
            className="text-ink-500 hover:text-accent-300 p-0.5 rounded transition"
            title="Sync %s from claude.ai"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8a6 6 0 0 1 10-4.5L14 5" />
              <path d="M14 2v3h-3" />
              <path d="M14 8a6 6 0 0 1-10 4.5L2 11" />
              <path d="M2 14v-3h3" />
            </svg>
          </button>
          <a
            href="https://claude.ai/settings/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-500 hover:text-ink-200 p-0.5 rounded transition"
            title="Open real usage on claude.ai"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3h4v4" />
              <path d="M13 3l-7 7" />
              <path d="M11 9v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
            </svg>
          </a>
          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            className="text-ink-500 hover:text-ink-200 p-0.5 rounded transition"
            title="Refresh"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
              <path d="M13.5 2.5v3h-3" />
            </svg>
          </button>
        </div>
      </div>
      <div
        className="h-2 rounded-full bg-ink-850 overflow-hidden"
        title={`${stats.weekTokens.toLocaleString()} of ${stats.weeklyCapTokens.toLocaleString()} tokens this week (${pct}%) — local: ${stats.weekTokensLocal.toLocaleString()}`}
      >
        <div
          className={`h-full ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between mt-1.5 text-[10.5px] text-ink-400 font-mono">
        <span>{formatTokens(stats.weekTokens)} <span className="text-ink-600">/</span> {editing ? (
          <input
            ref={inputRef}
            value={draftCap}
            autoFocus
            onChange={(e) => setDraftCap(e.target.value)}
            onBlur={commitCap}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitCap(); }
              else if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
            }}
            placeholder="5M"
            className="w-12 bg-ink-900 border border-ink-700 rounded px-1 text-ink-100 focus:outline-none focus:border-accent-500"
          />
        ) : (
          <button
            className="hover:text-ink-200 underline-offset-2 hover:underline"
            onClick={() => { setDraftCap(formatTokens(stats.weeklyCapTokens)); setEditing(true); setTimeout(() => inputRef.current?.select(), 50); }}
            title="Click to set your weekly cap (Max 5x ≈ 5M)"
          >
            {formatTokens(stats.weeklyCapTokens)}
          </button>
        )}</span>
        <span className="text-ink-500" title={`Last 5 hours · cap ${formatTokens(stats.fiveHourCapTokens)} · local ${formatTokens(stats.fiveHourTokensLocal)}`}>
          5h: {formatTokens(stats.fiveHourTokens)}
        </span>
      </div>
    </div>
  );
}
