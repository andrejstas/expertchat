"use client";

import { useEffect, useRef, useState } from "react";
import { expertColorClasses } from "@/lib/expertColor";

interface SearchHit {
  expertId: string;
  chatId: string;
  chatTitle: string;
  updatedAt: string;
  matchRole: "user" | "assistant";
  snippet: string;
}

interface ExpertMeta {
  id: string;
  name: string;
}

export default function SearchPalette({
  isOpen,
  onClose,
  onPick,
  experts,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPick: (expertId: string, chatId: string) => void;
  experts: ExpertMeta[];
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setHits([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    if (!query.trim()) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/chats/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((j: { hits: SearchHit[] }) => {
          if (cancelled) return;
          setHits(j.hits ?? []);
          setActiveIdx(0);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, isOpen]);

  // Scroll active hit into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) {
        onPick(hit.expertId, hit.chatId);
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div
        className="w-[640px] max-w-[92vw] bg-ink-925 border border-ink-800 rounded-2xl shadow-elev-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-ink-850">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ink-500 shrink-0">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3 3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search chats…"
            className="flex-1 bg-transparent text-[15px] text-ink-100 py-3.5 focus:outline-none placeholder:text-ink-500"
          />
          {loading && (
            <span className="text-[10.5px] text-ink-500 font-mono">searching…</span>
          )}
          <kbd className="text-[10px] font-mono text-ink-500 px-1.5 py-0.5 rounded bg-ink-900 border border-ink-800">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1.5">
          {!query.trim() ? (
            <div className="px-5 py-8 text-center text-[13px] text-ink-500">
              Type to search across all chats from all experts.
            </div>
          ) : hits.length === 0 && !loading ? (
            <div className="px-5 py-8 text-center text-[13px] text-ink-500">
              No matches for "{query}".
            </div>
          ) : (
            hits.map((hit, i) => {
              const expert = experts.find((e) => e.id === hit.expertId);
              const c = expertColorClasses(hit.expertId);
              return (
                <button
                  key={`${hit.chatId}-${i}`}
                  data-idx={i}
                  onClick={() => { onPick(hit.expertId, hit.chatId); onClose(); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left px-4 py-2.5 transition flex items-start gap-3 ${
                    i === activeIdx ? "bg-ink-850" : "hover:bg-ink-900"
                  }`}
                >
                  <span className={`shrink-0 mt-1 w-2 h-2 rounded-full ${c.bg}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-[13px] text-ink-100 font-medium truncate">{hit.chatTitle}</span>
                      <span className="text-[10px] text-ink-500 font-mono shrink-0">{expert?.name ?? hit.expertId}</span>
                    </div>
                    <div className="text-[11.5px] text-ink-400 leading-snug line-clamp-2">
                      <span className={`mr-1.5 text-[10px] uppercase tracking-wider ${hit.matchRole === "user" ? "text-sky-400" : "text-ink-500"}`}>
                        {hit.matchRole === "user" ? "you" : "ai"}
                      </span>
                      {highlight(hit.snippet, query)}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {hits.length > 0 && (
          <div className="border-t border-ink-850 px-4 py-2 text-[10px] text-ink-500 font-mono flex items-center gap-3">
            <span><kbd className="text-ink-300">↑↓</kbd> navigate</span>
            <span><kbd className="text-ink-300">↵</kbd> open</span>
            <span><kbd className="text-ink-300">esc</kbd> close</span>
            <span className="ml-auto">{hits.length} match{hits.length === 1 ? "" : "es"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function highlight(text: string, query: string) {
  if (!query) return text;
  const lc = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let idx = lc.indexOf(q, cursor);
  let key = 0;
  while (idx !== -1) {
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <mark key={key++} className="bg-accent-500/30 text-accent-200 rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    cursor = idx + q.length;
    idx = lc.indexOf(q, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
