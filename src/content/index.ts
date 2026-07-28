import type { BackgroundToContentMessage } from "../shared/messages";

// Temporary console logging — replaced by real popup rendering in the next step.
chrome.runtime.onMessage.addListener((message: BackgroundToContentMessage) => {
  console.log("Explain This: content received", message);
});

console.log("Explain This: content script loaded");
