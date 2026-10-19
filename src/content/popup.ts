import type {
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
  EngineKind,
  ExplainAction
} from "../shared/messages";
import { rankPassages } from "../shared/retrieval";
import { collectPassages } from "./page-text";
import popupCss from "./popup.css?raw";

const FIRST_RUN_KEY = "explainThisSeenFirstRunNotice";
const FIRST_RUN_NOTICE =
  "First use: downloading a small local AI model (~880MB), one time. After that it works instantly offline.";

const ENGINE_LABELS: Record<EngineKind, string> = {
  chrome: "Answered by Chrome's built-in model",
  webllm: "Answered by WebLLM"
};

const ASK_PASSAGE_LIMIT = 4;
const NOTHING_FOUND = "I couldn't find anything on this page that relates to that question.";

const ACTIONS: { label: string; action: ExplainAction }[] = [
  { label: "Regenerate", action: "regenerate" },
  { label: "Elaborate", action: "elaborate" },
  { label: "Simplify", action: "simplify" },
  { label: "Example", action: "example" }
];

interface PopupElements {
  askForm: HTMLFormElement;
  askInput: HTMLInputElement;
  askBtn: HTMLButtonElement;
  notice: HTMLParagraphElement;
  spinner: HTMLDivElement;
  progressWrap: HTMLDivElement;
  progressBar: HTMLDivElement;
  progressLabel: HTMLDivElement;
  text: HTMLDivElement;
  meta: HTMLDivElement;
  error: HTMLDivElement;
  actions: HTMLDivElement;
  copyBtn: HTMLButtonElement;
  explainBtns: HTMLButtonElement[];
}

let currentRequestId: string | null = null;
let mode: "explain" | "ask" = "explain";
// The page element behind each [n] citation of the current answer.
let citations: Element[] = [];
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

  const askForm = document.createElement("form");
  askForm.className = "ask hidden";
  const askInput = document.createElement("input");
  askInput.className = "ask-input";
  askInput.type = "text";
  askInput.placeholder = "Ask this page a question";
  // Keep the page's own keyboard shortcuts from firing while the user types.
  for (const type of ["keydown", "keyup", "keypress"]) {
    askInput.addEventListener(type, (event) => event.stopPropagation());
  }
  const askBtn = document.createElement("button");
  askBtn.className = "action-btn";
  askBtn.type = "submit";
  askBtn.textContent = "Ask";
  askForm.append(askInput, askBtn);
  askForm.addEventListener("submit", onAskSubmit);
  panel.appendChild(askForm);

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

  const meta = document.createElement("div");
  meta.className = "meta hidden";
  panel.appendChild(meta);

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

  const explainBtns: HTMLButtonElement[] = [];
  for (const { label, action } of ACTIONS) {
    const btn = document.createElement("button");
    btn.className = "action-btn";
    btn.textContent = label;
    btn.addEventListener("click", () => sendAction(action));
    actions.appendChild(btn);
    explainBtns.push(btn);
  }
  panel.appendChild(actions);

  els = { askForm, askInput, askBtn, notice, spinner, progressWrap, progressBar, progressLabel, text, meta, error, actions, copyBtn, explainBtns };

  document.addEventListener("keydown", onKeydown);
  document.addEventListener("mousedown", onOutsideClick, true);
}

function hideAllStatus() {
  if (!els) return;
  els.notice.classList.add("hidden");
  els.spinner.classList.add("hidden");
  els.progressWrap.classList.add("hidden");
  els.error.classList.add("hidden");
  els.meta.classList.add("hidden");
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
  mode = "explain";
  citations = [];
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("mousedown", onOutsideClick, true);
}

function showLoading(requestId: string) {
  const selection = window.getSelection();
  const rect = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null;

  // An ask in progress reuses its own request id; anything else is a fresh
  // explanation, which takes over the popup.
  const continuingAsk = mode === "ask" && requestId === currentRequestId;
  if (!continuingAsk) {
    mode = "explain";
    citations = [];
  }

  currentRequestId = requestId;
  if (!host) build();
  if (rect && !continuingAsk) positionNear(rect);
  if (!els) return;

  els.askForm.classList.toggle("hidden", mode !== "ask");
  els.askBtn.disabled = true;
  for (const btn of els.explainBtns) btn.classList.toggle("hidden", mode === "ask");

  hideAllStatus();
  els.text.classList.add("hidden");
  els.text.textContent = "";

  els.spinner.classList.remove("hidden");
}

function updateModelProgress(requestId: string, progress: number, statusText: string) {
  if (requestId !== currentRequestId || !els) return;
  // Progress events only arrive when WebLLM is loading its model, so this is
  // the first point where we know the one-time download notice applies.
  if (!localStorage.getItem(FIRST_RUN_KEY)) {
    els.notice.textContent = FIRST_RUN_NOTICE;
    els.notice.classList.remove("hidden");
    localStorage.setItem(FIRST_RUN_KEY, "1");
  }
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

function finish(requestId: string, fullText: string, engine: EngineKind) {
  if (requestId !== currentRequestId || !els) return;
  hideAllStatus();
  els.text.classList.remove("hidden");
  if (mode === "ask") renderAnswer(els.text, fullText);
  else els.text.textContent = fullText;
  els.askBtn.disabled = false;
  els.meta.textContent = ENGINE_LABELS[engine];
  els.meta.classList.remove("hidden");
  els.actions.classList.remove("hidden");
}

function showError(requestId: string, message: string) {
  if (requestId !== currentRequestId || !els) return;
  hideAllStatus();
  els.error.textContent = message;
  els.error.classList.remove("hidden");
  els.askBtn.disabled = false;
}

// Turns [n] markers into buttons that scroll to the passage they came from.
function renderAnswer(target: HTMLElement, answer: string) {
  target.textContent = "";
  answer.split(/(\[\d+\])/).forEach((part) => {
    const match = /^\[(\d+)\]$/.exec(part);
    const source = match ? citations[Number(match[1]) - 1] : undefined;
    if (!source) {
      target.append(part);
      return;
    }
    const cite = document.createElement("button");
    cite.className = "cite";
    cite.type = "button";
    cite.textContent = part;
    cite.addEventListener("click", () => jumpTo(source));
    target.append(cite);
  });
}

function jumpTo(el: Element) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.animate([{ backgroundColor: "rgba(122, 162, 255, 0.5)" }, { backgroundColor: "transparent" }], {
    duration: 2000
  });
}

function onAskSubmit(event: SubmitEvent) {
  event.preventDefault();
  if (!els) return;
  const question = els.askInput.value.trim();
  if (!question || els.askBtn.disabled) return;

  const passages = collectPassages();
  const best = rankPassages(question, passages.map((p) => p.text), ASK_PASSAGE_LIMIT);

  hideAllStatus();
  els.text.classList.remove("hidden");
  if (best.length === 0) {
    els.text.textContent = NOTHING_FOUND;
    return;
  }

  citations = best.map((i) => passages[i].el);
  currentRequestId = crypto.randomUUID();
  const message: ContentToBackgroundMessage = {
    type: "ASK_REQUEST",
    requestId: currentRequestId,
    ask: { question, passages: best.map((i) => passages[i].text) }
  };
  els.askBtn.disabled = true;
  chrome.runtime.sendMessage(message).catch(() => {
    console.warn("Explain This: failed to send ask request");
  });
}

function openAskBox() {
  if (!host) build();
  if (!els || !host) return;
  mode = "ask";
  currentRequestId = null;
  citations = [];

  hideAllStatus();
  els.text.classList.add("hidden");
  els.text.textContent = "";
  for (const btn of els.explainBtns) btn.classList.add("hidden");
  els.askForm.classList.remove("hidden");
  els.askBtn.disabled = false;

  host.style.top = "16px";
  host.style.left = `${Math.max(document.documentElement.clientWidth - 336, 8)}px`;
  els.askInput.focus();
}

export function handlePopupMessage(message: BackgroundToContentMessage) {
  switch (message.type) {
    case "SHOW_LOADING":
      showLoading(message.requestId);
      break;
    case "SHOW_ASK_BOX":
      openAskBox();
      break;
    case "MODEL_LOAD_PROGRESS":
      updateModelProgress(message.requestId, message.progress, message.text);
      break;
    case "EXPLAIN_STREAM_CHUNK":
      appendChunk(message.requestId, message.delta);
      break;
    case "EXPLAIN_STREAM_DONE":
      finish(message.requestId, message.fullText, message.engine);
      break;
    case "EXPLAIN_ERROR":
      showError(message.requestId, message.message);
      break;
  }
}
