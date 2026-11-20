export const MODEL_OPTIONS = [
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "claude-fable-5-1",
];

export const DEFAULT_EXPERT_MODEL = "claude-opus-5-5";
export const DEFAULT_ROUTER_MODEL = "claude-haiku-5-5";

export function isValidModelId(id: unknown): id is string {
  return typeof id === "string" && id.length <= 100 && /^[a-z][a-z0-9.\-\[\]]*$/i.test(id);
}
