# How to create a new expert

The quickest way is the **+** button next to "Experts" in the sidebar: give a name, language and brief, Claude drafts the description + system prompt from this guide (`app/api/experts/draft`), you review and create. The rules below still apply — the draft endpoint feeds this file to Claude verbatim, so editing this guide changes what gets drafted.

Each `data/experts/<id>.md` file defines one expert. **This guide is the source of truth — whenever an expert is added or modified, follow these rules.**

## 1. Pick an `id`

- **kebab-case, lowercase**, descriptive. Examples: `fire-advisor`, `ai-mentor`, `travel-planner`.
- The id becomes:
  - Filename: `data/experts/<id>.md`
  - Memory directory: `data/memory/<id>/`
  - Chat history directory: `chats/<id>/`

## 2. Create `data/experts/<id>.md`

Required frontmatter:

```yaml
---
name: Display Name
description: One sentence pitch — used in the sidebar and as input to the auto-router. Mention the language at the end (e.g. "Speaks Slovak." or "Speaks English.").
---
```

Optional frontmatter:

- `model: <model-id>` — override the model for this expert only. Default: the global model picked in the chat header (stored in `.settings.json`). Leave it out unless the expert genuinely needs a different model.
- `memoryDir: <path>` — custom memory location. Default: `data/memory/<id>/`. Relative paths resolve from the `data/experts/` folder.

## 3. System prompt structure

The body of the expert markdown file is the system prompt. Use these sections (in this order, in the language the expert will speak):

1. **ROLE** — single short paragraph: who is this expert, primary objective.
2. **STYLE / TONE** — how they communicate. Direct? Friendly? Heavy with bullets? Emoji-rich? Anti-sycophancy %?
3. **EXPERTISE / WHAT I KNOW** — domains, frameworks, tools, models.
4. **HOW WE WORK** — the process they follow turn-to-turn (e.g. "ask before assuming", "always show numbers", "give 2-3 hypotheses when data is thin").
5. **WHAT I DON'T DO** — explicit anti-patterns and refusals. Forces the model away from common failure modes (long preambles, empty validation, recommending things they shouldn't).
6. **RESPONSE FORMAT** — structure preferences (markdown, bullets, code blocks with language tags, when to include TL;DR).
7. **DISCLAIMER** — explicit boundaries (not a clinician / not a licensed advisor / info has expiry).

Keep it in second person (`You are X`, `Your job is Y`). Short, concrete, opinionated > long and hedged.

## 4. Memory directory (optional but recommended)

If the expert should track persistent state, create `data/memory/<id>/` with these subdirectories:

- `readonly/` — stable user-curated facts. The expert reads but **never modifies**. Examples: `profile.md` (identity, role, goals).
- `editable/` — current state files. Expert may rewrite when state changes. Examples: `current-strategy.md`, `learning-state.md`.
- `journal/` — append-only chronological log, one file per month (`YYYY-MM.md`). Expert appends after confirmed decisions or completed actions.
- `archived/` — completed/closed documents moved here from `editable/`. Expert reads but **never modifies**. Historical record.

If `data/memory/<id>/` doesn't exist or contains no `.md` files, the expert runs **without Read/Edit/Write tools** — pure conversational mode. That's fine for some experts (one-shot Q&A bots).

When memory is present, the chat route automatically:
- Injects an inventory of files into the system prompt (filenames + sizes + previews).
- Enables `Read`, `Edit`, `Write` tools scoped to `data/memory/<id>/`.
- Adds **strict writing rules** (read freely, write rarely; only on explicit user command, fait accompli, or accepted proposal).

## 5. Test checklist

Before considering the expert done:

- [ ] New chat starts cleanly and reflects the right persona / tone.
- [ ] Expert doesn't hallucinate tools it shouldn't have (no "I'll save to Drive" if it's purely conversational).
- [ ] If memory present: expert reads relevant files before personalised advice.
- [ ] If memory present: expert does **not** write unprompted on exploratory questions. Writes only on commands like "save this" / "rozhodol som sa X".
- [ ] Auto-router (Haiku) routes correctly when the user message is in this expert's domain. Adjust `description` if routing is wrong.

## 6. Ongoing maintenance

- The expert's system prompt is the **fastest lever** for behaviour change. Tighten/loosen rules here when the expert behaves wrong.
- The memory writing rules ("read freely, write rarely") live in `app/api/chat/route.ts:formatMemorySection` and apply to all experts uniformly. Don't duplicate those rules in the expert prompt.
