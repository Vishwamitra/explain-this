import type {
  BackgroundToContentMessage,
  BackgroundToOffscreenMessage,
  ContentToBackgroundMessage,
  ExplainAction,
  OffscreenToBackgroundMessage
} from "../shared/messages";

const OFFSCREEN_URL = "src/offscreen/offscreen.html";
const MENU_ID = "explain-this";

// Which tab each in-flight request came from and the original selected text,
// so a follow-up action can regenerate without re-selecting anything, and so
// streamed offscreen messages can be routed back to the right tab (offscreen
// documents have no tabs API).
interface RequestInfo {
  tabId: number;
  text: string;
}

const requests = new Map<string, RequestInfo>();

// If the offscreen document dies mid-generation (killed by Chrome, torn down
// by an extension update), no more messages ever arrive and the request would
// hang forever. Re-armed on every sign of life, fires if one goes quiet.
const REQUEST_TIMEOUT_MS = 45_000;
const requestTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearRequestTimeout(requestId: string) {
  const handle = requestTimeouts.get(requestId);
  if (handle !== undefined) {
    clearTimeout(handle);
    requestTimeouts.delete(requestId);
  }
}

function armRequestTimeout(requestId: string, tabId: number) {
  clearRequestTimeout(requestId);
  const handle = setTimeout(() => {
    requestTimeouts.delete(requestId);
    requests.delete(requestId);
    sendToTab(tabId, {
      type: "EXPLAIN_ERROR",
      requestId,
      message: "Lost contact with the offscreen document. Try again."
    });
    setBusy(false);
  }, REQUEST_TIMEOUT_MS);
  requestTimeouts.set(requestId, handle);
}

// The WebLLM engine is a single shared instance in the offscreen document, so
// only one explanation can generate at a time in v1. Disable the menu item
// rather than let a second click collide with it.
let busy = false;

function setBusy(value: boolean) {
  busy = value;
  chrome.contextMenus.update(MENU_ID, {
    enabled: !value,
    title: value ? "Explain This (working...)" : "Explain This"
  });
}

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

async function startGenerate(requestId: string, tabId: number, text: string, action?: ExplainAction) {
  requests.set(requestId, { tabId, text });
  setBusy(true);
  armRequestTimeout(requestId, tabId);

  sendToTab(tabId, { type: "SHOW_LOADING", requestId });

  try {
    await ensureOffscreenDocument();
    await sendToOffscreen({ type: "OFFSCREEN_GENERATE", requestId, text, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    clearRequestTimeout(requestId);
    sendToTab(tabId, { type: "EXPLAIN_ERROR", requestId, message });
    requests.delete(requestId);
    setBusy(false);
  }
}

// Registering only in chrome.runtime.onInstalled isn't reliable enough: it
// fires on a fresh install or a version bump, but not on every service
// worker wake-up. Re-registering on every startup, with removeAll() first
// to avoid a duplicate-id error, covers install, update, and reload alike.
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Explain This",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText || !tab?.id || busy) return;
  await startGenerate(crypto.randomUUID(), tab.id, info.selectionText);
});

chrome.runtime.onMessage.addListener((message: OffscreenToBackgroundMessage | ContentToBackgroundMessage) => {
  if (message.type === "ACTION_REQUEST") {
    if (busy) return;
    const request = requests.get(message.requestId);
    if (!request) {
      console.warn("Explain This: no stored text for request", message.requestId);
      return;
    }
    startGenerate(message.requestId, request.tabId, request.text, message.action);
    return;
  }

  const request = requests.get(message.requestId);
  if (!request) {
    console.warn("Explain This: no tab found for request", message.requestId);
    return;
  }

  sendToTab(request.tabId, message);

  if (message.type === "EXPLAIN_STREAM_DONE" || message.type === "EXPLAIN_ERROR") {
    clearRequestTimeout(message.requestId);
    setBusy(false);
  } else {
    armRequestTimeout(message.requestId, request.tabId);
  }
});

console.log("Explain This: background service worker loaded");
