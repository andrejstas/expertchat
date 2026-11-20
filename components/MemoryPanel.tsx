"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { expertColorClasses } from "@/lib/expertColor";

const MIN_WIDTH = 260;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 320;
const STORAGE_KEY = "expert-chat:memory-panel-width";

interface MemoryFileMeta {
  category: "readonly" | "editable" | "journal" | "archived";
  name: string;
  relativePath: string;
  size: number;
  preview: string;
}

interface ListResponse {
  memoryDir: string | null;
  files: MemoryFileMeta[];
}

const CATEGORY_LABEL: Record<MemoryFileMeta["category"], string> = {
  readonly: "Read-only",
  editable: "Editable",
  journal: "Journal",
  archived: "Archived",
};

const CATEGORY_HINT: Record<MemoryFileMeta["category"], string> = {
  readonly: "Reference. Expert never modifies these.",
  editable: "Current state. Expert may rewrite.",
  journal: "Append-only chronological log.",
  archived: "Completed documents. Read-only historical record.",
};

const CATEGORY_DOT: Record<MemoryFileMeta["category"], string> = {
  readonly: "bg-accent-300",
  editable: "bg-amber-300",
  journal: "bg-emerald-300",
  archived: "bg-zinc-400",
};

export default function MemoryPanel({
  expertId,
  expertName,
  refreshKey,
  onClose,
}: {
  expertId: string;
  expertName: string;
  refreshKey: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openFile, setOpenFile] = useState<{ path: string; content: string } | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const colors = expertColorClasses(expertId);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const n = parseInt(saved, 10);
      if (!Number.isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) setWidth(n);
    }
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const s = dragStateRef.current;
      if (!s) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, s.startWidth - (e.clientX - s.startX)));
      setWidth(next);
    };
    const onUp = () => {
      setIsResizing(false);
      dragStateRef.current = null;
      window.localStorage.setItem(STORAGE_KEY, String(width));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing, width]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startWidth: width };
    setIsResizing(true);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOpenFile(null);
    fetch(`/api/memory/list?expertId=${encodeURIComponent(expertId)}`)
      .then((r) => r.json())
      .then((j: ListResponse) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setData({ memoryDir: null, files: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expertId, refreshKey]);

  async function openFileContent(relativePath: string) {
    setOpenLoading(true);
    setEditing(false);
    try {
      const r = await fetch(
        `/api/memory/file?expertId=${encodeURIComponent(expertId)}&path=${encodeURIComponent(relativePath)}`,
      );
      const j = await r.json();
      setOpenFile({ path: relativePath, content: j.content ?? "" });
    } catch {
      setOpenFile({ path: relativePath, content: "[failed to load]" });
    } finally {
      setOpenLoading(false);
    }
  }

  async function saveFileContent() {
    if (!openFile) return;
    setSaving(true);
    try {
      const r = await fetch(
        `/api/memory/file?expertId=${encodeURIComponent(expertId)}&path=${encodeURIComponent(openFile.path)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editDraft }),
        },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `${r.status}`);
      }
      setOpenFile({ path: openFile.path, content: editDraft });
      setEditing(false);
      // Trigger inventory refresh so size/preview updates in the list.
      fetch(`/api/memory/list?expertId=${encodeURIComponent(expertId)}`)
        .then((r) => r.json())
        .then((j: ListResponse) => setData(j))
        .catch(() => {});
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const isReadonly = (openFile?.path.startsWith("readonly/") || openFile?.path.startsWith("archived/")) ?? false;

  const grouped: Record<MemoryFileMeta["category"], MemoryFileMeta[]> = {
    readonly: [],
    editable: [],
    journal: [],
    archived: [],
  };
  for (const f of data?.files ?? []) grouped[f.category].push(f);

  return (
    <aside
      style={{ width: `${width}px` }}
      className={`relative shrink-0 border-l border-blend panel-surface flex flex-col ${isResizing ? "select-none" : ""}`}
    >
      <div
        onMouseDown={startResize}
        onDoubleClick={() => {
          setWidth(DEFAULT_WIDTH);
          window.localStorage.setItem(STORAGE_KEY, String(DEFAULT_WIDTH));
        }}
        className={`absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize group z-10 flex items-center justify-center`}
        title="Drag to resize · double-click to reset"
        aria-label="Resize memory panel"
      >
        <div className={`w-px h-full transition ${isResizing ? "bg-accent-400" : "bg-transparent group-hover:bg-ink-700"}`} />
        <div className={`absolute w-1 h-12 rounded-full transition ${isResizing ? "bg-accent-400" : "bg-transparent group-hover:bg-ink-600"}`} />
      </div>
      <div className="px-4 h-14 border-b border-blend flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold tracking-tight text-ink-100">Memory</div>
          <div className="text-[10.5px] text-ink-500 truncate">{expertName}</div>
        </div>
        <button
          onClick={onClose}
          className="text-ink-400 hover:text-ink-200 p-1 rounded-md hover:bg-ink-850"
          aria-label="Close memory panel"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {openFile ? (
          <div className="p-4 animate-fade-up">
            <div className="flex items-center justify-between mb-3 gap-2">
              <button
                onClick={() => { setOpenFile(null); setEditing(false); }}
                className="text-[11.5px] text-ink-400 hover:text-ink-200 inline-flex items-center gap-1 px-1 py-0.5 rounded transition"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 4l-4 4 4 4" />
                </svg>
                Back
              </button>
              {!editing && !isReadonly && (
                <button
                  onClick={() => { setEditDraft(openFile.content); setEditing(true); }}
                  className="text-[11.5px] text-ink-400 hover:text-ink-100 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-ink-900 transition"
                  title="Edit file"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 3l2 2L5.5 12.5l-3 .5.5-3L11 3z" />
                  </svg>
                  Edit
                </button>
              )}
              {isReadonly && (
                <span className="text-[10.5px] text-ink-500 italic">read-only</span>
              )}
            </div>
            <div className="text-[11.5px] font-mono text-ink-400 mb-3 truncate">{openFile.path}</div>
            {editing ? (
              <div>
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
                    if (e.key === "s" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveFileContent(); }
                  }}
                  style={{ backgroundColor: "#181228", color: "#faf6ff", caretColor: "#faf6ff" }}
                  className="w-full border border-ink-800 focus:border-accent-500/50 focus:ring-2 focus:ring-accent-500/15 rounded-lg p-3 text-[12.5px] font-mono resize-none focus:outline-none"
                  rows={Math.max(12, Math.min(40, editDraft.split("\n").length + 2))}
                  spellCheck={false}
                />
                <div className="flex items-center justify-end gap-2 mt-2">
                  <span className="mr-auto text-[10.5px] text-ink-500 font-mono">
                    <kbd className="text-ink-300">⌘S</kbd> save · <kbd className="text-ink-300">esc</kbd> cancel
                  </span>
                  <button
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="text-[12px] text-ink-300 hover:text-ink-100 px-2.5 py-1 rounded hover:bg-ink-900 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveFileContent}
                    disabled={saving || editDraft === openFile.content}
                    className="text-[12px] bg-gradient-to-br from-accent-400 to-accent-600 hover:from-accent-300 hover:to-accent-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-3 py-1 rounded transition shadow-sm"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="prose-chat text-[12.5px]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node, ...props }) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    ),
                  }}
                >
                  {openFile.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="p-5 text-sm text-ink-400">Loading…</div>
        ) : !data?.memoryDir ? (
          <div className="p-5 text-[13px] text-ink-400">
            This expert has no memory configured.
          </div>
        ) : data.files.length === 0 ? (
          <div className="p-5 text-[13px] text-ink-400">
            Memory directory exists but is empty.
            <div className="text-[10.5px] mt-2 font-mono text-ink-500 break-all">{data.memoryDir}</div>
          </div>
        ) : (
          (["readonly", "editable", "journal", "archived"] as const).map((cat) => {
            const files = grouped[cat];
            if (files.length === 0) return null;
            return (
              <div key={cat} className="px-3 py-3 border-b border-ink-900 last:border-b-0">
                <div className="px-2 mb-2 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[cat]}`} />
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-300 flex-1">
                    {CATEGORY_LABEL[cat]}
                  </div>
                  <span className="text-[10px] font-mono text-ink-400 px-1.5 py-0.5 rounded bg-ink-900 border border-ink-850">
                    {files.length}
                  </span>
                </div>
                <div className="px-2 pb-1 mb-1 text-[10.5px] text-ink-500 leading-snug">
                  {CATEGORY_HINT[cat]}
                </div>
                <div className="space-y-0.5">
                  {files.map((f) => (
                    <button
                      key={f.relativePath}
                      onClick={() => openFileContent(f.relativePath)}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-ink-900 hover:shadow-elev-1 border border-transparent hover:border-ink-800 transition-all duration-200 group"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12.5px] text-ink-100 font-medium truncate transition">
                          {f.name}
                        </span>
                        <span className="text-[9.5px] text-ink-500 font-mono shrink-0">
                          {(f.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      {f.preview && (
                        <div className="text-[11px] text-ink-400 line-clamp-1 mt-0.5">{f.preview}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
        {openLoading && <div className="p-3 text-xs text-ink-500">Loading file…</div>}
      </div>
    </aside>
  );
}
