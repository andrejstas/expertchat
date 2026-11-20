"use client";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { isValidElement } from "react";
import { expertColorClasses } from "@/lib/expertColor";
import { ExpertAvatar } from "./ExpertAvatar";
import MessageActivity, { type Activity } from "./MessageActivity";
import LiveStatus, { type LiveState } from "./LiveStatus";
import IcsBlock from "./IcsBlock";
import MermaidBlock from "./MermaidBlock";
import ChangesList from "./ChangesList";
import type { FileChange } from "@/lib/types";

export interface ToolEvent {
  name: string;
  input?: any;
}

interface AttachmentRefMin {
  type: "image" | "pdf" | "text";
  path: string;
  relPath: string;
  name: string;
  size: number;
  mime: string;
}

function MessageBase({
  role,
  content,
  expertId,
  expertName,
  toolEvents,
  activity,
  live,
  attachments,
  changes,
  editable = false,
  isEditing = false,
  editDraft = "",
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditDraftChange,
  onRegenerate,
}: {
  role: "user" | "assistant";
  content: string;
  expertId?: string;
  expertName?: string;
  toolEvents?: ToolEvent[];
  activity?: Activity;
  live?: LiveState;
  attachments?: AttachmentRefMin[];
  changes?: FileChange[];
  editable?: boolean;
  isEditing?: boolean;
  editDraft?: string;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  onEditDraftChange?: (value: string) => void;
  onRegenerate?: () => void;
}) {
  const isUser = role === "user";
  const colors = !isUser && expertId ? expertColorClasses(expertId) : null;
  const isThinking = !isUser && content === "" && (!toolEvents || toolEvents.length === 0);

  return (
    <div className={`flex group/msg ${isUser ? "justify-end" : "justify-start"} mb-5 animate-fade-up`}>
      {/* Edit + regenerate icons — show on hover for user messages */}
      {isUser && editable && !isEditing && (
        <div className="self-center mr-2 flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition">
          <button
            onClick={onRegenerate}
            className="p-1.5 rounded-md text-ink-500 hover:text-ink-100 hover:bg-ink-900 transition"
            title="Resend (regenerate)"
            aria-label="Regenerate response"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
              <path d="M13.5 2.5v3h-3" />
            </svg>
          </button>
          <button
            onClick={onStartEdit}
            className="p-1.5 rounded-md text-ink-500 hover:text-ink-100 hover:bg-ink-900 transition"
            title="Edit & resend"
            aria-label="Edit message"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 3l2 2L5.5 12.5l-3 .5.5-3L11 3z" />
            </svg>
          </button>
        </div>
      )}

      {!isUser && expertId && (
        <div className="shrink-0 mt-0.5 mr-3" aria-hidden>
          <ExpertAvatar
            id={expertId}
            name={expertName ?? "AI"}
            className="w-8 h-8 rounded-md shadow-elev-1"
          />
        </div>
      )}

      <div className={`max-w-[80%] ${isUser ? "" : "min-w-0"} ${isEditing ? "w-full" : ""}`}>
        {!isUser && live && (
          <LiveStatus live={live} colors={colors} />
        )}
        {!isUser && !live && activity && (activity.thinking.length > 0 || activity.tools.length > 0) && (
          <MessageActivity activity={activity} colors={colors} />
        )}

        {isUser && isEditing ? (
          <div className="rounded-2xl bg-ink-925 border border-accent-500/60 ring-2 ring-accent-500/15 px-4 py-3 shadow-elev-3">
            <textarea
              autoFocus
              value={editDraft}
              onChange={(e) => onEditDraftChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSaveEdit?.();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onCancelEdit?.();
                }
              }}
              className="w-full bg-transparent text-[14px] text-ink-100 resize-none focus:outline-none placeholder:text-ink-500 leading-relaxed min-h-[3rem]"
              rows={Math.max(2, editDraft.split("\n").length)}
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <span className="text-[10.5px] text-ink-500 mr-auto font-mono">
                <kbd className="text-ink-300">↵</kbd> save · <kbd className="text-ink-300">esc</kbd> cancel
              </span>
              <button
                onClick={onCancelEdit}
                className="text-[12px] text-ink-300 hover:text-ink-100 px-3 py-1.5 rounded-md hover:bg-ink-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={onSaveEdit}
                disabled={!editDraft.trim()}
                className="text-[12px] bg-gradient-to-br from-accent-400 to-accent-600 hover:from-accent-300 hover:to-accent-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 rounded-md transition shadow-sm"
              >
                Save & resend
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl px-4 py-3 transition-shadow ${
              isUser
                ? "bg-gradient-to-br from-accent-400 to-accent-600 text-white shadow-accent-glow"
                : "bg-ink-900 text-ink-100 border border-ink-800 shadow-elev-2 hover:shadow-elev-3"
            }`}
          >
            {!isUser && expertName && (
              <div className="text-[11px] font-medium mb-1.5 tracking-wide text-ink-300">
                {expertName}
              </div>
            )}

            {isThinking ? (
              <ThinkingDots />
            ) : isUser ? (
              <div>
                {attachments && attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {attachments.map((a, i) => (
                      <AttachmentTile key={i} att={a} />
                    ))}
                  </div>
                )}
                {content && (
                  <div className="whitespace-pre-wrap leading-relaxed text-[14px]">{content}</div>
                )}
              </div>
            ) : content ? (
              <div className="prose-chat text-[14px]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    a: ({ node, ...props }) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    ),
                    pre: ({ children, ...props }) => {
                      // Look at the inner code element for language-ics
                      const child = Array.isArray(children) ? children[0] : children;
                      if (isValidElement(child)) {
                        const childProps: any = (child as any).props ?? {};
                        const cls = String(childProps.className ?? "");
                        const inner = childProps.children;
                        const text = typeof inner === "string"
                          ? inner
                          : Array.isArray(inner)
                            ? inner.filter((x: any) => typeof x === "string").join("")
                            : "";
                        if (cls.includes("language-ics") || /BEGIN:VCALENDAR/.test(text)) {
                          return <IcsBlock content={text.trim()} />;
                        }
                        if (cls.includes("language-mermaid")) {
                          return <MermaidBlock content={text.trim()} streaming={!!live} />;
                        }
                      }
                      return <pre {...props}>{children}</pre>;
                    },
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <ThinkingDots />
            )}
          </div>
        )}
        {!isUser && changes && changes.length > 0 && <ChangesList changes={changes} />}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="thinking">
      <span className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-thinking" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-thinking" style={{ animationDelay: "200ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-thinking" style={{ animationDelay: "400ms" }} />
    </div>
  );
}

function ToolChip({ event, colors }: { event: ToolEvent; colors: ReturnType<typeof expertColorClasses> | null }) {
  const target = describeToolTarget(event);
  const verb = toolVerb(event.name);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border border-ink-800 bg-ink-925 text-ink-300">
      <span className={`w-1.5 h-1.5 rounded-full ${colors?.bg ?? "bg-ink-500"}`} />
      <span>
        {verb}
        {target ? <> <span className="font-mono text-ink-200">{target}</span></> : null}
      </span>
    </span>
  );
}

function toolVerb(name: string): string {
  if (name === "Read") return "Reading";
  if (name === "Edit") return "Updating";
  if (name === "Write") return "Writing";
  return name;
}

function AttachmentTile({ att }: { att: AttachmentRefMin }) {
  const ext = att.name.split(".").pop()?.toUpperCase() ?? "?";
  if (att.type === "image") {
    return (
      <a
        href={`/api/attachments/raw?path=${encodeURIComponent(att.relPath)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg overflow-hidden border border-white/15 bg-black/20 hover:border-white/30 transition"
        title={`${att.name} · ${(att.size / 1024).toFixed(0)} KB`}
      >
        <img
          src={`/api/attachments/raw?path=${encodeURIComponent(att.relPath)}`}
          alt={att.name}
          className="block max-w-[220px] max-h-[160px] object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={`/api/attachments/raw?path=${encodeURIComponent(att.relPath)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border border-white/20 bg-black/20 px-2.5 py-1.5 hover:border-white/40 transition"
      title={`${att.name} · ${(att.size / 1024).toFixed(0)} KB`}
    >
      <div className="w-7 h-7 rounded bg-black/30 border border-white/15 flex items-center justify-center text-[9.5px] font-mono text-white/80 shrink-0">
        {ext}
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-[12px] text-white truncate max-w-[160px]">{att.name}</div>
        <div className="text-[10px] text-white/60 font-mono">{(att.size / 1024).toFixed(0)} KB</div>
      </div>
    </a>
  );
}

function describeToolTarget(event: ToolEvent): string {
  const fp = event.input?.file_path;
  if (typeof fp !== "string") return "";
  const parts = fp.split("/");
  return parts.slice(-2).join("/");
}

// Memoise so Message only re-renders when its content / activity / edit state
// changes — avoids re-rendering all messages on every keystroke in the input.
// Callback prop identity is intentionally ignored: the latest closure is captured
// when content/activity actually change, and most clicks happen between such
// updates anyway.
const Message = memo(MessageBase, (prev, next) => {
  return (
    prev.role === next.role &&
    prev.content === next.content &&
    prev.expertId === next.expertId &&
    prev.expertName === next.expertName &&
    prev.editable === next.editable &&
    prev.isEditing === next.isEditing &&
    prev.editDraft === next.editDraft &&
    prev.activity === next.activity &&
    prev.live === next.live &&
    prev.toolEvents === next.toolEvents &&
    prev.attachments === next.attachments &&
    prev.changes === next.changes
  );
});

export default Message;
