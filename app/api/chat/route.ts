import { streamClaudeChat } from "@/lib/claude-cli";
import { listExperts, loadExpert, loadMemoryInventory } from "@/lib/experts";
import {
  EFFORT_VALUES,
  type Effort,
  loadChatSession,
  saveChatSession,
  clearChatSession,
  fingerprintMessages,
} from "@/lib/chats";
import type { ChatRequest, ChatMessage, ExpertConfig, MemoryFile } from "@/lib/types";
import { NextRequest } from "next/server";
import { snapshotMemory, diffSnapshots } from "@/lib/memoryDiff";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequest & { effort?: string; chatId?: string };
  const { expertId, messages } = body;
  if (!expertId) return new Response("expertId required", { status: 400 });
  const effort: Effort | undefined =
    body.effort && EFFORT_VALUES.includes(body.effort as Effort)
      ? (body.effort as Effort)
      : undefined;

  const [expert, allExperts] = await Promise.all([
    loadExpert(expertId),
    listExperts(),
  ]);
  const inventory = await loadMemoryInventory(expert.memoryDir);
  const otherExperts = allExperts.filter((e) => e.id !== expertId);

  const latest = messages[messages.length - 1];
  if (!latest || latest.role !== "user") {
    return new Response("Last message must be from user", { status: 400 });
  }
  const priorTurns = messages.slice(0, -1);

  // The system prompt must stay byte-identical across turns so it is served from
  // prompt cache. Anything that changes per turn (current time, transcript) goes
  // into the user prompt below instead.
  let systemPrompt = expert.systemPrompt;

  // Diagrams (Mermaid) — universal for all experts. The UI renders ` ```mermaid `
  // code blocks as actual diagrams, so use them whenever a visual would be clearer
  // than prose: project timelines (gantt), decision trees / flowcharts, sequences,
  // simple architecture, dependencies, mind maps.
  systemPrompt += `\n\n# Diagrams\n\nWhen a visual would clarify your answer (project timelines, decision flowcharts, sequence of steps, dependencies, simple architecture, mind maps), output a \`mermaid\` code block. The UI renders it as a diagram inline.\n\nSupported diagram kinds (use the right one for the question):\n\n- **flowchart** — branching logic, decisions, simple architecture\n  \`\`\`mermaid\n  flowchart LR\n      A[User asks] --> B{Has memory?}\n      B -->|yes| C[Read files]\n      B -->|no| D[Pure chat]\n      C --> E[Reply]\n      D --> E\n  \`\`\`\n- **gantt** — schedules, project timelines, milestones\n  \`\`\`mermaid\n  gantt\n      title Project plan\n      dateFormat YYYY-MM-DD\n      section Phase 1\n        Order kitchen :a1, 2026-05-08, 4w\n        Painting      :after a1, 2w\n      section Phase 2\n        Final cleanup :2026-06-15, 1w\n  \`\`\`\n- **sequenceDiagram** — interactions between actors / systems\n  \`\`\`mermaid\n  sequenceDiagram\n      User->>Server: send message\n      Server->>Claude: spawn -p\n      Claude-->>Server: stream tokens\n      Server-->>User: NDJSON\n  \`\`\`\n- **mindmap** — hierarchical concept breakdown\n  \`\`\`mermaid\n  mindmap\n    root((AI))\n      Models\n        Claude\n        GPT\n      Techniques\n        Prompting\n        RAG\n        Agents\n  \`\`\`\n\nRules:\n- Don't ask permission to draw — if the answer benefits from a visual, draw it.\n- Use \`flowchart LR\` (left-right) for most flowcharts; \`flowchart TD\` only when the tree is naturally vertical.\n- For dates in gantt use \`YYYY-MM-DD\`. Use today's date as the baseline if unspecified.\n- Don't replace prose entirely — pair the diagram with a 1-3 sentence summary.\n\n`;

  // Calendar events — universal for all experts. The UI renders an ICS code block
  // as a one-click "Add to Calendar" button (no scheduler, no extra services).
  systemPrompt += `\n\n# Calendar events\n\nIf the user asks for a reminder, scheduled event, follow-up, deadline, or appointment, output an iCal (\`ics\`) code block. The UI will render it with an **Add to Calendar** button that triggers macOS Calendar import.\n\nFormat:\n\n\`\`\`ics\nBEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Expert Chat//EN\nBEGIN:VEVENT\nUID:<unique-id>@expertchat\nDTSTAMP:<NOW UTC, YYYYMMDDTHHMMSSZ>\nDTSTART:<EVENT START UTC>\nDTEND:<EVENT END UTC>\nSUMMARY:<short title>\nDESCRIPTION:<longer description, escape commas with \\\\,>\nBEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:<reminder text>\nTRIGGER:-PT15M\nEND:VALARM\nEND:VEVENT\nEND:VCALENDAR\n\`\`\`\n\nRules:\n- All times in UTC (\`YYYYMMDDTHHMMSSZ\`). User is in Europe/Bratislava (CET/CEST), so subtract 1h winter / 2h summer when converting from local time.\n- Always include UID, DTSTAMP, DTSTART, DTEND, SUMMARY.\n- Add VALARM with TRIGGER:-PT15M (15 min before) by default — user can adjust.\n- Don't ask permission to use this format — if the request is calendar-shaped, just produce it.`;

  if (otherExperts.length > 0) {
    systemPrompt += `\n\n${formatOtherExpertsSection(otherExperts)}`;
  }

  if (expert.memoryDir && inventory.length > 0) {
    systemPrompt += `\n\n# Memory\n\n${formatMemorySection(expert.memoryDir, inventory)}`;
  }

  // Current time — without this, Claude has no idea what date or time it is
  // (--system-prompt-file overrides the CLI's default dynamic sections).
  // Collect attachment dirs from any message that references attachments —
  // need --add-dir scope for the model's Read tool to access these files.
  const attachmentDirs = new Set<string>();
  for (const m of messages) {
    for (const a of m.attachments ?? []) {
      attachmentDirs.add(path.dirname(a.path));
    }
  }

  // Compose the latest user message with attachment hints for the model.
  let messageText = latest.content;
  if (latest.attachments && latest.attachments.length > 0) {
    const lines = latest.attachments.map((a) => {
      const verb = a.type === "image" ? "image" : a.type === "pdf" ? "PDF" : "text file";
      return `- ${verb}: \`${a.path}\` (${a.name}, ${(a.size / 1024).toFixed(1)} KB)`;
    });
    messageText += `\n\n[The user attached the following file(s). Use the Read tool with the exact paths above to view them.]\n${lines.join("\n")}`;
  }

  // When the chat's CLI session already holds exactly these prior turns, resume it:
  // the history is then served from prompt cache instead of being re-sent (and
  // re-processed) as one huge uncached transcript every turn. The session is
  // consumed here and only re-saved after a clean finish, so an aborted or failed
  // turn falls back to the full transcript next time.
  const chatId = typeof body.chatId === "string" ? body.chatId : null;
  const session = chatId ? await loadChatSession(expertId, chatId) : null;
  const resumable =
    session &&
    session.messageCount === priorTurns.length &&
    session.fingerprint === fingerprintMessages(priorTurns)
      ? session.sessionId
      : null;
  if (chatId && session) await clearChatSession(expertId, chatId);

  // Current time — without this, Claude has no idea what date or time it is
  // (--system-prompt-file overrides the CLI's default dynamic sections).
  const buildPrompt = (withTranscript: boolean) => {
    const contextSections = [formatCurrentTimeSection()];
    if (withTranscript && priorTurns.length > 0) {
      const transcript = priorTurns
        .map((m) => formatTurn(m))
        .join("\n\n");
      contextSections.push(`# Prior conversation in this chat\n\n${transcript}`);
    }
    return `${contextSections.join("\n\n")}\n\n# Current user message\n\n${messageText}`;
  };

  const hasMemory = expert.memoryDir && inventory.length > 0;
  const hasAttachments = attachmentDirs.size > 0;
  // Web tools are always on. Read/Edit/Write enabled when memory exists OR when
  // the user attached files (so the model can Read them).
  const tools = [
    ...(hasMemory || hasAttachments ? ["Read", "Edit", "Write"] : []),
    "WebFetch",
    "WebSearch",
  ];
  const addDirs = [
    ...(hasMemory ? [expert.memoryDir!] : []),
    ...Array.from(attachmentDirs),
  ];

  const runClaude = (resume: string | null) =>
    streamClaudeChat({
      prompt: buildPrompt(!resume),
      systemPrompt,
      model: expert.model,
      tools,
      addDirs,
      effort,
      signal: req.signal,
      resume: resume ?? undefined,
      persistSession: chatId != null,
    }).events;

  const encoder = new TextEncoder();
  // Snapshot memory before the expert runs; after each Edit/Write the diff against
  // this is streamed as a "changes" event and saved with the reply.
  const memoryDir = hasMemory ? expert.memoryDir! : null;
  const memoryBefore = memoryDir ? await snapshotMemory(memoryDir) : null;

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {}
      };

      send({ type: "stage", kind: "spawning" });

      const hbInterval = setInterval(() => send({ type: "heartbeat" }), 2000);

      let firstInnerEvent = true;
      const writeToolIds = new Set<string>();
      let lastChangesKey = "[]";
      const reportChanges = async () => {
        if (!memoryDir || !memoryBefore) return;
        const changes = diffSnapshots(memoryBefore, await snapshotMemory(memoryDir));
        const key = JSON.stringify(changes);
        if (key === lastChangesKey) return;
        lastChangesKey = key;
        send({ type: "changes", changes });
      };
      try {
        let resume = resumable;
        let replyText = "";
        let finished: { sessionId: string | null; ok: boolean } | null = null;
        while (true) {
          let produced = false;
          let sessionMissing = false;
          for await (const evt of runClaude(resume)) {
            if (evt.type === "result") {
              if (evt.isError && resume && !produced && evt.numTurns === 0) {
                sessionMissing = true;
                continue;
              }
              if (evt.isError) send({ type: "error", message: evt.message });
              finished = { sessionId: evt.sessionId, ok: !evt.isError };
              continue;
            }
            if (firstInnerEvent) {
              send({ type: "stage", kind: "connected" });
              firstInnerEvent = false;
            }
            produced = true;
            if (evt.type === "text") replyText += evt.delta;
            if (evt.type === "tool_use" && (evt.name === "Edit" || evt.name === "Write")) {
              writeToolIds.add(evt.id);
            }
            send(evt);
            if (evt.type === "tool_result" && !evt.isError && writeToolIds.has(evt.toolUseId)) {
              await reportChanges();
            }
          }
          if (!sessionMissing) break;
          resume = null;
        }
        await reportChanges();
        if (chatId && finished?.ok && finished.sessionId && !req.signal.aborted) {
          await saveChatSession(expertId, chatId, {
            sessionId: finished.sessionId,
            messageCount: priorTurns.length + 2,
            fingerprint: fingerprintMessages([
              ...priorTurns,
              { role: "user", content: latest.content },
              { role: "assistant", content: replyText },
            ]),
          });
        }
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        clearInterval(hbInterval);
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Expert-Id": expert.id,
    },
  });
}

function formatOtherExpertsSection(others: ExpertConfig[]): string {
  const lines = others.map((e) => `- **${e.name}** — ${e.description}`);
  return `# Other experts available in this app

The user can also chat with these experts. If their question fits another expert's domain better than yours, suggest the handoff naturally (e.g. "this is more of a question for the FIRE Advisor — try asking them"). Don't redirect for things in your own wheelhouse; only suggest a handoff when the other expert is clearly a better fit.

${lines.join("\n")}`;
}

function formatCurrentTimeSection(): string {
  const now = new Date();
  const tz = "Europe/Bratislava";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const localDate = `${get("year")}-${get("month")}-${get("day")}`;
  const dow = get("weekday");
  const localTime = `${get("hour")}:${get("minute")}`;

  // Offset in hours from "GMT+2" / "GMT+1"
  const offParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(now);
  const offsetStr = offParts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const offsetH = parseInt(offsetStr.replace("GMT", "") || "0", 10);
  const tzAbbrev = offsetH === 2 ? "CEST" : "CET";

  const utcTime = now.toISOString().slice(0, 16).replace("T", " ");

  return `# Current time\n\nNow: ${localDate} ${dow} ${localTime} Europe/Bratislava (${tzAbbrev}, UTC+${offsetH}). Current UTC: ${utcTime}.`;
}

function formatTurn(m: ChatMessage): string {
  const role = m.role === "user" ? "User" : "Assistant";
  const stamp = m.timestamp ? `[${formatLocalStamp(m.timestamp)}] ` : "";
  let s = `${stamp}${role}: ${m.content}`;
  if (m.attachments && m.attachments.length > 0) {
    const refs = m.attachments
      .map((a) => `[attached ${a.type}: ${a.path}]`)
      .join(" ");
    s += `\n${refs}`;
  }
  return s;
}

function formatLocalStamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function formatMemorySection(memoryDir: string, inventory: MemoryFile[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const monthFile = today.slice(0, 7) + ".md";

  const groups: Record<string, MemoryFile[]> = { readonly: [], editable: [], journal: [], archived: [] };
  for (const f of inventory) groups[f.category].push(f);

  const lines: string[] = [];
  lines.push(`Memory location: ${memoryDir}`);
  lines.push(`You have access to memory files via Read, Edit, and Write tools (only in this directory). Read freely. **Write rarely.**`);
  lines.push("");
  lines.push("## Reading discipline (CRITICAL)");
  lines.push("**Before answering ANY question that could be informed by memory, you MUST identify the relevant files from the inventory below and Read them in full.** The previews under \"Available files\" are for ROUTING only — they list section headings (or a short excerpt) so you can decide *which* files to open. They are NOT the content. Never answer from previews.");
  lines.push("");
  lines.push("Procedure for every user turn:");
  lines.push("1. Look at the question. Could memory have facts, numbers, decisions, history, or context relevant to the answer?");
  lines.push("2. **Check the \"Pinned files\" section first** — those are inlined in this prompt; their content is right here, no Read needed.");
  lines.push("3. If pinned content is not enough, scan the inventory and Read every non-pinned file that plausibly contains relevant content. Prefer reading too much over too little — Read calls are cheap and prompt-cached.");
  lines.push("4. If multiple files are plausibly relevant, Read them in **parallel** (one assistant turn, multiple Read tool calls).");
  lines.push("5. Only after reading, compose your answer.");
  lines.push("");
  lines.push("Skip Read **only** when:");
  lines.push("- The question is purely conversational (\"ahoj\", \"ďakujem\") with no factual content.");
  lines.push("- You have already Read the relevant file earlier in *this same chat* and the user has not changed the topic.");
  lines.push("- The question is unambiguously outside the scope of any file in the inventory.");
  lines.push("");
  lines.push("Failure mode to avoid: answering from imagination or stale recollection when the authoritative file is right there. When in doubt, Read.");
  lines.push("");
  lines.push("## File rules");
  lines.push("- `readonly/*` — reference only. **NEVER** modify these files. Treat them as immutable input.");
  lines.push("- `editable/*` — current-state files. May be rewritten **only when the user has confirmed a state change**.");
  lines.push("- `journal/*` — append-only chronological log. Current month file is `journal/" + monthFile + "`. Append a short entry **only after a confirmed decision or completed action**. NEVER modify older journal files.");
  lines.push("- `archived/*` — completed/closed documents moved here from `editable/`. Reference only. **NEVER** modify these files. Treat them as historical record.");
  lines.push("");
  lines.push("## Writing threshold (CRITICAL)");
  lines.push("**Default action is to NOT write.** Reading is fine; writing requires a high bar.");
  lines.push("");
  lines.push("Write to memory **only** when ONE of these is true:");
  lines.push("1. **User explicitly asks you to** — e.g. \"save this\", \"ulož to\", \"zapíš si\", \"aktualizuj X\", \"pridaj do todos\".");
  lines.push("2. **User reports a fait accompli** that materially changes recorded state — e.g. \"kúpil som\", \"objednal som\", \"predal som\", \"namontoval som\", \"zaplatil som\", \"dorazilo mi\", \"rozhodol som sa\". Past-tense, declarative.");
  lines.push("3. **User explicitly accepts your proposal** — e.g. you suggested X, user said \"ok\" / \"súhlas\" / \"poďme do toho\" / \"sprav to\".");
  lines.push("");
  lines.push("**Do NOT write** when:");
  lines.push("- User is exploring (\"čo si myslíš o\", \"mal by som\", \"uvažujem nad\", \"oplatí sa…\")");
  lines.push("- User asks a question — even one with a definite answer");
  lines.push("- You give advice the user has not accepted yet");
  lines.push("- The topic is hypothetical, future, or speculative");
  lines.push("- You are summarising what you both discussed without a concrete outcome");
  lines.push("");
  lines.push("**When in doubt: do nothing, or ASK first.** Format: \"Mám to zapísať do `editable/X.md`?\" and wait for confirmation.");
  lines.push("");
  lines.push("Bias toward writing nothing. The user dislikes unsolicited memory edits.");
  lines.push("");
  lines.push("## Research and sources");
  lines.push("When you use WebSearch or WebFetch to research something and write the results to memory, **always include the source URL** next to each finding. The user needs to be able to trace back where information came from.");
  lines.push("");

  const pinned = inventory.filter((f) => f.pinned && f.body);
  if (pinned.length > 0) {
    lines.push("## Pinned files (always loaded — DO NOT Read these)");
    lines.push("");
    lines.push("These files are foundational to your role and are loaded inline below every turn. Use them directly. The full content is here — calling Read on them is wasted (they are also marked `[pinned]` in the inventory below).");
    lines.push("");
    for (const f of pinned) {
      lines.push(`### \`${f.relativePath}\``);
      lines.push("");
      lines.push(f.body!);
      lines.push("");
    }
  }

  lines.push("## Available files");
  for (const cat of ["readonly", "editable", "journal", "archived"] as const) {
    const files = groups[cat];
    if (files.length === 0) continue;
    lines.push(`### ${cat}/`);
    for (const f of files) {
      const sizeKb = (f.size / 1024).toFixed(1);
      const tag = f.pinned ? " **[pinned, content above]**" : "";
      lines.push(`- \`${f.relativePath}\` (${sizeKb} KB)${tag}`);
      if (f.preview) lines.push(`  ${f.preview}`);
    }
  }
  return lines.join("\n");
}
