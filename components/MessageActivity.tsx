"use client";

import { useState } from "react";
import type { ColorClasses } from "@/lib/expertColor";

export interface ToolCall {
  id: string;
  name: string;
  input?: any;
  result?: string;
  isError?: boolean;
}

export interface Activity {
  thinking: string;
  tools: ToolCall[];
}

export default function MessageActivity({
  activity,
  colors,
}: {
  activity: Activity;
  colors: ColorClasses | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [showThinking, setShowThinking] = useState(false);

  const hasThinking = activity.thinking.length > 0;
  const hasTools = activity.tools.length > 0;
  if (!hasThinking && !hasTools) return null;

  const ringClass = colors?.border ?? "border-ink-800";

  return (
    <div className={`mb-2 rounded-xl border ${ringClass} bg-ink-925/60 overflow-hidden text-[12px]`}>
      {/* Compact strip */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-ink-900/50 transition"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-ink-500 transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path d="M5 3l5 5-5 5" />
        </svg>
        <div className="flex flex-wrap gap-1.5 flex-1">
          {hasThinking && (
            <ActivityChip icon="💭" label="thinking" colors={colors} />
          )}
          {activity.tools.map((t, i) => (
            <ActivityChip
              key={i}
              icon={toolIcon(t.name)}
              label={`${verb(t.name)}${describeInput(t) ? " " + describeInput(t) : ""}`}
              colors={colors}
              error={t.isError}
            />
          ))}
        </div>
        <span className="text-[10px] text-ink-500 font-mono">
          {expanded ? "hide" : "show"}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-ink-850 px-3 py-2.5 space-y-2">
          {hasThinking && (
            <div className="rounded-md bg-ink-900 border border-ink-850">
              <button
                onClick={() => setShowThinking((v) => !v)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-ink-850/50 transition"
              >
                <span className="text-[10.5px] uppercase tracking-wider text-ink-400 font-semibold flex-1">
                  💭 Thinking
                </span>
                <span className="text-[10px] font-mono text-ink-500">
                  {activity.thinking.length.toLocaleString()} chars
                </span>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={`text-ink-500 transition-transform ${showThinking ? "rotate-90" : ""}`}>
                  <path d="M5 3l5 5-5 5" />
                </svg>
              </button>
              {showThinking && (
                <pre className="px-2.5 pb-2.5 pt-1 text-[11.5px] text-ink-300 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                  {activity.thinking}
                </pre>
              )}
            </div>
          )}

          {activity.tools.map((tool, i) => (
            <ToolDetail
              key={i}
              tool={tool}
              isOpen={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? null : i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityChip({
  icon,
  label,
  colors,
  error,
}: {
  icon: string;
  label: string;
  colors: ColorClasses | null;
  error?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-mono ${
        error
          ? "bg-rose-500/10 border-rose-500/40 text-rose-300"
          : `${colors?.soft ?? "bg-ink-900"} ${colors?.border ?? "border-ink-800"} ${colors?.text ?? "text-ink-300"}`
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function ToolDetail({
  tool,
  isOpen,
  onToggle,
}: {
  tool: ToolCall;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-md border ${
        tool.isError ? "bg-rose-500/5 border-rose-500/30" : "bg-ink-900 border-ink-850"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-ink-850/50 transition"
      >
        <span className="text-[10.5px] uppercase tracking-wider text-ink-400 font-semibold">
          {toolIcon(tool.name)} {tool.name}
        </span>
        <span className="text-[11px] text-ink-300 font-mono truncate flex-1">
          {describeInput(tool)}
        </span>
        {tool.result != null && (
          <span className="text-[10px] font-mono text-ink-500 shrink-0">
            {tool.result.length.toLocaleString()}b
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={`text-ink-500 transition-transform ${isOpen ? "rotate-90" : ""}`}>
          <path d="M5 3l5 5-5 5" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-ink-850">
          {tool.input && (
            <div>
              <div className="text-[9.5px] uppercase tracking-wider text-ink-500 font-semibold mb-1">Input</div>
              <pre className="text-[11px] text-ink-300 font-mono whitespace-pre-wrap break-all bg-ink-950 rounded px-2 py-1.5 max-h-48 overflow-y-auto border border-ink-850">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.result != null && (
            <div>
              <div className="text-[9.5px] uppercase tracking-wider text-ink-500 font-semibold mb-1 flex items-center gap-1.5">
                <span>Result</span>
                {tool.isError && <span className="text-rose-400 font-normal normal-case">(error)</span>}
              </div>
              <pre className="text-[11px] text-ink-300 font-mono whitespace-pre-wrap break-words bg-ink-950 rounded px-2 py-1.5 max-h-96 overflow-y-auto border border-ink-850">
                {tool.result}
              </pre>
            </div>
          )}
          {tool.result == null && !tool.isError && (
            <div className="text-[10.5px] text-ink-500 italic px-2">⏳ waiting for result…</div>
          )}
        </div>
      )}
    </div>
  );
}

function toolIcon(name: string): string {
  if (name === "Read") return "📖";
  if (name === "Edit") return "✏️";
  if (name === "Write") return "📝";
  if (name === "WebSearch") return "🔍";
  if (name === "WebFetch") return "🌐";
  if (name === "Bash") return "💻";
  if (name === "Glob") return "🗂️";
  if (name === "Grep") return "🔎";
  return "🔧";
}

function verb(name: string): string {
  if (name === "Read") return "Reading";
  if (name === "Edit") return "Editing";
  if (name === "Write") return "Writing";
  if (name === "WebSearch") return "Searching";
  if (name === "WebFetch") return "Fetching";
  return name;
}

function describeInput(tool: ToolCall): string {
  const i = tool.input;
  if (!i) return "";
  if (typeof i.file_path === "string") {
    const parts = i.file_path.split("/");
    return parts.slice(-2).join("/");
  }
  if (typeof i.url === "string") return i.url;
  if (typeof i.query === "string") return `"${i.query}"`;
  if (typeof i.command === "string") return i.command.slice(0, 60);
  if (typeof i.pattern === "string") return i.pattern;
  return "";
}
