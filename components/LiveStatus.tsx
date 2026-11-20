"use client";

import { useEffect, useState } from "react";
import type { ColorClasses } from "@/lib/expertColor";

export type StageKind =
  | "spawning"
  | "connected"
  | "thinking"
  | "tool"
  | "text"
  | "error";

export interface Stage {
  kind: StageKind;
  label: string;
  startedAt: number;
  endedAt?: number;
  detail?: string;
}

export interface LiveState {
  startedAt: number;
  lastEventAt: number;
  stages: Stage[];
}

export default function LiveStatus({
  live,
  colors,
}: {
  live: LiveState;
  colors: ColorClasses | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - live.startedAt) / 1000));
  const sinceLast = Math.max(0, Math.floor((now - live.lastEventAt) / 1000));

  let dotClass = "bg-emerald-400";
  let dotPulse = "";
  if (sinceLast >= 15) {
    dotClass = "bg-rose-500";
    dotPulse = "animate-pulse";
  } else if (sinceLast >= 3) {
    dotClass = "bg-amber-400";
    dotPulse = "animate-pulse";
  }

  const active =
    [...live.stages].reverse().find((s) => s.endedAt == null) ??
    live.stages[live.stages.length - 1];

  const completed = live.stages.filter((s) => s.endedAt != null);
  const recent = completed.slice(-4);
  const omitted = completed.length - recent.length;

  const ringClass = colors?.border ?? "border-ink-800";

  return (
    <div
      className={`mb-2 rounded-xl border ${ringClass} bg-ink-925/60 px-3 py-2 text-[12px] flex flex-col gap-1`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotClass} ${dotPulse}`}
          aria-hidden
        />
        <span className="font-mono text-ink-400 text-[11px] tabular-nums shrink-0">
          {formatElapsed(elapsed)}
        </span>
        <span className="text-ink-200 truncate min-w-0 flex-1" title={fullLabel(active)}>
          {active ? renderStage(active) : "starting…"}
        </span>
        {sinceLast >= 3 && (
          <span className="text-[10.5px] text-ink-500 font-mono shrink-0 tabular-nums">
            no event {sinceLast}s
          </span>
        )}
      </div>

      {recent.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-ink-500 pl-4">
          {omitted > 0 && <span className="text-ink-600">…+{omitted}</span>}
          {recent.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-ink-700">›</span>}
              <span title={fullLabel(s)} className="truncate max-w-[200px]">
                {renderStage(s)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function renderStage(s: Stage | undefined): string {
  if (!s) return "";
  return s.detail ? `${s.label} · ${s.detail}` : s.label;
}

function fullLabel(s: Stage | undefined): string {
  if (!s) return "";
  return s.detail ? `${s.label} (${s.detail})` : s.label;
}

function formatElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m${s.toString().padStart(2, "0")}`;
}
