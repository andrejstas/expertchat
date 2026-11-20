"use client";

import { useEffect, useRef, useState } from "react";

let mermaidPromise: Promise<any> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        suppressErrorRendering: true,
        securityLevel: "loose",
        theme: "base",
        themeVariables: {
          // Match our plum/violet dark palette
          fontFamily: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
          fontSize: "13px",
          background: "transparent",
          primaryColor: "#231c39",          // ink-850
          primaryTextColor: "#faf6ff",      // ink-100
          primaryBorderColor: "#5b628d",    // ink-600
          lineColor: "#9d90bf",             // ink-400
          secondaryColor: "#1c1631",        // ink-900
          tertiaryColor: "#181228",         // ink-925
          textColor: "#cabde1",             // ink-300
          // accent for highlights
          mainBkg: "#231c39",
          secondBkg: "#1c1631",
          tertiaryBkg: "#181228",
          // gantt
          sectionBkgColor: "#231c39",
          altSectionBkgColor: "#1c1631",
          gridColor: "#3f3559",
          taskBkgColor: "#8b5cf6",
          taskTextColor: "#ffffff",
          taskBorderColor: "#a78bfa",
          activeTaskBkgColor: "#a78bfa",
          activeTaskBorderColor: "#c4b5fd",
          doneTaskBkgColor: "#10b981",
          doneTaskBorderColor: "#10b981",
          critBkgColor: "#f43f5e",
          critBorderColor: "#f43f5e",
        },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

let renderChain: Promise<unknown> = Promise.resolve();

function renderSerially<T>(job: () => Promise<T>): Promise<T> {
  const run = renderChain.then(job, job);
  renderChain = run.catch(() => {});
  return run;
}

export default function MermaidBlock({ content, streaming = false }: { content: string; streaming?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (streaming) return;
    let cancelled = false;
    setError(null);
    loadMermaid()
      .then((mermaid) => renderSerially(async () => {
        if (cancelled || !ref.current) return;
        try {
          const id = `mermaid-${Math.random().toString(36).slice(2)}`;
          // Validate first; mermaid.parse throws on bad syntax with a useful message.
          await mermaid.parse(content);
          const { svg } = await mermaid.render(id, content);
          if (!cancelled && ref.current) {
            ref.current.innerHTML = svg;
            setError(null);
          }
        } catch (e: any) {
          if (!cancelled) {
            setError(typeof e?.message === "string" ? e.message : String(e));
          }
        }
      }))
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [content, streaming]);

  return (
    <div className="not-prose my-3 rounded-xl border border-ink-800 bg-ink-925/60 overflow-hidden">
      {streaming ? (
        <div className="p-4 text-center text-[11.5px] text-ink-500 font-mono">Drawing diagram…</div>
      ) : error ? (
        <div className="p-3">
          <div className="text-[11px] text-rose-400 font-mono mb-2">⚠️ Mermaid parse error</div>
          <pre className="text-[10.5px] text-ink-400 font-mono whitespace-pre-wrap break-words">{error}</pre>
        </div>
      ) : (
        <div ref={ref} className="p-4 flex justify-center [&>svg]:max-w-full [&>svg]:h-auto" />
      )}
      <details className="border-t border-ink-850" open={showRaw}>
        <summary
          onClick={(e) => {
            e.preventDefault();
            setShowRaw((v) => !v);
          }}
          className="px-3 py-1.5 text-[10.5px] text-ink-500 cursor-pointer hover:text-ink-300 select-none"
        >
          {showRaw ? "Hide" : "View"} mermaid source
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
