"use client";

import { useEffect, useState } from "react";
import { isValidExpertId, slugifyExpertId } from "@/lib/expertId";

const LANGUAGES = ["Slovak", "English"];

const fieldClass =
  "w-full bg-ink-900 border border-ink-800 focus:border-accent-500/50 focus:ring-2 focus:ring-accent-500/15 rounded-lg px-3 py-2 text-[13px] text-ink-100 placeholder:text-ink-500 focus:outline-none";
const labelClass = "block text-[11px] uppercase tracking-[0.1em] text-ink-500 font-semibold mb-1.5";
const primaryClass =
  "text-[12px] bg-gradient-to-br from-accent-400 to-accent-600 hover:from-accent-300 hover:to-accent-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-3 py-1.5 rounded transition shadow-sm";

export default function NewExpertDialog({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [brief, setBrief] = useState("");
  const [withMemory, setWithMemory] = useState(true);
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !drafting && !creating) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, drafting, creating, onClose]);

  if (!isOpen) return null;

  const hasDraft = systemPrompt.trim().length > 0;
  const canDraft = name.trim() && brief.trim() && !drafting && !creating;
  const canCreate =
    hasDraft && description.trim() && name.trim() && isValidExpertId(id) && !drafting && !creating;

  async function draft() {
    setDrafting(true);
    setError(null);
    try {
      const r = await fetch("/api/experts/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, language, brief }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "draft failed");
      setDescription(data.description);
      setSystemPrompt(data.systemPrompt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/experts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, description, systemPrompt, withMemory }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "create failed");
      onCreated(data.id);
      setName(""); setId(""); setIdTouched(false); setBrief("");
      setDescription(""); setSystemPrompt(""); setWithMemory(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] bg-black/40 backdrop-blur-sm animate-fade-up"
      onClick={() => !drafting && !creating && onClose()}
    >
      <div
        className="w-[720px] max-w-[92vw] max-h-[84vh] flex flex-col bg-ink-925 border border-ink-800 rounded-2xl shadow-elev-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-ink-850 text-[15px] font-medium text-ink-100">New expert</div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-[1fr_200px_130px] gap-3">
            <div>
              <label className={labelClass}>Name</label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!idTouched) setId(slugifyExpertId(e.target.value));
                }}
                placeholder="Garden Advisor"
                className={fieldClass}
                autoFocus
              />
            </div>
            <div>
              <label className={labelClass}>Id</label>
              <input
                value={id}
                onChange={(e) => { setId(e.target.value); setIdTouched(true); }}
                placeholder="garden-advisor"
                className={`${fieldClass} font-mono ${id && !isValidExpertId(id) ? "border-rose-500/60" : ""}`}
              />
            </div>
            <div>
              <label className={labelClass}>Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className={fieldClass}>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Brief</label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="What should this expert help with? Who are they, how should they talk to you, what should they avoid?"
              className={`${fieldClass} resize-none leading-relaxed`}
              rows={4}
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-ink-300 cursor-pointer select-none">
              <input type="checkbox" checked={withMemory} onChange={(e) => setWithMemory(e.target.checked)} />
              Memory folder
              <span className="text-[11.5px] text-ink-500">(readonly / editable / journal + profile.md)</span>
            </label>
            <button onClick={draft} disabled={!canDraft} className={`ml-auto ${primaryClass}`}>
              {drafting ? "Drafting…" : hasDraft ? "Redraft with Claude" : "Draft with Claude"}
            </button>
          </div>

          {hasDraft && (
            <>
              <div>
                <label className={labelClass}>Description</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>System prompt</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className={`${fieldClass} font-mono text-[12.5px] resize-y leading-relaxed`}
                  rows={16}
                  spellCheck={false}
                />
              </div>
            </>
          )}

          {error && <div className="text-[12.5px] text-rose-300 whitespace-pre-wrap">{error}</div>}
        </div>

        <div className="border-t border-ink-850 px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={drafting || creating}
            className="text-[12px] text-ink-300 hover:text-ink-100 px-2.5 py-1.5 rounded hover:bg-ink-900 transition"
          >
            Cancel
          </button>
          <button onClick={create} disabled={!canCreate} className={primaryClass}>
            {creating ? "Creating…" : "Create expert"}
          </button>
        </div>
      </div>
    </div>
  );
}
