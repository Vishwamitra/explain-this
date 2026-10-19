import type { ExplainAction } from "./messages";

export const PROMPTS: Record<"explain" | ExplainAction, string> = {
  explain: "Explain the following text in simple, plain language. Be concise: a few sentences at most.",
  regenerate:
    "Explain the following text in simple, plain language. Phrase it differently from a typical explanation: same meaning, different wording or structure.",
  elaborate: "Give a more detailed, in-depth explanation of the following text than a brief summary would.",
  simplify: "Explain the following text as simply and briefly as possible. Minimal jargon, plain everyday words.",
  example:
    "Explain the following text in simple, plain language, and include one concrete example to illustrate it."
};
