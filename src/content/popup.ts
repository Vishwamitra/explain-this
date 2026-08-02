import type { BackgroundToContentMessage, ContentToBackgroundMessage, ExplainAction } from "../shared/messages";
import popupCss from "./popup.css?raw";

const FIRST_RUN_KEY = "explainThisSeenFirstRunNotice";
const FIRST_RUN_NOTICE =
  "First use: downloading a small local AI model (~880MB), one time. After that it works instantly offline.";

const ACTIONS: { label: string; action: ExplainAction }[] = [
  { label: "Regenerate", action: "regenerate" },
  { label: "Elaborate", action: "elaborate" },
  { label: "Simplify", action: "simplify" },
  { label: "Example", action: "example" }
];

interface PopupElements {
  notice: HTMLParagraphElement;
  spinner: HTMLDivElement;
  progressWrap: HTMLDivElement;
  progressBar: HTMLDivElement;
  progressLabel: HTMLDivElement;
  text: HTMLDivElement;
  error: HTMLDivElement;
  actions: HTMLDivElement;
  copyBtn: HTMLButtonElement;
}

let currentRequestId: string | null = null;
let host: HTMLDivElement | null = null;
let els: PopupElements | null = null;

function build() {
  host = document.createElement("div");
  host.id = "explain-this-host";
  Object.assign(host.style, {
    position: "fixed",
    top: "0px",
    left: "0px",
    zIndex: "2147483647"
  });
  document.documentElement.appendChild(host);

  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = popupCss;
  root.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "panel";
  root.appendChild(panel);

  const closeBtn = document.createElement("button");
  closeBtn.className = "close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", dismiss);
  panel.appendChild(closeBtn);

  const notice = document.createElement("p");
  notice.className = "notice hidden";
  panel.appendChild(notice);

  const spinner = document.createElement("div");
  spinner.className = "spinner hidden";
  panel.appendChild(spinner);

  const progressWrap = document.createElement("div");
  progressWrap.className = "progress-wrap hidden";
  const progressTrack = document.createElement("div");
  progressTrack.className = "progress-track";
  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";
  progressTrack.appendChild(progressBar);
  const progressLabel = document.createElement("div");
  progressLabel.className = "progress-label";
  progressWrap.appendChild(progressTrack);
  progressWrap.appendChild(progressLabel);
  panel.appendChild(progressWrap);

  const text = document.createElement("div");
  text.className = "text hidden";
  panel.appendChild(text);

  const error = document.createElement("div");
  error.className = "error hidden";
  panel.appendChild(error);

  const actions = document.createElement("div");
  actions.className = "actions hidden";

  const copyBtn = document.createElement("button");
  copyBtn.className = "action-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", onCopyClick);
  actions.appendChild(copyBtn);

  for (const { label, action } of ACTIONS) {
    const btn = document.createElement("button");
    btn.className = "action-btn";
    btn.textContent = label;
    btn.addEventListener("click", () => sendAction(action));
    actions.appendChild(btn);
  }
  panel.appendChild(actions);

  els = { notice, spinner, progressWrap, progressBar, progressLabel, text, error, actions, copyBtn };

  document.addEventListener("keydown", onKeydown);
  document.addEventListener("mousedown", onOutsideClick, true);
}

function hideAllStatus() {
  if (!els) return;
  els.notice.classList.add("hidden");
  els.spinner.classList.add("hidden");
  els.progressWrap.classList.add("hidden");
  els.error.classList.add("hidden");
  els.actions.classList.add("hidden");
}

function sendAction(action: ExplainAction) {
  if (!currentRequestId) return;
  const message: ContentToBackgroundMessage = { type: "ACTION_REQUEST", requestId: currentRequestId, action };
  chrome.runtime.sendMessage(message).catch(() => {
    console.warn("Explain This: failed to send action request");
  });
}

function onCopyClick() {
  if (!els) return;
  const text = els.text.textContent ?? "";
  const button = els.copyBtn;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = original;
      }, 1200);
    })
    .catch(() => {
      console.warn("Explain This: clipboard write failed");
    });
}

function positionNear(rect: DOMRect) {
  if (!host) return;
  const popupWidth = 320;
  const top = window.scrollY + rect.bottom + 8;
  const left = Math.min(
    window.scrollX + rect.left,
    window.scrollX + document.documentElement.clientWidth - popupWidth - 16
  );
  host.style.top = `${Math.max(top, 0)}px`;
  host.style.left = `${Math.max(left, 8)}px`;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") dismiss();
}

function onOutsideClick(event: MouseEvent) {
  if (host && !event.composedPath().includes(host)) dismiss();
}

function dismiss() {
  host?.remove();
  host = null;
  els = null;
  currentRequestId = null;
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("mousedown", onOutsideClick, true);
}

function showLoading(requestId: string) {
  const selection = window.getSelection();
  const rect = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null;

  currentRequestId = requestId;
  if (!host) build();
  if (rect) positionNear(rect);
  if (!els) return;

  hideAllStatus();
  els.text.classList.add("hidden");
  els.text.textContent = "";

  if (!localStorage.getItem(FIRST_RUN_KEY)) {
    els.notice.textContent = FIRST_RUN_NOTICE;
    els.notice.classList.remove("hidden");
    localStorage.setItem(FIRST_RUN_KEY, "1");
  }

  els.spinner.classList.remove("hidden");
}

function updateModelProgress(requestId: string, progress: number, statusText: string) {
  if (requestId !== currentRequestId || !els) return;
  els.spinner.classList.add("hidden");
  els.progressWrap.classList.remove("hidden");
  els.progressBar.style.width = `${Math.round(progress * 100)}%`;
  els.progressLabel.textContent = statusText;
}

function appendChunk(requestId: string, delta: string) {
  if (requestId !== currentRequestId || !els) return;
  hideAllStatus();
  els.text.classList.remove("hidden");
  els.text.textContent += delta;
}

function finish(requestId: string, fullText: string) {
  if (requestId !== currentRequestId || !els) return;
  hideAllStatus();
  els.text.classList.remove("hidden");
  els.text.textContent = fullText;
  els.actions.classList.remove("hidden");
}

function showError(requestId: string, message: string) {
  if (requestId !== currentRequestId || !els) return;
  hideAllStatus();
  els.error.textContent = message;
  els.error.classList.remove("hidden");
}

export function handlePopupMessage(message: BackgroundToContentMessage) {
  switch (message.type) {
    case "SHOW_LOADING":
      showLoading(message.requestId);
      break;
    case "MODEL_LOAD_PROGRESS":
      updateModelProgress(message.requestId, message.progress, message.text);
      break;
    case "EXPLAIN_STREAM_CHUNK":
      appendChunk(message.requestId, message.delta);
      break;
    case "EXPLAIN_STREAM_DONE":
      finish(message.requestId, message.fullText);
      break;
    case "EXPLAIN_ERROR":
      showError(message.requestId, message.message);
      break;
  }
}
