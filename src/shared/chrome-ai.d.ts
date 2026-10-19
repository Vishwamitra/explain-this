// Minimal typings for Chrome's built-in Prompt API, which @types/chrome does
// not cover yet: https://developer.chrome.com/docs/ai/prompt-api

interface AIDownloadMonitor {
  addEventListener(type: "downloadprogress", listener: (event: { loaded: number }) => void): void;
}

interface LanguageModelIOOptions {
  expectedInputs?: { type: "text" | "image" | "audio"; languages?: string[] }[];
  expectedOutputs?: { type: "text"; languages?: string[] }[];
}

interface LanguageModelSession {
  promptStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}

declare const LanguageModel: {
  availability(options?: LanguageModelIOOptions): Promise<string>;
  create(
    options?: LanguageModelIOOptions & {
      initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
      monitor?: (monitor: AIDownloadMonitor) => void;
      signal?: AbortSignal;
    }
  ): Promise<LanguageModelSession>;
};
