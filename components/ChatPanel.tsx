"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ExpertSidebar from "./ExpertSidebar";
import Message, { ToolEvent } from "./Message";
import type { Activity } from "./MessageActivity";
import type { LiveState, Stage } from "./LiveStatus";
import MemoryPanel from "./MemoryPanel";
import SearchPalette from "./SearchPalette";
import { expertColorClasses } from "@/lib/expertColor";
import { ExpertAvatar } from "./ExpertAvatar";
import ModelPill from "./ModelPill";
import NewExpertDialog from "./NewExpertDialog";
import type { FileChange } from "@/lib/types";

interface Expert {
  id: string;
  name: string;
  description: string;
  model: string;
  modelOverride: boolean;
}

export interface AttachmentRef {
  type: "image" | "pdf" | "text";
  path: string;
  relPath: string;
  name: string;
  size: number;
  mime: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  expertId?: string;
  toolEvents?: ToolEvent[];
  activity?: Activity;
  attachments?: AttachmentRef[];
  timestamp?: string;
  live?: LiveState;
  changes?: FileChange[];
}

function makeInitialLive(): LiveState {
  const now = Date.now();
  return {
    startedAt: now,
    lastEventAt: now,
    stages: [{ kind: "spawning", label: "⚙️ starting Claude", startedAt: now }],
  };
}

function closeOpenStages(stages: Stage[], at: number): void {
  for (const s of stages) if (s.endedAt == null) s.endedAt = at;
}

function compactNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

function basename(p: string): string {
  const cleaned = p.replace(/[/\\]+$/, "");
  const parts = cleaned.split(/[/\\]/);
  return parts[parts.length - 1] || p;
}

function summariseToolInput(name: string, input: any): { label: string; detail?: string } {
  const ICON: Record<string, string> = {
    Read: "📖", Edit: "✏️", Write: "📝",
    WebFetch: "🌐", WebSearch: "🔍",
  };
  const icon = ICON[name] ?? "🔧";
  if (!input || typeof input !== "object") return { label: `${icon} ${name}` };

  if (name === "Read" || name === "Edit" || name === "Write") {
    const fp = typeof input.file_path === "string" ? input.file_path : "";
    return { label: `${icon} ${name} ${fp ? basename(fp) : ""}`.trim() };
  }
  if (name === "WebFetch") {
    const url = typeof input.url === "string" ? input.url : "";
    let host = url;
    try { host = new URL(url).hostname; } catch {}
    return { label: `${icon} WebFetch ${host}`.trim() };
  }
  if (name === "WebSearch") {
    const q = typeof input.query === "string" ? input.query : "";
    const short = q.length > 40 ? q.slice(0, 37) + "…" : q;
    return { label: `${icon} Search "${short}"` };
  }
  return { label: `${icon} ${name}` };
}

function applyEventToLive(live: LiveState, evt: any): LiveState {
  const now = Date.now();
  const stages = live.stages.map((s) => ({ ...s }));

  if (evt.type === "heartbeat") {
    return { ...live, lastEventAt: now };
  }

  if (evt.type === "stage" && evt.kind === "spawning") {
    return { ...live, lastEventAt: now };
  }

  if (evt.type === "stage" && evt.kind === "connected") {
    closeOpenStages(stages, now);
    stages.push({ kind: "connected", label: "🔗 awaiting first token", startedAt: now });
    return { ...live, lastEventAt: now, stages };
  }

  if (evt.type === "thinking_delta") {
    const last = stages[stages.length - 1];
    if (last && last.kind === "thinking" && last.endedAt == null) {
      const chars = (last as any)._chars + (evt.delta?.length ?? 0);
      (last as any)._chars = chars;
      last.detail = `${compactNum(chars)} chars`;
    } else {
      closeOpenStages(stages, now);
      const newStage: Stage & { _chars?: number } = {
        kind: "thinking",
        label: "💭 thinking",
        startedAt: now,
        detail: `${compactNum(evt.delta?.length ?? 0)} chars`,
      };
      newStage._chars = evt.delta?.length ?? 0;
      stages.push(newStage);
    }
    return { ...live, lastEventAt: now, stages };
  }

  if (evt.type === "tool_use") {
    closeOpenStages(stages, now);
    const { label } = summariseToolInput(evt.name, evt.input);
    stages.push({
      kind: "tool",
      label,
      startedAt: now,
    });
    (stages[stages.length - 1] as any)._toolId = evt.id;
    return { ...live, lastEventAt: now, stages };
  }

  if (evt.type === "tool_result") {
    for (let i = stages.length - 1; i >= 0; i--) {
      const s: any = stages[i];
      if (s.kind === "tool" && s._toolId === evt.toolUseId && s.endedAt == null) {
        s.endedAt = now;
        const len = typeof evt.content === "string" ? evt.content.length : 0;
        s.detail = evt.isError ? "error" : `${compactNum(len)} chars`;
        break;
      }
    }
    return { ...live, lastEventAt: now, stages };
  }

  if (evt.type === "text") {
    const last = stages[stages.length - 1];
    if (last && last.kind === "text" && last.endedAt == null) {
      const chars = (last as any)._chars + (evt.delta?.length ?? 0);
      (last as any)._chars = chars;
      last.detail = `~${compactNum(Math.round(chars / 4))} tok`;
    } else {
      closeOpenStages(stages, now);
      const chars = evt.delta?.length ?? 0;
      const newStage: Stage & { _chars?: number } = {
        kind: "text",
        label: "✍️ writing response",
        startedAt: now,
        detail: `~${compactNum(Math.round(chars / 4))} tok`,
      };
      newStage._chars = chars;
      stages.push(newStage);
    }
    return { ...live, lastEventAt: now, stages };
  }

  if (evt.type === "error") {
    closeOpenStages(stages, now);
    stages.push({
      kind: "error",
      label: `❌ error: ${String(evt.message ?? "unknown").slice(0, 80)}`,
      startedAt: now,
    });
    return { ...live, lastEventAt: now, stages };
  }

  return { ...live, lastEventAt: now };
}

const ALLOWED_MIMES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/markdown",
  "text/x-markdown", "application/markdown", "application/x-markdown",
]);
const ALLOWED_EXTS = new Set([
  "png", "jpg", "jpeg", "webp", "gif", "pdf", "txt", "md", "markdown",
]);
const MAX_BYTES = 5 * 1024 * 1024;

function isAllowedFile(f: File): boolean {
  if (ALLOWED_MIMES.has(f.type)) return true;
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  return ALLOWED_EXTS.has(ext);
}

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string | null;
}

interface QueuedMsg {
  id: string;
  text: string;
  files: PendingFile[];
}

const MAX_QUEUE = 3;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORT_LEVELS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export interface ChatMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  msgCount: number;
  effort: Effort;
}

const TOKEN_BUDGET = 50_000;
const STORAGE_LAST_EXPERT = "expert-chat:lastExpert";
const STORAGE_LAST_CHAT_PREFIX = "expert-chat:lastChat:";

function EffortPill({
  effort,
  onChange,
  disabled,
}: {
  effort: Effort;
  onChange: (e: Effort) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dotColor =
    effort === "low" ? "bg-emerald-400"
    : effort === "medium" ? "bg-sky-400"
    : effort === "high" ? "bg-amber-400"
    : effort === "xhigh" ? "bg-orange-400"
    : "bg-rose-400";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 text-[10.5px] text-ink-300 px-2 py-1 rounded-md bg-ink-900 border border-blend hover:border-ink-700 disabled:opacity-50 transition"
        title="Effort level"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="font-mono">effort: {effort}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-ink-900 border border-ink-800 rounded-lg shadow-elev-3 py-1 min-w-[110px]">
            {EFFORT_LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => { onChange(lvl); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition ${
                  lvl === effort ? "bg-accent-500/10 text-ink-100" : "hover:bg-ink-850 text-ink-300"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  lvl === "low" ? "bg-emerald-400"
                  : lvl === "medium" ? "bg-sky-400"
                  : lvl === "high" ? "bg-amber-400"
                  : lvl === "xhigh" ? "bg-orange-400"
                  : "bg-rose-400"
                }`} />
                <span className="font-mono">{lvl}</span>
                {lvl === effort && <span className="ml-auto text-accent-300">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function rememberExpert(id: string) {
  try { window.localStorage.setItem(STORAGE_LAST_EXPERT, id); } catch {}
}
function rememberChat(expertId: string, chatId: string) {
  try { window.localStorage.setItem(STORAGE_LAST_CHAT_PREFIX + expertId, chatId); } catch {}
}
function recallExpert(): string | null {
  try { return window.localStorage.getItem(STORAGE_LAST_EXPERT); } catch { return null; }
}
function recallChat(expertId: string): string | null {
  try { return window.localStorage.getItem(STORAGE_LAST_CHAT_PREFIX + expertId); } catch { return null; }
}

// Streams emit one event per token; rendering each one re-parses the whole
// reply's markdown, which is quadratic in reply length. Coalesce to one render per frame.
function createFrameBatcher() {
  let frame: number | null = null;
  let pending: (() => void) | null = null;
  return {
    schedule(update: () => void) {
      pending = update;
      if (frame == null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          const run = pending;
          pending = null;
          run?.();
        });
      }
    },
    flush() {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      const run = pending;
      pending = null;
      run?.();
    },
  };
}

function buildPath(expertId: string | null, chatId: string | null): string {
  if (!expertId) return "/";
  if (!chatId) return `/c/${expertId}`;
  return `/c/${expertId}/${chatId}`;
}

function parsePath(pathname: string): { expertId: string | null; chatId: string | null } {
  const m = pathname.match(/^\/c\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!m) return { expertId: null, chatId: null };
  return { expertId: m[1], chatId: m[2] ?? null };
}

function estimateTokens(messages: Msg[]): number {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  return Math.round(totalChars / 3.5);
}

export default function ChatPanel({
  initialExpertId,
  initialChatId,
}: {
  initialExpertId: string | null;
  initialChatId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [experts, setExperts] = useState<Expert[]>([]);
  const [expertsLoading, setExpertsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialExpertId);
  const [autoRoute, setAutoRoute] = useState(false);
  const [routerModel, setRouterModel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [routedId, setRoutedId] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(true);
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newExpertOpen, setNewExpertOpen] = useState(false);

  // Multi-chat state
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(initialChatId);
  const [currentEffort, setCurrentEffort] = useState<Effort>("xhigh");
  const [chatsRefresh, setChatsRefresh] = useState(0);

  // ↑/↓ history navigation
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef("");

  // Edit-and-resend state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Drag-drop attachments
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [queue, setQueue] = useState<QueuedMsg[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickToBottomRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const messageCacheRef = useRef<Map<string, Msg[]>>(new Map());

  useEffect(() => {
    if (currentChatId) messageCacheRef.current.set(currentChatId, messages);
  }, [currentChatId, messages]);

  // Next.js adds the new page's icon link on client navigation but leaves the old
  // one in <head>, so the tab can keep the previous expert's favicon.
  useEffect(() => {
    const href = selectedId ? `/api/expert-icon/${selectedId}` : "/icon.svg";
    const sync = () => {
      document.querySelectorAll('link[rel="icon"]').forEach((l) => {
        if (l.getAttribute("href") !== href) l.setAttribute("href", href);
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, [selectedId]);

  useEffect(() => {
    fetch("/api/experts")
      .then((r) => r.json())
      .then((list: Expert[]) => {
        setExperts(list);
        if (list.length === 0) return;
        if (!selectedId) {
          const saved = recallExpert();
          const target = saved && list.find((e) => e.id === saved) ? saved : list[0].id;
          router.replace(buildPath(target, null));
        } else if (!list.find((e) => e.id === selectedId)) {
          showToast(`Expert "${selectedId}" not found`);
          router.replace("/");
        } else {
          rememberExpert(selectedId);
        }
      })
      .catch(console.error)
      .finally(() => setExpertsLoading(false));
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { routerModel: string }) => setRouterModel(s.routerModel))
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First-mount only: pathname-sync effect's "differs from state" check skips
  // load when state was hydrated from the URL on initial render.
  useEffect(() => {
    if (initialExpertId && initialChatId) {
      void loadChat(initialExpertId, initialChatId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const { expertId: urlExpert, chatId: urlChat } = parsePath(pathname);
    if (!urlExpert) return;

    if (urlExpert !== selectedId) {
      setSelectedId(urlExpert);
      rememberExpert(urlExpert);
    }
    if (urlExpert !== selectedId || urlChat !== currentChatId) returnQueueToInput();
    if (urlChat !== currentChatId) {
      if (urlChat) {
        void loadChat(urlExpert, urlChat);
      } else {
        setCurrentChatId(null);
        setMessages([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetch(`/api/chats/list?expertId=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then(async (data: { chats: ChatMeta[] }) => {
        if (cancelled) return;
        setChats(data.chats);

        const { chatId: urlChat, expertId: urlExpert } = parsePath(pathname);
        if (urlChat && data.chats.find((c) => c.id === urlChat)) return;
        if (urlChat && urlExpert === selectedId) {
          showToast(`Chat "${urlChat}" not found`);
          router.replace(buildPath(selectedId, null));
          return;
        }
        const found = data.chats.find((c) => c.id === currentChatId);
        if (!found) {
          const saved = recallChat(selectedId);
          const target =
            saved && data.chats.find((c) => c.id === saved)
              ? saved
              : data.chats[0]?.id;
          if (target) {
            await loadChat(selectedId, target);
            router.replace(buildPath(selectedId, target));
          } else {
            const newId = await startNewChat(selectedId);
            router.replace(buildPath(selectedId, newId));
          }
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, chatsRefresh]);

  async function loadChat(expertId: string, chatId: string) {
    const cached = messageCacheRef.current.get(chatId);
    if (cached) {
      setMessages(cached);
      setCurrentChatId(chatId);
      rememberChat(expertId, chatId);
      setHistoryIndex(-1);
      stickToBottomRef.current = true;
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }

    try {
      const r = await fetch(
        `/api/chats/get?expertId=${encodeURIComponent(expertId)}&id=${encodeURIComponent(chatId)}`,
      );
      if (!r.ok) return;
      const chat = await r.json();
      const loaded: Msg[] = (chat.messages ?? []).map((m: any) => ({
        role: m.role,
        content: m.content,
        expertId: m.role === "assistant" ? expertId : undefined,
        attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
        timestamp: typeof m.timestamp === "string" ? m.timestamp : undefined,
        changes: Array.isArray(m.changes) ? m.changes : undefined,
      }));
      messageCacheRef.current.set(chatId, loaded);
      setMessages(loaded);
      setCurrentChatId(chatId);
      setCurrentEffort(chat.effort ?? "xhigh");
      rememberChat(expertId, chatId);
      if (!cached) {
        setHistoryIndex(-1);
        stickToBottomRef.current = true;
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function startNewChat(expertId: string, navMode: "push" | "replace" = "replace") {
    const r = await fetch(`/api/chats/create?expertId=${encodeURIComponent(expertId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const meta: ChatMeta = await r.json();
    setMessages([]);
    setCurrentChatId(meta.id);
    setCurrentEffort(meta.effort ?? "xhigh");
    rememberChat(expertId, meta.id);
    setHistoryIndex(-1);
    setChatsRefresh((k) => k + 1);
    if (navMode === "push") router.push(buildPath(expertId, meta.id));
    else router.replace(buildPath(expertId, meta.id));
    return meta.id;
  }

  async function deleteChatAction(chatId: string) {
    if (!selectedId) return;
    await fetch(
      `/api/chats/delete?expertId=${encodeURIComponent(selectedId)}&id=${encodeURIComponent(chatId)}`,
      { method: "DELETE" },
    );
    messageCacheRef.current.delete(chatId);
    setChatsRefresh((k) => k + 1);
    if (currentChatId === chatId) {
      router.replace(buildPath(selectedId, null));
    }
  }

  async function renameChatAction(chatId: string, title: string) {
    if (!selectedId) return;
    await fetch(
      `/api/chats/rename?expertId=${encodeURIComponent(selectedId)}&id=${encodeURIComponent(chatId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    setChatsRefresh((k) => k + 1);
  }

  async function persistMessage(
    expertId: string,
    chatId: string,
    msg: { role: "user" | "assistant"; content: string; attachments?: AttachmentRef[]; changes?: FileChange[] },
  ) {
    try {
      await fetch(
        `/api/chats/append?expertId=${encodeURIComponent(expertId)}&id=${encodeURIComponent(chatId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg),
        },
      );
    } catch (e) {
      console.error("persist failed", e);
    }
  }

  // Scroll handling.
  //
  // Unstick IMMEDIATELY on user-initiated upward intent (wheel up, ArrowUp /
  // PageUp / Home, touch-drag downward). Otherwise during streaming the
  // smooth-follow rAF would yank the user back before the threshold check
  // could mark them non-sticky.
  //
  // Re-stick automatically only via the scroll event when the user has
  // scrolled back near the bottom on their own.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let touchStartY: number | null = null;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stickToBottomRef.current = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home") {
        stickToBottomRef.current = false;
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY == null) return;
      const y = e.touches[0]?.clientY;
      if (y != null && y - touchStartY > 4) {
        // finger moved DOWN on screen → list scrolls up → unstick
        stickToBottomRef.current = false;
      }
    };
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      // Only positive direction (re-stick when the user reaches the bottom).
      if (distanceFromBottom < 30) stickToBottomRef.current = true;
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Smooth follow-to-bottom: lerp 25% of remaining distance per frame.
  // Re-runs whenever new content arrives; if user scrolled away, bails.
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    if (rafRef.current != null) return; // already animating, will pick up new height
    const tick = () => {
      const el = scrollRef.current;
      if (!el || !stickToBottomRef.current) {
        rafRef.current = null;
        return;
      }
      const maxScroll = el.scrollHeight - el.clientHeight;
      const current = el.scrollTop;
      const delta = maxScroll - current;
      if (delta < 0.5) {
        el.scrollTop = maxScroll;
        rafRef.current = null;
        return;
      }
      el.scrollTop = current + delta * 0.25;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [messages]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Cmd+K / Ctrl+K opens search palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function jumpToChat(targetExpertId: string, targetChatId: string) {
    router.push(buildPath(targetExpertId, targetChatId));
  }

  const expertById = useCallback(
    (id: string | null) => experts.find((e) => e.id === id),
    [experts],
  );

  function enqueue() {
    const text = input.trim();
    if (!text && pending.length === 0) return;
    if (queue.length >= MAX_QUEUE) {
      showToast(`Up to ${MAX_QUEUE} messages can wait in the queue`);
      return;
    }
    setQueue((q) => [...q, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, files: pending }]);
    setInput("");
    setPending([]);
    setHistoryIndex(-1);
    draftRef.current = "";
  }

  function removeQueued(id: string) {
    setQueue((q) => {
      const target = q.find((x) => x.id === id);
      target?.files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      return q.filter((x) => x.id !== id);
    });
  }

  function returnQueueToInput() {
    if (queue.length === 0) return;
    setInput((cur) => [...queue.map((q) => q.text), cur].filter((t) => t.trim()).join("\n\n"));
    setPending((p) => [...queue.flatMap((q) => q.files), ...p]);
    setQueue([]);
  }

  useEffect(() => {
    if (busy || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    void send(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, queue]);

  async function send(queued?: QueuedMsg) {
    if (busy && !queued) {
      enqueue();
      return;
    }
    const text = (queued ? queued.text : input).trim();
    const files = queued ? queued.files : pending;
    if (busy) return;
    if (!text && files.length === 0) return;

    setBusy(true);
    if (!queued) {
      setInput("");
      setHistoryIndex(-1);
      draftRef.current = "";
    }
    stickToBottomRef.current = true;
    const streamBatch = createFrameBatcher();

    try {
      let expertId = selectedId;
      if (autoRoute) {
        const r = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const j = await r.json();
        expertId = j.expertId;
        setRoutedId(expertId);
      }

      if (!expertId) throw new Error("No expert selected");

      // Make sure we have a chat to persist into BEFORE upload (need chatId for path).
      let chatId = currentChatId;
      if (!chatId) {
        chatId = await startNewChat(expertId);
      }

      // Upload pending attachments first (so we have on-disk paths to reference).
      let attachments: AttachmentRef[] = [];
      if (files.length > 0) {
        try {
          attachments = await uploadFiles(expertId, chatId, files);
          if (!queued) setPending([]);
        } catch (e) {
          showToast((e as Error).message);
          if (queued) {
            setInput((cur) => [queued.text, cur].filter((t) => t.trim()).join("\n\n"));
            setPending((p) => [...queued.files, ...p]);
          }
          setBusy(false);
          return;
        }
      }

      const userMsg: Msg = {
        role: "user",
        content: text,
        attachments: attachments.length ? attachments : undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages((m) => [...m, userMsg]);

      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
        timestamp: m.timestamp,
      }));

      // Persist user message immediately.
      void persistMessage(expertId, chatId, { role: "user", content: text, attachments });

      let live: LiveState = makeInitialLive();
      setMessages((m) => [...m, { role: "assistant", content: "", expertId: expertId!, toolEvents: [], timestamp: new Date().toISOString(), live }]);

      const ctl = new AbortController();
      abortRef.current = ctl;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertId, chatId, messages: history, effort: currentEffort }),
        signal: ctl.signal,
      });

      if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      const activity: Activity = { thinking: "", tools: [] };
      let changes: FileChange[] | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: any;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "text") {
            acc += evt.delta ?? "";
          } else if (evt.type === "thinking_delta") {
            activity.thinking += evt.delta ?? "";
          } else if (evt.type === "tool_use") {
            activity.tools.push({ id: evt.id, name: evt.name, input: evt.input });
          } else if (evt.type === "tool_result") {
            const tool = activity.tools.find((t) => t.id === evt.toolUseId);
            if (tool) {
              tool.result = evt.content;
              tool.isError = evt.isError;
              // If the model just modified a memory file, refresh the panel live.
              if (!evt.isError && (tool.name === "Write" || tool.name === "Edit")) {
                setMemoryRefreshKey((k) => k + 1);
              }
            }
          } else if (evt.type === "changes") {
            changes = Array.isArray(evt.changes) ? evt.changes : undefined;
          } else if (evt.type === "error") {
            acc += `\n\n[error: ${evt.message}]`;
          }
          live = applyEventToLive(live, evt);
          const snapshot = {
            content: acc,
            activity: { thinking: activity.thinking, tools: [...activity.tools] },
            live,
            changes,
          };
          streamBatch.schedule(() => setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { ...copy[copy.length - 1], ...snapshot };
            return copy;
          }));
        }
      }
      streamBatch.flush();

      setMessages((m) => {
        const copy = [...m];
        if (copy.length && copy[copy.length - 1].role === "assistant") {
          copy[copy.length - 1] = { ...copy[copy.length - 1], live: undefined };
        }
        return copy;
      });

      // Persist assistant message (text only — activity is live-only, not persisted).
      if (acc || changes) await persistMessage(expertId, chatId, { role: "assistant", content: acc, changes });
      // Refresh chat list (for updated title / timestamp).
      setChatsRefresh((k) => k + 1);
    } catch (err) {
      streamBatch.flush();
      const e = err as Error;
      const aborted = e.name === "AbortError" || (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError");
      if (aborted) {
        // Stopped by user — keep whatever streamed in. Persist if we got anything.
        const partial = (messages[messages.length - 0] as Msg | undefined); // placeholder, we look at state via setMessages closure
        const last = messages.at(-1);
        // We rely on the latest state in setMessages. Fetch the final acc from state via setMessages callback.
        setMessages((m) => {
          const copy = [...m];
          if (copy.length && copy[copy.length - 1].role === "assistant") {
            const c = copy[copy.length - 1].content;
            if (c || copy[copy.length - 1].changes) {
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: c + " ⏹", live: undefined };
              const eId = copy[copy.length - 1].expertId;
              const cId = currentChatId;
              if (eId && cId) {
                void persistMessage(eId, cId, { role: "assistant", content: c + " ⏹", changes: copy[copy.length - 1].changes });
              }
            } else {
              // Nothing streamed → drop the empty placeholder.
              copy.pop();
            }
          }
          return copy;
        });
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `[error] ${e.message}` },
        ]);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setMemoryRefreshKey((k) => k + 1);
    }
  }

  function stopGeneration() {
    returnQueueToInput();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }

  // ===== Attachments =====

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000);
  }

  function addFiles(files: FileList | File[]) {
    const next: PendingFile[] = [];
    for (const f of Array.from(files)) {
      if (!isAllowedFile(f)) {
        showToast(`Unsupported type: ${f.name} (${f.type || "unknown"})`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        showToast(`Too large: ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB > 5 MB)`);
        continue;
      }
      const previewUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
      next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: f, previewUrl });
    }
    if (next.length > 0) setPending((p) => [...p, ...next]);
  }

  function removePending(id: string) {
    setPending((p) => {
      const target = p.find((x) => x.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return p.filter((x) => x.id !== id);
    });
  }

  async function uploadFiles(expertId: string, chatId: string, files: PendingFile[]): Promise<AttachmentRef[]> {
    const out: AttachmentRef[] = [];
    for (const p of files) {
      const fd = new FormData();
      fd.append("file", p.file);
      const r = await fetch(
        `/api/attachments/upload?expertId=${encodeURIComponent(expertId)}&chatId=${encodeURIComponent(chatId)}`,
        { method: "POST", body: fd },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `upload failed (${r.status}) for ${p.file.name}`);
      }
      const meta: AttachmentRef = await r.json();
      out.push(meta);
    }
    for (const p of files) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    return out;
  }

  function userMessages(): string[] {
    return messages.filter((m) => m.role === "user").map((m) => m.content);
  }

  function startEdit(index: number) {
    if (busy) return;
    if (messages[index]?.role !== "user") return;
    setEditingIndex(index);
    setEditDraft(messages[index].content);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditDraft("");
  }

  async function resendFrom(atIndex: number, newContent: string) {
    if (busy) return;
    const expertId = autoRoute ? routedId : selectedId;
    if (!expertId || !currentChatId) return;

    // Truncate locally: keep [0..idx-1], place new content at idx, drop rest.
    const newMessages: Msg[] = [
      ...messages.slice(0, atIndex),
      { ...messages[atIndex], content: newContent },
    ];
    setMessages(newMessages);

    // Persist truncate+replace on disk.
    try {
      await fetch(
        `/api/chats/edit?expertId=${encodeURIComponent(expertId)}&id=${encodeURIComponent(currentChatId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ atIndex, newContent }),
        },
      );
    } catch (e) {
      console.error("edit persist failed", e);
    }

    // Stream a fresh assistant reply from the new history.
    setBusy(true);
    stickToBottomRef.current = true;
    const streamBatch = createFrameBatcher();
    let live: LiveState = makeInitialLive();
    setMessages((m) => [...m, { role: "assistant", content: "", expertId, toolEvents: [], timestamp: new Date().toISOString(), live }]);

    try {
      const history = newMessages.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
      const ctl = new AbortController();
      abortRef.current = ctl;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expertId, chatId: currentChatId, messages: history, effort: currentEffort }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      const activity: Activity = { thinking: "", tools: [] };
      let changes: FileChange[] | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: any;
          try { evt = JSON.parse(line); } catch { continue; }
          if (evt.type === "text") acc += evt.delta ?? "";
          else if (evt.type === "thinking_delta") activity.thinking += evt.delta ?? "";
          else if (evt.type === "tool_use") activity.tools.push({ id: evt.id, name: evt.name, input: evt.input });
          else if (evt.type === "tool_result") {
            const t = activity.tools.find((x) => x.id === evt.toolUseId);
            if (t) {
              t.result = evt.content;
              t.isError = evt.isError;
              if (!evt.isError && (t.name === "Write" || t.name === "Edit")) {
                setMemoryRefreshKey((k) => k + 1);
              }
            }
          }
          else if (evt.type === "changes") changes = Array.isArray(evt.changes) ? evt.changes : undefined;
          else if (evt.type === "error") acc += `\n\n[error: ${evt.message}]`;
          live = applyEventToLive(live, evt);
          const snapshot = {
            content: acc,
            activity: { thinking: activity.thinking, tools: [...activity.tools] },
            live,
            changes,
          };
          streamBatch.schedule(() => setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { ...copy[copy.length - 1], ...snapshot };
            return copy;
          }));
        }
      }
      streamBatch.flush();

      setMessages((m) => {
        const copy = [...m];
        if (copy.length && copy[copy.length - 1].role === "assistant") {
          copy[copy.length - 1] = { ...copy[copy.length - 1], live: undefined };
        }
        return copy;
      });

      if (acc || changes) await persistMessage(expertId, currentChatId, { role: "assistant", content: acc, changes });
      setChatsRefresh((k) => k + 1);
    } catch (err) {
      streamBatch.flush();
      const e = err as Error;
      const aborted = e.name === "AbortError" || (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError");
      if (aborted) {
        setMessages((m) => {
          const copy = [...m];
          if (copy.length && copy[copy.length - 1].role === "assistant") {
            const c = copy[copy.length - 1].content;
            if (c || copy[copy.length - 1].changes) {
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: c + " ⏹", live: undefined };
              const eId = copy[copy.length - 1].expertId;
              if (eId && currentChatId) {
                void persistMessage(eId, currentChatId, { role: "assistant", content: c + " ⏹", changes: copy[copy.length - 1].changes });
              }
            } else {
              copy.pop();
            }
          }
          return copy;
        });
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `[error] ${e.message}` },
        ]);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setMemoryRefreshKey((k) => k + 1);
    }
  }

  async function saveEdit() {
    if (editingIndex === null) return;
    const newContent = editDraft.trim();
    if (!newContent) return cancelEdit();
    const idx = editingIndex;
    setEditingIndex(null);
    setEditDraft("");
    await resendFrom(idx, newContent);
  }

  async function changeEffort(effort: Effort) {
    setCurrentEffort(effort);
    if (selectedId && currentChatId) {
      try {
        await fetch(
          `/api/chats/effort?expertId=${encodeURIComponent(selectedId)}&id=${encodeURIComponent(currentChatId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ effort }),
          },
        );
      } catch (e) {
        console.error("effort persist failed", e);
      }
    }
  }

  async function saveSettings(patch: { expertModel?: string; routerModel?: string }) {
    try {
      const r = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()) as { expertModel: string; routerModel: string };
    } catch (e) {
      console.error("settings persist failed", e);
      showToast("Couldn't save model setting");
      return null;
    }
  }

  async function changeExpertModel(model: string) {
    const s = await saveSettings({ expertModel: model });
    if (s) setExperts((list) => list.map((e) => (e.modelOverride ? e : { ...e, model: s.expertModel })));
  }

  async function handleExpertCreated(id: string) {
    setNewExpertOpen(false);
    try {
      const list: Expert[] = await (await fetch("/api/experts")).json();
      setExperts(list);
    } catch (e) {
      console.error(e);
    }
    router.push(buildPath(id, null));
  }

  async function changeRouterModel(model: string) {
    const s = await saveSettings({ routerModel: model });
    if (s) setRouterModel(s.routerModel);
  }

  async function regenerateAt(idx: number) {
    if (busy) return;
    const msg = messages[idx];
    if (!msg || msg.role !== "user") return;
    await resendFrom(idx, msg.content);
  }

  function isCursorOnFirstLine(ta: HTMLTextAreaElement): boolean {
    const beforeCursor = ta.value.slice(0, ta.selectionStart ?? 0);
    return !beforeCursor.includes("\n");
  }

  function isCursorOnLastLine(ta: HTMLTextAreaElement): boolean {
    const afterCursor = ta.value.slice(ta.selectionEnd ?? ta.value.length);
    return !afterCursor.includes("\n");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === "Escape" && historyIndex !== -1) {
      e.preventDefault();
      setInput(draftRef.current);
      setHistoryIndex(-1);
      return;
    }
    if (e.key === "ArrowUp" && isCursorOnFirstLine(e.currentTarget)) {
      const userMsgs = userMessages();
      if (userMsgs.length === 0) return;
      e.preventDefault();
      if (historyIndex === -1) draftRef.current = input;
      const newIndex = Math.min(userMsgs.length - 1, historyIndex + 1);
      setHistoryIndex(newIndex);
      setInput(userMsgs[userMsgs.length - 1 - newIndex]);
      return;
    }
    if (e.key === "ArrowDown" && isCursorOnLastLine(e.currentTarget) && historyIndex !== -1) {
      const userMsgs = userMessages();
      e.preventDefault();
      const newIndex = historyIndex - 1;
      if (newIndex < 0) {
        setHistoryIndex(-1);
        setInput(draftRef.current);
      } else {
        setHistoryIndex(newIndex);
        setInput(userMsgs[userMsgs.length - 1 - newIndex]);
      }
    }
  }

  const activeExpert = expertById(autoRoute ? routedId : selectedId);
  const activeColors = activeExpert ? expertColorClasses(activeExpert.id) : null;
  const memoryHostExpert = expertById(selectedId);

  const tokenCount = estimateTokens(messages);
  const tokenPct = Math.min(100, Math.round((tokenCount / TOKEN_BUDGET) * 100));
  const tokenBarColor =
    tokenPct < 30 ? "bg-emerald-500"
    : tokenPct < 60 ? "bg-accent-500"
    : tokenPct < 80 ? "bg-amber-500"
    : "bg-rose-500";

  return (
    <div className="flex h-screen">
      <ExpertSidebar
        experts={experts}
        expertsLoading={expertsLoading}
        selectedId={selectedId}
        onSelect={(id) => router.push(buildPath(id, null))}
        autoRoute={autoRoute}
        onToggleAutoRoute={setAutoRoute}
        routerModel={routerModel}
        onChangeRouterModel={changeRouterModel}
        onNewExpert={() => setNewExpertOpen(true)}
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={(chatId) => selectedId && router.push(buildPath(selectedId, chatId))}
        onNewChat={() => selectedId && startNewChat(selectedId, "push")}
        onDeleteChat={deleteChatAction}
        onRenameChat={renameChatAction}
        onSearch={() => setSearchOpen(true)}
      />

      <main className="flex-1 flex flex-col min-w-0 chat-surface">
        <header className="border-b border-blend px-6 h-16 flex items-center gap-3">
          {activeExpert && activeColors ? (
            <>
              <ExpertAvatar
                id={activeExpert.id}
                name={activeExpert.name}
                className="w-9 h-9 rounded-lg shadow-elev-1"
                textSizeClass="text-[11.5px]"
              />
              <div className="text-[15px] leading-tight">
                <div className="font-medium text-ink-100">{activeExpert.name}</div>
                <div className="text-[11px] text-ink-500 mt-0.5">
                  {autoRoute ? (routedId ? "Auto-routed" : "Auto-route — pick on send") : "Talking to expert"}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <EffortPill effort={currentEffort} onChange={changeEffort} disabled={busy} />
                <ModelPill
                  model={activeExpert.model}
                  onChange={activeExpert.modelOverride ? undefined : changeExpertModel}
                  heading="Model for all experts"
                  disabled={busy}
                />
                <button
                  onClick={() => setMemoryOpen((v) => !v)}
                  className={`p-1.5 rounded-md transition ${
                    memoryOpen
                      ? "bg-accent-500/15 text-accent-300"
                      : "text-ink-400 hover:text-ink-100 hover:bg-ink-900"
                  }`}
                  aria-label="Toggle memory panel"
                  title={memoryOpen ? "Hide memory" : "Show memory"}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 2h7l3 3v9H3V2z" />
                    <path d="M10 2v4h3" />
                    <path d="M5.5 8.5h5M5.5 11h5" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-ink-400">
              {autoRoute ? "Auto-route enabled" : "No expert selected"}
            </div>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 && activeExpert && activeColors && (
              <div className="text-center mt-20 animate-fade-up">
                <div className="relative inline-block mb-6">
                  <ExpertAvatar
                    id={activeExpert.id}
                    name={activeExpert.name}
                    className="w-16 h-16 rounded-2xl shadow-elev-3 ring-4 ring-white/[0.04]"
                    textSizeClass="text-[15px]"
                  />
                  <span className={`absolute inset-0 rounded-2xl ${activeColors.bg} opacity-25 blur-xl -z-10`} />
                </div>
                <h2 className="text-[22px] font-semibold tracking-tight text-ink-100 mb-2">
                  {activeExpert.name}
                </h2>
                <p className="text-ink-400 text-[13.5px] max-w-md mx-auto leading-relaxed">
                  {activeExpert.description}
                </p>
                <div className="mt-7 inline-flex items-center gap-1.5 text-[11px] text-ink-500 px-3 py-1.5 rounded-full bg-ink-900 border border-blend">
                  <kbd className="font-mono text-[10px] text-ink-300">↵</kbd>
                  <span>send</span>
                  <span className="text-ink-700">·</span>
                  <kbd className="font-mono text-[10px] text-ink-300">⇧↵</kbd>
                  <span>new line</span>
                  <span className="text-ink-700">·</span>
                  <kbd className="font-mono text-[10px] text-ink-300">↑↓</kbd>
                  <span>history</span>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <Message
                key={i}
                role={m.role}
                content={m.content}
                expertId={m.expertId}
                expertName={
                  m.role === "assistant" ? expertById(m.expertId ?? null)?.name : undefined
                }
                toolEvents={m.toolEvents}
                activity={m.activity}
                live={m.live}
                attachments={m.attachments}
                changes={m.changes}
                editable={m.role === "user" && !busy}
                isEditing={editingIndex === i}
                editDraft={editingIndex === i ? editDraft : ""}
                onStartEdit={() => startEdit(i)}
                onCancelEdit={cancelEdit}
                onSaveEdit={saveEdit}
                onEditDraftChange={setEditDraft}
                onRegenerate={() => regenerateAt(i)}
              />
            ))}
          </div>
        </div>

        <div
          className={`border-t border-blend px-6 py-5 transition-colors ${dragOver ? "bg-accent-500/5" : ""}`}
          onDragOver={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            // Only un-highlight when leaving the wrapper (not entering a child)
            if (e.currentTarget === e.target) setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
          }}
        >
          <div className="max-w-3xl mx-auto">
            {queue.length > 0 && (
              <div className="mb-2 rounded-xl border border-ink-800 bg-ink-925 overflow-hidden">
                <div className="px-3 py-1 text-[10.5px] uppercase tracking-wider text-ink-400 font-semibold border-b border-ink-850">
                  Queued · sent after the reply
                </div>
                {queue.map((q, i) => (
                  <div key={q.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-ink-850 last:border-b-0">
                    <span className="text-[11px] font-mono text-ink-500 shrink-0">{i + 1}</span>
                    <span className="text-[12.5px] text-ink-200 truncate flex-1">
                      {q.text || <span className="text-ink-500">(attachments only)</span>}
                    </span>
                    {q.files.length > 0 && (
                      <span className="text-[11px] text-ink-500 shrink-0">
                        {q.files.length} {q.files.length === 1 ? "file" : "files"}
                      </span>
                    )}
                    <button
                      onClick={() => removeQueued(q.id)}
                      className="shrink-0 w-5 h-5 rounded text-ink-500 hover:text-ink-100 hover:bg-ink-850 flex items-center justify-center transition"
                      title="Remove from queue"
                      aria-label="Remove from queue"
                    >
                      <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <path d="M3 3l10 10M13 3L3 13" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pending.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pending.map((p) => (
                  <PendingChip key={p.id} pending={p} onRemove={() => removePending(p.id)} />
                ))}
              </div>
            )}
            {dragOver && pending.length === 0 && (
              <div className="mb-2 text-center text-[12px] text-accent-300 font-mono py-3 rounded-lg border-2 border-dashed border-accent-500/40 bg-accent-500/5">
                Drop files to attach (PNG / JPG / WebP / GIF / PDF / TXT, max 5 MB each)
              </div>
            )}
            {/* token progress bar */}
            <div
              className="h-[3px] mb-2.5 rounded-full bg-ink-850 overflow-hidden"
              title={`${tokenCount.toLocaleString()} / ${TOKEN_BUDGET.toLocaleString()} tokens · ${messages.length} msgs`}
            >
              <div
                className={`h-full ${tokenBarColor} transition-all duration-300`}
                style={{ width: `${tokenPct}%` }}
              />
            </div>
            <div className="relative flex items-end gap-2 bg-ink-900 border border-ink-800 rounded-2xl px-3.5 py-2.5 focus-within:border-accent-500/50 focus-within:ring-4 focus-within:ring-accent-500/10 shadow-elev-3 transition-all duration-200">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (historyIndex !== -1) {
                    // user is typing → "commit" the recalled msg as new draft
                    setHistoryIndex(-1);
                    draftRef.current = e.target.value;
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…  (↑↓ to recall, ⇧↵ for newline)"
                className="flex-1 bg-transparent text-[14px] text-ink-100 resize-none focus:outline-none placeholder:text-ink-500 py-1.5 max-h-48 leading-relaxed"
                rows={2}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,.md,.markdown,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 w-9 h-9 rounded-xl text-ink-400 hover:text-ink-100 hover:bg-ink-850 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition"
                title="Attach file"
                aria-label="Attach file"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M11.5 6.5L6 12a3 3 0 0 1-4-4l5-5a2 2 0 0 1 3 3l-5 5a1 1 0 0 1-1.5-1.5L8 5.5" />
                </svg>
              </button>
              {busy && (
                <button
                  onClick={stopGeneration}
                  className="shrink-0 w-9 h-9 rounded-xl bg-rose-500 hover:bg-rose-400 text-white transition-all flex items-center justify-center shadow-md shadow-rose-500/30"
                  aria-label="Stop generation"
                  title={queue.length > 0 ? "Stop generation (queued messages go back to the input)" : "Stop generation"}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <rect x="3" y="3" width="10" height="10" rx="1.5" />
                  </svg>
                </button>
              )}
              {(!busy || input.trim() || pending.length > 0) && (
                <button
                  onClick={() => send()}
                  disabled={(!input.trim() && pending.length === 0) || (busy && queue.length >= MAX_QUEUE)}
                  className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 hover:from-accent-300 hover:to-accent-500 text-white transition-all disabled:from-ink-800 disabled:to-ink-800 disabled:text-ink-600 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center shadow-accent-glow"
                  aria-label={busy ? "Queue message" : "Send"}
                  title={busy ? (queue.length >= MAX_QUEUE ? `Queue is full (${MAX_QUEUE})` : "Queue message — sent after the reply") : undefined}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M8 13V3M3 8l5-5 5 5" />
                  </svg>
                </button>
              )}
            </div>
            <div className="mt-1.5 text-[10px] text-ink-500 text-right font-mono">
              {tokenCount.toLocaleString()} tok · {messages.length} msgs
            </div>
          </div>
        </div>
      </main>

      {memoryOpen && memoryHostExpert && (
        <MemoryPanel
          expertId={memoryHostExpert.id}
          expertName={memoryHostExpert.name}
          refreshKey={memoryRefreshKey}
          onClose={() => setMemoryOpen(false)}
        />
      )}

      <SearchPalette
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={jumpToChat}
        experts={experts}
      />

      <NewExpertDialog
        isOpen={newExpertOpen}
        onClose={() => setNewExpertOpen(false)}
        onCreated={handleExpertCreated}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-rose-500/90 text-white text-[12.5px] font-medium px-4 py-2 rounded-lg shadow-elev-3 animate-fade-up backdrop-blur-sm">
          {toast}
        </div>
      )}
    </div>
  );
}

function PendingChip({ pending, onRemove }: { pending: PendingFile; onRemove: () => void }) {
  const isImage = pending.previewUrl != null;
  const ext = pending.file.name.split(".").pop()?.toUpperCase() ?? "?";
  return (
    <div className="relative group flex items-center gap-2 bg-ink-925 border border-ink-800 rounded-lg pl-1 pr-2 py-1 max-w-[200px]">
      {isImage ? (
        <img
          src={pending.previewUrl!}
          alt={pending.file.name}
          className="w-9 h-9 rounded object-cover bg-ink-900 shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded bg-ink-900 border border-ink-800 flex items-center justify-center text-[10px] font-mono text-ink-400 shrink-0">
          {ext}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] text-ink-100 truncate">{pending.file.name}</div>
        <div className="text-[10px] text-ink-500 font-mono">
          {(pending.file.size / 1024).toFixed(0)} KB
        </div>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 text-ink-500 hover:text-rose-400 hover:bg-ink-850 rounded p-0.5 transition"
        aria-label="Remove"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
