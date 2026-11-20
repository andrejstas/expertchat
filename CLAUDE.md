# expert-chat — project notes for Claude

This is a personal Next.js chat app that talks to Claude via the `claude` CLI subprocess (uses the user's Max subscription, not the API key). Local-only — runs on `localhost:3000` from this dir.

## Read first

- **`docs/creating-experts.md`** — authoritative guide for creating / modifying experts.
- **`decisions.md`** (local only, gitignored; may be missing) — log of major architectural choices with rationale (auth, memory layout, attachments, Mermaid, etc.). Read this before second-guessing a non-obvious design choice.

## When the user asks to create or modify an expert

**Before doing anything**, read `docs/creating-experts.md`. It is the authoritative guide for:

- Expert id naming
- Frontmatter format (`name`, `description`, optional `model` / `memoryDir`)
- System prompt structure (ROLE → STYLE → EXPERTISE → HOW WE WORK → WHAT I DON'T DO → FORMAT → DISCLAIMER)
- Memory directory layout (`readonly/`, `editable/`, `journal/`)
- Avatar and colour assignment
- Test checklist

Don't skip. The doc captures conventions that have evolved through several iterations and aren't obvious from reading the codebase alone.

## Project layout (high level)

```
app/
  api/
    chat/                 # streaming chat endpoint (NDJSON: text, thinking_delta, tool_use, tool_result, error)
    chats/                # CRUD for saved chats (per-expert)
      list, get, create, append, edit, rename, delete, search, effort
    experts/              # expert listing; draft (Claude writes prompt from a brief), create
    memory/
      list, file          # memory inventory + per-file GET/PUT (readonly/* refused)
    route/                # auto-router (Haiku picks the best expert)
    settings/             # GET/PATCH global settings (expert + router model)
    usage/                # local usage tracking + sync calibration
    attachments/
      upload, raw         # multipart upload + path-restricted file serving
    vm-stats/             # /proc/loadavg + /proc/meminfo poller
    expert-icon/[id]/     # per-expert favicon SVG (expert colour + initials)
  page.tsx, layout.tsx, globals.css, apple-icon.svg
  c/[expertId]/         # chat page; generateMetadata sets tab title + favicon per expert
public/icon.svg           # default favicon (not app/icon.svg — file-based icons override per-page metadata)

components/
  ChatPanel.tsx           # main chat UI (state machine for messages, edits, attachments, ⌘K)
  ExpertSidebar.tsx       # left sidebar with experts + chat list (footer: usage + VM stats)
  MemoryPanel.tsx         # right resizable panel with memory files + inline editor
  Message.tsx             # one chat bubble (memoised); routes ```ics / ```mermaid to special blocks
  MessageActivity.tsx     # collapsible thinking + tool input/result strip above assistant bubbles
  IcsBlock.tsx            # renders ```ics blocks as "Add to Calendar" cards
  MermaidBlock.tsx        # renders ```mermaid blocks as SVG (lazy-loaded)
  ExpertAvatar.tsx        # DiceBear lorelei avatar with initials fallback
  SearchPalette.tsx       # ⌘K full-text search across all chats
  UsageBar.tsx            # weekly Max-quota progress bar + sync UI
  ModelPill.tsx           # model dropdown (preset list + custom id input)
  ChangesList.tsx         # "Memory changes" card under a reply: per-file +/− rows, click for the diff
  NewExpertDialog.tsx     # "+" next to Experts: brief → Claude draft → review → create

lib/
  claude-cli.ts           # spawns `claude -p` (stream-json mode, with --strict-mcp-config)
  experts.ts              # loadExpert, listExperts, loadMemoryInventory
  chats.ts                # multi-chat persistence (jsonl per chat) + per-chat effort
  attachments.ts          # save/delete attachments under chats/<expert>/<chatId>.attachments/
  expertColor.ts          # deterministic palette assignment (7 colours, violet excluded)
  usage.ts                # local usage tracking with offset-based sync
  models.ts               # model dropdown options + defaults (client-safe)
  expertId.ts             # expert id validation + slugify (client-safe)
  settings.ts             # .settings.json read/write
  dataDir.ts              # DATA_DIR / EXPERTS_DIR / MEMORY_DIR (default ./data)
  memoryDiff.ts           # snapshot an expert's memory dir + line diff into hunks (server-only)
  memory.ts               # safety helpers for memory paths
  types.ts

docs/creating-experts.md  # the expert guide (also fed to the draft endpoint)
data/                     # personal data, its own git repo, gitignored here (EXPERT_CHAT_DATA_DIR overrides)
  experts/<id>.md         # one file per expert (frontmatter + system prompt body)
  memory/<id>/            # optional: readonly/, editable/, journal/ markdown files
chats/<id>/               # auto-created: <chatId>.jsonl + .attachments/ per chat (gitignored)
```

## Important conventions

- **No `@anthropic-ai/sdk` calls.** Everything goes through `claude` CLI subprocess (this is what makes it Max-billed instead of API-billed). `lib/claude-cli.ts:spawnEnv` strips `ANTHROPIC_API_KEY` before spawn so the CLI uses OAuth.
- **MCP servers are disabled** via `--strict-mcp-config` so spawned `claude` doesn't pick up Gmail/Drive/Calendar tools from the user's claude.ai integrations.
- **Memory writing rules** live in `app/api/chat/route.ts:formatMemorySection`. They tell experts: read freely, write rarely. Don't duplicate these in expert prompts.
- **Models are set in the UI**, not in code: the model pill in the chat header (all experts) and the router model under the Auto-route toggle. Stored in `.settings.json` (gitignored) via `/api/settings`; defaults and the dropdown list live in `lib/models.ts`. An expert's `model:` frontmatter overrides the global choice (its pill then becomes read-only). Don't hardcode model ids in expert files.
- **Per-chat effort** is stored in the chat's JSONL meta line and passed to `--effort`. Default is `xhigh`.
- **Tools wired**: `WebFetch` and `WebSearch` are always on for every expert. `Read` / `Edit` / `Write` are enabled when the expert has memory **or** when the user has attached files in this chat.
- **Attachments use Path A (Read-tool transport).** Files saved under `chats/<expert>/<chatId>.attachments/`. The chat route extends `--add-dir` to include that directory and appends `[attached image: /path]` hints to the prompt; the model uses the `Read` tool to load them. We do *not* use `--input-format stream-json` to pass content blocks.
- **Mermaid + iCal are universal.** The chat route injects ```mermaid``` and ```ics``` instructions into every system prompt. Don't put them in individual expert prompts.
- **Message queue (client-only, max 3).** Sending while a reply streams puts the message in `queue` in `ChatPanel`; an effect sends the next one when `busy` turns false, so it always runs with fresh `messages`. Stop and switching chat/expert put queued text and files back into the input. Not persisted.
- **Stop button = `AbortController`.** Client `fetch` aborts → `req.signal` propagates to `streamClaudeChat` → server `SIGTERM`s the spawned `claude` proc. Partial output is preserved.
- **Chats resume a CLI session.** After a clean turn the chat route saves `chats/<expert>/<chatId>.session.json` (session id + message count + fingerprint of the messages). The next turn `--resume`s it and sends only the new message, so history comes from prompt cache. If the messages no longer match (edit, abort, error) or the session is gone, it falls back to the full-transcript prompt and starts a new session.
- **Streaming renders are batched per animation frame** (`createFrameBatcher` in `ChatPanel.tsx`). Don't go back to one `setMessages` per token — the streaming bubble re-parses its whole markdown on every render.
- **Per-expert browser tabs.** Tab title = expert name and favicon = `/api/expert-icon/<id>` via `generateMetadata`. Next leaves the previous page's icon `<link>` in `<head>` on client navigation, so `ChatPanel` re-points all icon links at the selected expert.
- **Memory diffs are persisted, activity is not.** The chat route snapshots the expert's memory dir before the turn; after each successful Edit/Write it streams a `changes` event (diff vs. that snapshot). The client keeps the latest one on the reply and saves it as `changes` on the assistant message line, so diffs survive reloads. Not part of the session fingerprint or the transcript.
- **Activity (thinking + tool calls) is live-only — never persisted.** Keeps JSONL chat files small.
- **Chat history JSONL** files live at `chats/<expert>/<chatId>.jsonl` with a meta line followed by message lines. Pure append after first user message (which updates the auto-derived title).
- **Tailwind content paths include `lib/**`** because `lib/expertColor.ts` declares dynamic colour classes as string literals — without scanning `lib/`, JIT prunes them and per-expert colours disappear.
- **`Message` is `React.memo`-wrapped** with a custom comparator that ignores callback identity. Without this, every keystroke in the input re-renders all bubbles (ReactMarkdown re-parsing) and typing visibly lags in long chats.

## Commands

- `npm run prod` — the everyday way to run it: production server on port 3000, built into `.next-prod`, rebuilt only when code changed since the last build. Code edits show up after restarting it (experts/memory are read at runtime, no rebuild needed).
- `npm run dev` — dev server on port 3000 (hot reload, much slower). Both use port 3000; `npm run prod` stops a running dev server first.
- `npx tsc --noEmit` — type check (no build artifacts).

## Don't

- Don't add features beyond what the user asks for. The user has strong opinions about UI density and visual style and wants minimum scope.
- Don't claim "feature X is done" without checking it actually compiles and the dev server is happy. The Bash tool can curl `http://localhost:3000` to confirm.
- **Two repos.** This repo is the shareable app: never commit anything from `data/` (experts, memory) or `chats/`. `data/` is a separate personal git repo — commit expert/memory changes there.
- Don't put chat history in `memory/`. Memory is for user-visible facts the expert reads; chats live in their own top-level `chats/` folder (gitignored).
