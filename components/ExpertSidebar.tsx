"use client";

import { useEffect, useState } from "react";
import { expertColorClasses } from "@/lib/expertColor";
import { ExpertAvatar } from "./ExpertAvatar";
import UsageBar from "./UsageBar";
import ModelPill from "./ModelPill";
import type { ChatMeta } from "./ChatPanel";

interface VMStats {
  cpuLoadPct: number;
  cpuLoadAvg: number;
  cores: number;
  memUsedPct: number;
  memUsedGB: number;
  memTotalGB: number;
}

interface Expert {
  id: string;
  name: string;
  description: string;
  model: string;
}

export default function ExpertSidebar({
  experts,
  expertsLoading = false,
  selectedId,
  onSelect,
  autoRoute,
  onToggleAutoRoute,
  routerModel,
  onChangeRouterModel,
  onNewExpert,
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onSearch,
}: {
  experts: Expert[];
  expertsLoading?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  autoRoute: boolean;
  onToggleAutoRoute: (v: boolean) => void;
  routerModel: string | null;
  onChangeRouterModel: (model: string) => void;
  onNewExpert: () => void;
  chats: ChatMeta[];
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, title: string) => void;
  onSearch?: () => void;
}) {
  return (
    <aside className="w-80 shrink-0 border-r border-blend panel-surface flex flex-col">
      <div className="px-4 py-4 border-b border-blend flex items-center gap-3">
        <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shadow-elev-2 ring-1 ring-accent-300/20">
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 4.5h10M3 8h7M3 11.5h10" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-semibold tracking-tight text-ink-100 leading-none">
            Expert Chat
          </div>
          <div className="text-[10.5px] uppercase tracking-wider text-ink-500 mt-1.5 font-medium leading-none">
            v0.2 · multi-chat
          </div>
        </div>
      </div>

      {onSearch && (
        <button
          onClick={onSearch}
          className="mx-3 mt-3 flex items-center gap-2.5 px-3 py-2 rounded-lg bg-ink-900 hover:bg-ink-850 text-ink-400 hover:text-ink-200 border border-ink-800 hover:border-ink-700 transition-colors text-left"
          title="Search chats"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3 3" />
          </svg>
          <span className="flex-1 text-[12.5px]">Search…</span>
          <kbd className="text-[10px] font-mono bg-ink-850 border border-ink-800 rounded px-1.5 py-0.5">⌘K</kbd>
        </button>
      )}

      <label className="mx-3 mt-3 flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-ink-900 transition-colors cursor-pointer select-none">
        <span className="text-[14px] text-ink-200">Auto-route</span>
        <span
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all ${
            autoRoute
              ? "bg-gradient-to-r from-accent-500 to-accent-400 shadow-elev-1"
              : "bg-ink-800"
          }`}
        >
          <input
            type="checkbox"
            checked={autoRoute}
            onChange={(e) => onToggleAutoRoute(e.target.checked)}
            className="sr-only"
          />
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition shadow-sm ${
              autoRoute ? "translate-x-[18px]" : "translate-x-[3px]"
            }`}
          />
        </span>
      </label>
      {autoRoute && routerModel && (
        <div className="mx-3 flex items-center justify-between gap-2 px-3 pb-1">
          <span className="text-[12px] text-ink-500">Router model</span>
          <ModelPill model={routerModel} onChange={onChangeRouterModel} heading="Auto-route model" />
        </div>
      )}

      <div className="px-4 mt-5 mb-1.5 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink-500 font-semibold">Experts</span>
        <button
          onClick={onNewExpert}
          className="w-5 h-5 rounded text-ink-500 hover:text-ink-100 hover:bg-ink-900 flex items-center justify-center transition"
          title="New expert"
          aria-label="New expert"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {expertsLoading ? (
          <ExpertSkeletonList />
        ) : experts.length === 0 ? (
          <div className="text-sm text-ink-400 px-2 py-4">
            No experts found. Add a markdown file in <code className="text-ink-200 font-mono text-xs">data/experts/</code>.
          </div>
        ) : (
          experts.map((e) => {
            const isSelected = selectedId === e.id;
            return (
              <ExpertRow
                key={e.id}
                expert={e}
                isSelected={isSelected}
                onSelect={() => onSelect(e.id)}
                disabled={autoRoute}
                chats={isSelected ? chats : []}
                currentChatId={currentChatId}
                onSelectChat={onSelectChat}
                onNewChat={onNewChat}
                onDeleteChat={onDeleteChat}
                onRenameChat={onRenameChat}
              />
            );
          })
        )}
      </div>

      <div className="border-t border-blend p-3">
        <UsageBar />
        <VMStatsLine />
      </div>
    </aside>
  );
}

function ExpertRow({
  expert,
  isSelected,
  onSelect,
  disabled,
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
}: {
  expert: Expert;
  isSelected: boolean;
  onSelect: () => void;
  disabled: boolean;
  chats: ChatMeta[];
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, title: string) => void;
}) {
  const c = expertColorClasses(expert.id);

  return (
    <div>
      <button
        onClick={onSelect}
        disabled={disabled}
        className={`group relative w-full text-left rounded-lg px-2.5 py-2.5 transition-all duration-200 ${
          isSelected ? "bg-ink-850 shadow-elev-1" : "hover:bg-ink-900"
        } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
      >
        {isSelected && (
          <span className={`absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full ${c.bg}`} />
        )}
        <div className="flex items-start gap-3 pl-1">
          <ExpertAvatar
            id={expert.id}
            name={expert.name}
            className="shrink-0 mt-0.5 w-10 h-10 rounded-lg shadow-elev-1"
            textSizeClass="text-[12px]"
          />
          <div className="min-w-0 flex-1">
            <div className={`font-medium text-[14.5px] leading-snug ${isSelected ? "text-ink-100" : "text-ink-200 group-hover:text-ink-100"} transition-colors`}>
              {expert.name}
            </div>
            <div className="text-[12.5px] text-ink-400 mt-0.5 line-clamp-2 leading-snug">
              {expert.description}
            </div>
          </div>
        </div>
      </button>

      {isSelected && (
        <div className="mt-1 ml-1 pl-3 border-l border-ink-850 space-y-0.5">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">
              Conversations · {chats.length}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNewChat();
              }}
              className="text-ink-400 hover:text-ink-100 hover:bg-ink-900 rounded p-0.5 transition"
              title="New chat"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
          </div>
          {chats.length === 0 && (
            <div className="text-[12px] text-ink-500 px-2 py-1.5 italic">No conversations yet.</div>
          )}
          {chats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              isActive={chat.id === currentChatId}
              colorBg={c.bg}
              colorRing={c.ring}
              onSelect={() => onSelectChat(chat.id)}
              onDelete={() => onDeleteChat(chat.id)}
              onRename={(title) => onRenameChat(chat.id, title)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChatRow({
  chat,
  isActive,
  colorBg,
  colorRing,
  onSelect,
  onDelete,
  onRename,
}: {
  chat: ChatMeta;
  isActive: boolean;
  colorBg: string;
  colorRing: string;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);

  function commitRename() {
    setEditing(false);
    if (draft.trim() && draft !== chat.title) onRename(draft.trim());
    else setDraft(chat.title);
  }

  if (editing) {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${isActive ? "bg-ink-850" : "bg-ink-900"}`}>
        <span className={`shrink-0 w-1 h-1 rounded-full ${colorBg}`} />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(chat.title);
              setEditing(false);
            }
          }}
          className="flex-1 bg-transparent text-[12px] text-ink-100 border-none focus:outline-none min-w-0"
        />
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center gap-1.5 rounded transition cursor-pointer ${
        isActive ? `bg-ink-850 ring-1 ${colorRing}` : "hover:bg-ink-900"
      }`}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      <span className={`shrink-0 ml-2 w-1.5 h-1.5 rounded-full ${isActive ? colorBg : "bg-ink-700"}`} />
      <div className="flex-1 min-w-0 px-1 py-1.5">
        <div className={`text-[13px] truncate ${isActive ? "text-ink-100 font-medium" : "text-ink-300"}`}>
          {chat.title}
        </div>
        <div className="text-[10.5px] text-ink-500 truncate">
          {chat.msgCount > 0 ? `${chat.msgCount} msg${chat.msgCount === 1 ? "" : "s"}` : "empty"} · {formatRelative(chat.updatedAt)}
        </div>
      </div>
      <div className="shrink-0 mr-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="text-ink-500 hover:text-ink-100 hover:bg-ink-850 rounded p-0.5 transition"
          title="Rename chat"
          aria-label="Rename chat"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 3l2 2L5.5 12.5l-3 .5.5-3L11 3z" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete "${chat.title}"?`)) onDelete();
          }}
          className="text-ink-500 hover:text-rose-400 hover:bg-ink-850 rounded p-0.5 transition"
          title="Delete chat"
          aria-label="Delete chat"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 5h10M6 5V3h4v2M5 5l1 9h4l1-9" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function VMStatsLine() {
  const [stats, setStats] = useState<VMStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = () => {
      fetch("/api/vm-stats")
        .then((r) => r.json())
        .then((s: VMStats) => { if (!cancelled) setStats(s); })
        .catch(() => {});
    };
    fetchStats();
    const id = setInterval(fetchStats, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Color hint when load is high
  const cpuColor =
    stats == null ? "text-ink-500"
    : stats.cpuLoadPct < 50 ? "text-ink-400"
    : stats.cpuLoadPct < 80 ? "text-amber-400"
    : "text-rose-400";
  const memColor =
    stats == null ? "text-ink-500"
    : stats.memUsedPct < 70 ? "text-ink-400"
    : stats.memUsedPct < 90 ? "text-amber-400"
    : "text-rose-400";

  const tooltip = stats
    ? `CPU load avg: ${stats.cpuLoadAvg} on ${stats.cores} cores · RAM: ${stats.memUsedGB}/${stats.memTotalGB} GB · Claude Max OAuth`
    : "Loading VM stats…";

  return (
    <div className="flex items-center gap-2 mt-2.5 pl-1 font-mono text-[10px]" title={tooltip}>
      <span className="relative flex w-2 h-2">
        <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-50 animate-shimmer-slow" />
        <span className="relative rounded-full w-2 h-2 bg-emerald-400" />
      </span>
      <span className={cpuColor}>CPU {stats?.cpuLoadPct ?? "·"}%</span>
      <span className="text-ink-700">·</span>
      <span className={memColor}>MEM {stats?.memUsedPct ?? "·"}%</span>
      <span className="text-ink-700">·</span>
      <span className="text-ink-500">Max</span>
    </div>
  );
}

function ExpertSkeletonList() {
  return (
    <div className="space-y-0.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg px-2.5 py-2.5">
          <div className="flex items-start gap-3 pl-1">
            <div className="shrink-0 mt-0.5 w-10 h-10 rounded-lg bg-ink-850 animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className="h-3.5 rounded bg-ink-850 animate-pulse" style={{ width: `${50 + i * 12}%` }} />
              <div className="h-3 rounded bg-ink-900 animate-pulse" style={{ width: `${75 + i * 5}%` }} />
              <div className="h-3 rounded bg-ink-900 animate-pulse" style={{ width: `${55 - i * 8}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return d.toISOString().slice(0, 10);
}
