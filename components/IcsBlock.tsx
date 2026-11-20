"use client";

import { useState } from "react";

export default function IcsBlock({ content }: { content: string }) {
  const [showRaw, setShowRaw] = useState(false);

  const summary = content.match(/^SUMMARY:(.+)$/m)?.[1]?.trim() ?? "Calendar event";
  const description = content.match(/^DESCRIPTION:(.+)$/m)?.[1]?.trim() ?? "";
  const dtStartMatch = content.match(/^DTSTART(?:;[^:]*)?:([0-9TZ]+)/m)?.[1] ?? "";
  const dtEndMatch = content.match(/^DTEND(?:;[^:]*)?:([0-9TZ]+)/m)?.[1] ?? "";

  function download() {
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const slug = summary
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "event";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="not-prose my-3 rounded-xl border border-accent-500/40 bg-accent-500/5 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white text-[15px] shadow-sm">
          📅
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-ink-100 truncate">{summary}</div>
          <div className="text-[11px] text-ink-400 font-mono mt-0.5">
            {formatRange(dtStartMatch, dtEndMatch)}
          </div>
          {description && (
            <div className="text-[11.5px] text-ink-300 mt-1 line-clamp-2">{description}</div>
          )}
        </div>
        <button
          onClick={download}
          className="shrink-0 text-[12px] bg-gradient-to-br from-accent-400 to-accent-600 hover:from-accent-300 hover:to-accent-500 text-white font-medium px-3 py-1.5 rounded-md transition shadow-sm"
        >
          Add to Calendar
        </button>
      </div>
      <details className="border-t border-accent-500/20" open={showRaw}>
        <summary
          onClick={(e) => { e.preventDefault(); setShowRaw((v) => !v); }}
          className="px-3 py-1.5 text-[10.5px] text-ink-500 cursor-pointer hover:text-ink-300 select-none"
        >
          {showRaw ? "Hide" : "View"} raw .ics
        </summary>
        {showRaw && (
          <pre className="px-3 pb-3 text-[10.5px] text-ink-400 font-mono whitespace-pre-wrap break-all">
            {content}
          </pre>
        )}
      </details>
    </div>
  );
}

function formatRange(start: string, end: string): string {
  const s = parseICalDate(start);
  const e = parseICalDate(end);
  if (!s) return "—";
  const startStr = s.toLocaleString("sk-SK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!e || e.getTime() === s.getTime()) return startStr;

  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  if (sameDay) {
    const endTime = e.toLocaleString("sk-SK", { hour: "2-digit", minute: "2-digit" });
    return `${startStr} – ${endTime}`;
  }
  const endStr = e.toLocaleString("sk-SK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${startStr} – ${endStr}`;
}

function parseICalDate(s: string): Date | null {
  if (!s) return null;
  // Format: YYYYMMDDTHHMMSSZ or YYYYMMDD (date-only)
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/);
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00", ss = "00", z] = m;
  const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}${z === "Z" ? "Z" : ""}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
