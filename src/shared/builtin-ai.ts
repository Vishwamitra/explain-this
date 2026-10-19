export type BuiltInStatus = "unsupported" | "unavailable" | "downloadable" | "downloading" | "available";

// The availability check and every later call must use the same options.
const IO: LanguageModelIOOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }]
};

export async function builtInStatus(): Promise<BuiltInStatus> {
  if (typeof LanguageModel === "undefined") return "unsupported";
  try {
    const status = await LanguageModel.availability(IO);
    return status === "available" || status === "downloadable" || status === "downloading" ? status : "unavailable";
  } catch (err) {
    console.warn("Explain This: built-in model availability check failed", err);
    return "unavailable";
  }
}

// Starts Chrome's one-time model download. Chrome only allows that from a user
// gesture, so call this from a click handler on an extension page.
export async function downloadBuiltIn(onProgress: (fraction: number) => void): Promise<void> {
  const session = await LanguageModel.create({
    ...IO,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => onProgress(event.loaded));
    }
  });
  session.destroy();
}

export async function streamBuiltIn(
  systemPrompt: string,
  text: string,
  onDelta: (delta: string) => void
): Promise<string> {
  const session = await LanguageModel.create({ ...IO, initialPrompts: [{ role: "system", content: systemPrompt }] });
  try {
    const reader = session.promptStreaming(text).getReader();
    let full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Depending on the Chrome version a chunk is either just the new text or
      // the full text so far. Handle both.
      const cumulative = full !== "" && value.startsWith(full);
      const delta = cumulative ? value.slice(full.length) : value;
      full = cumulative ? value : full + value;
      if (delta) onDelta(delta);
    }
    return full;
  } finally {
    session.destroy();
  }
}
