import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { recordUsage } from "./usage";

function recordFromResultEvent(evt: any) {
  const u = evt?.usage;
  if (!u) return;
  void recordUsage({
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheCreation: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cost: typeof evt.total_cost_usd === "number" ? evt.total_cost_usd : 0,
  });
}

const ROUTER_FLAGS = [
  "--tools", "",
  "--no-session-persistence",
  "--permission-mode", "bypassPermissions",
  // Disable any MCP servers (Gmail/Drive/Calendar from Claude.ai integration etc.)
  // so spawned claude doesn't hallucinate "I can save to Drive" capabilities.
  "--strict-mcp-config",
];

function spawnEnv(): NodeJS.ProcessEnv {
  const { ANTHROPIC_API_KEY: _drop, ...rest } = process.env;
  return rest;
}

export interface ClaudeRunOptions {
  prompt: string;
  systemPrompt: string;
  model: string;
}

export async function runClaudeJson(opts: ClaudeRunOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", [
      "-p", opts.prompt,
      "--system-prompt", opts.systemPrompt,
      "--model", opts.model,
      "--output-format", "json",
      ...ROUTER_FLAGS,
    ], { stdio: ["ignore", "pipe", "pipe"], env: spawnEnv() });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        recordFromResultEvent(parsed);
        if (parsed.is_error) {
          reject(new Error(parsed.result || "claude returned error"));
          return;
        }
        resolve(String(parsed.result ?? ""));
      } catch {
        reject(new Error(`Bad claude JSON: ${stdout.slice(0, 500)}`));
      }
    });
  });
}

export type ChatStreamEvent =
  | { type: "text"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_use"; id: string; name: string; input?: any }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean }
  | { type: "stage"; kind: "spawning" | "connected" }
  | { type: "heartbeat" }
  | { type: "error"; message: string }
  | { type: "result"; sessionId: string | null; isError: boolean; numTurns: number; message: string };

export interface StreamChatOptions extends ClaudeRunOptions {
  tools?: string[];
  addDirs?: string[];
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  signal?: AbortSignal;
  resume?: string;
  persistSession?: boolean;
}

export function streamClaudeChat(opts: StreamChatOptions): {
  events: AsyncGenerator<ChatStreamEvent>;
  done: Promise<void>;
} {
  // Write system prompt to a temp file. Passing it via --system-prompt as an
  // argv string fails with E2BIG once the transcript pushes past ~128 KB
  // (Linux MAX_ARG_STRLEN). --system-prompt-file reads from disk, no limit.
  const sysPromptFile = path.join(os.tmpdir(), `expert-chat-sys-${crypto.randomUUID()}.txt`);
  fs.writeFileSync(sysPromptFile, opts.systemPrompt, "utf8");

  const tools = opts.tools && opts.tools.length > 0 ? opts.tools.join(" ") : "";
  const args = [
    "-p",
    "--system-prompt-file", sysPromptFile,
    "--model", opts.model,
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--tools", tools,
    "--permission-mode", "bypassPermissions",
    "--strict-mcp-config",
  ];
  if (opts.resume) {
    args.push("--resume", opts.resume);
  } else if (!opts.persistSession) {
    args.push("--no-session-persistence");
  }
  for (const dir of opts.addDirs ?? []) {
    args.push("--add-dir", path.resolve(dir));
  }
  if (opts.effort) {
    args.push("--effort", opts.effort);
  }

  // Prompt goes via stdin: it carries the prior transcript, which can exceed
  // the ~128 KB argv limit.
  const proc = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], env: spawnEnv() });
  proc.stdin.on("error", () => {});
  proc.stdin.end(opts.prompt);
  proc.stderr.on("data", (d) => process.stderr.write(`[claude] ${d}`));

  const cleanup = () => {
    fs.promises.unlink(sysPromptFile).catch(() => {});
  };

  // Wire abort: when caller aborts (typically client disconnect), kill the proc.
  if (opts.signal) {
    if (opts.signal.aborted) {
      proc.kill("SIGTERM");
    } else {
      opts.signal.addEventListener("abort", () => {
        try { proc.kill("SIGTERM"); } catch {}
      }, { once: true });
    }
  }

  const done = new Promise<void>((resolve, reject) => {
    proc.on("error", (err) => { cleanup(); reject(err); });
    proc.on("close", (code, sig) => {
      cleanup();
      if (code === 0 || sig === "SIGTERM") resolve();
      else reject(new Error(`claude exited ${code}`));
    });
  });

  async function* events(): AsyncGenerator<ChatStreamEvent> {
    let buffer = "";
    for await (const chunk of proc.stdout) {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let evt: any;
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }

        if (evt.type === "stream_event") {
          const inner = evt.event;
          if (inner?.type === "content_block_delta") {
            const d = inner.delta;
            if (d?.type === "text_delta" && typeof d.text === "string") {
              yield { type: "text", delta: d.text };
            } else if (d?.type === "thinking_delta" && typeof d.thinking === "string") {
              yield { type: "thinking_delta", delta: d.thinking };
            }
          }
        } else if (evt.type === "assistant") {
          const blocks = evt.message?.content ?? [];
          for (const block of blocks) {
            if (block?.type === "tool_use") {
              yield {
                type: "tool_use",
                id: String(block.id ?? ""),
                name: String(block.name ?? "tool"),
                input: block.input,
              };
            }
          }
        } else if (evt.type === "user") {
          // Tool results come back wrapped in user-typed messages.
          const blocks = evt.message?.content ?? [];
          for (const block of blocks) {
            if (block?.type === "tool_result") {
              const raw = block.content;
              let content = "";
              if (typeof raw === "string") {
                content = raw;
              } else if (Array.isArray(raw)) {
                content = raw
                  .map((b: any) => (typeof b === "string" ? b : (b?.text ?? JSON.stringify(b))))
                  .join("");
              } else if (raw != null) {
                content = JSON.stringify(raw);
              }
              yield {
                type: "tool_result",
                toolUseId: String(block.tool_use_id ?? ""),
                content,
                isError: Boolean(block.is_error),
              };
            }
          }
        } else if (evt.type === "result") {
          recordFromResultEvent(evt);
          const errors = Array.isArray(evt.errors) ? evt.errors.join("; ") : "";
          yield {
            type: "result",
            sessionId: typeof evt.session_id === "string" ? evt.session_id : null,
            isError: Boolean(evt.is_error),
            numTurns: typeof evt.num_turns === "number" ? evt.num_turns : 0,
            message: String(evt.result ?? (errors || "claude error")),
          };
        }
      }
    }
  }

  return { events: events(), done };
}
