import type { OffscreenToBackgroundMessage } from "../shared/messages";

const OFFSCREEN_URL = "src/offscreen/offscreen.html";

async function ensureOffscreenDocument() {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (hasDocument) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: "Run a local LLM via WebGPU to generate on-page explanations"
  });
}

// Temporary manual test trigger — replaced by context-menu wiring in the next step.
chrome.action.onClicked.addListener(async () => {
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({ type: "OFFSCREEN_RUN_TEST" });
});

// Temporary logging listener — replaced by tab-routing logic in the next step.
chrome.runtime.onMessage.addListener((message: OffscreenToBackgroundMessage) => {
  console.log("Explain This: background received", message);
});

console.log("Explain This: background service worker loaded");
