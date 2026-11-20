"use client";

import { useState } from "react";
import { MODEL_OPTIONS, isValidModelId } from "@/lib/models";

export default function ModelPill({
  model,
  onChange,
  heading,
  disabled,
  align = "right",
}: {
  model: string;
  onChange?: (model: string) => void;
  heading: string;
  disabled?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const options = MODEL_OPTIONS.includes(model) ? MODEL_OPTIONS : [model, ...MODEL_OPTIONS];
  const customValid = isValidModelId(custom.trim());

  function pick(m: string) {
    onChange?.(m);
    setOpen(false);
    setCustom("");
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || !onChange}
        className="text-[10.5px] text-ink-400 font-mono px-2 py-1 rounded-md bg-ink-900 border border-blend hover:border-ink-700 disabled:hover:border-blend disabled:cursor-default transition"
        title={onChange ? heading : "Model set in this expert's frontmatter"}
      >
        {model}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-1 z-20 bg-ink-900 border border-ink-800 rounded-lg shadow-elev-3 py-1 min-w-[200px]`}
          >
            <div className="px-3 pt-1 pb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-ink-500">{heading}</div>
            {options.map((m) => (
              <button
                key={m}
                onClick={() => pick(m)}
                className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 transition ${
                  m === model ? "bg-accent-500/10 text-ink-100" : "hover:bg-ink-850 text-ink-300"
                }`}
              >
                <span className="font-mono">{m}</span>
                {m === model && <span className="ml-auto text-accent-300">✓</span>}
              </button>
            ))}
            <form
              className="px-2 pt-1.5 pb-1 mt-1 border-t border-ink-800"
              onSubmit={(e) => {
                e.preventDefault();
                if (customValid) pick(custom.trim());
              }}
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="custom model id ↵"
                className="w-full bg-ink-850 border border-ink-800 rounded px-2 py-1 text-[12px] font-mono text-ink-200 placeholder:text-ink-500 outline-none focus:border-ink-700"
              />
            </form>
          </div>
        </>
      )}
    </div>
  );
}
