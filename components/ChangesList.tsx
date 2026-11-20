"use client";

import { useState } from "react";
import type { FileChange, DiffHunk } from "@/lib/types";

const STATUS_LABEL: Record<FileChange["status"], string> = {
  added: "new",
  modified: "edited",
  deleted: "deleted",
};

const STATUS_CLASS: Record<FileChange["status"], string> = {
  added: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  modified: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  deleted: "text-rose-300 bg-rose-500/10 border-rose-500/30",
};

export default function ChangesList({ changes }: { changes: FileChange[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className="mt-2 rounded-xl border border-ink-800 bg-ink-925 overflow-hidden">
      <div className="px-3 py-1.5 text-[10.5px] uppercase tracking-wider text-ink-400 font-semibold border-b border-ink-850">
        Memory changes · {changes.length} {changes.length === 1 ? "file" : "files"}
      </div>
      {changes.map((c) => {
        const isOpen = open.has(c.path);
        return (
          <div key={c.path} className="border-b border-ink-850 last:border-b-0">
            <button
              onClick={() => toggle(c.path)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-ink-900 transition"
              aria-expanded={isOpen}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={`text-ink-500 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden>
                <path d="M5 3l5 5-5 5" />
              </svg>
              <span className={`text-[10px] px-1.5 py-px rounded border shrink-0 ${STATUS_CLASS[c.status]}`}>
                {STATUS_LABEL[c.status]}
              </span>
              <span className="text-[12px] text-ink-200 font-mono truncate flex-1">{c.path}</span>
              <span className="text-[11px] font-mono shrink-0">
                {c.additions > 0 && <span className="text-emerald-400">+{c.additions}</span>}
                {c.additions > 0 && c.deletions > 0 && " "}
                {c.deletions > 0 && <span className="text-rose-400">−{c.deletions}</span>}
              </span>
            </button>
            {isOpen && (
              <div className="max-h-96 overflow-y-auto border-t border-ink-850 bg-ink-950 py-1">
                {c.hunks.map((h, i) => (
                  <Hunk key={i} hunk={h} showHeader={c.hunks.length > 1 || h.oldStart > 1} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Hunk({ hunk, showHeader }: { hunk: DiffHunk; showHeader: boolean }) {
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  const rows = hunk.lines.map((line) => {
    const kind = line[0];
    const row = {
      kind,
      text: line.slice(1),
      oldNo: kind === "+" ? null : oldLine,
      newNo: kind === "-" ? null : newLine,
    };
    if (kind !== "+") oldLine++;
    if (kind !== "-") newLine++;
    return row;
  });

  return (
    <div className="font-mono text-[11.5px] leading-[1.55]">
      {showHeader && (
        <div className="px-3 py-0.5 text-[10.5px] text-ink-500">
          line {hunk.newStart}
        </div>
      )}
      {rows.map((r, i) => (
        <div
          key={i}
          className={`flex ${
            r.kind === "+"
              ? "bg-emerald-500/10 text-emerald-100"
              : r.kind === "-"
                ? "bg-rose-500/10 text-rose-100"
                : "text-ink-400"
          }`}
        >
          <span className="w-9 shrink-0 text-right pr-1.5 text-ink-600 select-none">{r.oldNo ?? ""}</span>
          <span className="w-9 shrink-0 text-right pr-1.5 text-ink-600 select-none">{r.newNo ?? ""}</span>
          <span
            className={`w-4 shrink-0 select-none ${
              r.kind === "+" ? "text-emerald-400" : r.kind === "-" ? "text-rose-400" : ""
            }`}
          >
            {r.kind === " " ? "" : r.kind === "-" ? "−" : "+"}
          </span>
          <span className="whitespace-pre-wrap break-words min-w-0 flex-1 pr-3">{r.text || " "}</span>
        </div>
      ))}
    </div>
  );
}
