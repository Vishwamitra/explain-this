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

// A tab's content script can be gone (closed, navigated away, or, during
// development, a stale instance left over from before an extension reload).
// That's a normal race, not a bug, so swallow it rather than logging an
// uncaught rejection.
function sendToTab(tabId: number, message: BackgroundToContentMessage) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    console.warn("Explain This: no content script listening in tab", tabId);
  });
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

  sendToTab(tab.id, { type: "SHOW_LOADING", requestId });

  await ensureOffscreenDocument();
  await sendToOffscreen({ type: "OFFSCREEN_GENERATE", requestId, text: info.selectionText });
});

chrome.runtime.onMessage.addListener((message: OffscreenToBackgroundMessage) => {
  const tabId = requestTabs.get(message.requestId);
  if (tabId === undefined) {
    console.warn("Explain This: no tab found for request", message.requestId);
    return;
  }

  sendToTab(tabId, message);

  if (message.type === "EXPLAIN_STREAM_DONE" || message.type === "EXPLAIN_ERROR") {
    requestTabs.delete(message.requestId);
  }
});

console.log("Explain This: background service worker loaded");
