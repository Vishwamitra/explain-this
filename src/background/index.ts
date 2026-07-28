import type {
  BackgroundToContentMessage,
  BackgroundToOffscreenMessage,
  OffscreenToBackgroundMessage
} from "../shared/messages";

const OFFSCREEN_URL = "src/offscreen/offscreen.html";
const MENU_ID = "explain-this";

// Which tab each in-flight request came from, so streamed offscreen messages
// can be routed back to the right tab (offscreen documents have no tabs API).
const requestTabs = new Map<string, number>();

async function ensureOffscreenDocument() {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (hasDocument) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: "Run a local LLM via WebGPU to generate on-page explanations"
  });
}

// chrome.offscreen.createDocument() resolves once the document exists, but its
// module script (which registers the message listener) may not have finished
// running yet. Retry past the resulting "Receiving end does not exist" error.
async function sendToOffscreen(message: BackgroundToOffscreenMessage, attempts = 20) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await chrome.runtime.sendMessage(message);
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Explain This",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText || !tab?.id) return;

  const requestId = crypto.randomUUID();
  requestTabs.set(requestId, tab.id);

  const loadingMessage: BackgroundToContentMessage = { type: "SHOW_LOADING", requestId };
  chrome.tabs.sendMessage(tab.id, loadingMessage);

  await ensureOffscreenDocument();
  await sendToOffscreen({ type: "OFFSCREEN_GENERATE", requestId, text: info.selectionText });
});

chrome.runtime.onMessage.addListener((message: OffscreenToBackgroundMessage) => {
  const tabId = requestTabs.get(message.requestId);
  if (tabId === undefined) {
    console.warn("Explain This: no tab found for request", message.requestId);
    return;
  }

  chrome.tabs.sendMessage(tabId, message);

  if (message.type === "EXPLAIN_STREAM_DONE" || message.type === "EXPLAIN_ERROR") {
    requestTabs.delete(message.requestId);
  }
});

console.log("Explain This: background service worker loaded");
