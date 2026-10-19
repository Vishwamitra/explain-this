import { CreateMLCEngine, type MLCEngine } from "@mlc-ai/web-llm";
import { builtInStatus, streamBuiltIn } from "../shared/builtin-ai";
import { DEFAULT_MODEL_ID } from "../shared/config";
import { getEnginePref } from "../shared/engine-pref";
import type {
  BackgroundToOffscreenMessage,
  EngineKind,
  ExplainAction,
  OffscreenToBackgroundMessage
} from "../shared/messages";
import { PROMPTS } from "../shared/prompts";

const NO_WEBGPU_MESSAGE =
  "This browser doesn't support WebGPU, which Explain This needs for local inference. Try a recent version of Chrome or Edge on desktop.";

let enginePromise: Promise<MLCEngine> | null = null;
let currentRequestId: string | null = null;

function send(message: OffscreenToBackgroundMessage) {
  chrome.runtime.sendMessage(message).catch((err) => {
    console.warn("Explain This: no listener for offscreen message", message.type, err);
  });
}

function getEngine(): Promise<MLCEngine> {
  if (!enginePromise) {
    enginePromise = CreateMLCEngine(DEFAULT_MODEL_ID, {
      initProgressCallback: (report) => {
        if (currentRequestId) {
          send({
            type: "MODEL_LOAD_PROGRESS",
            requestId: currentRequestId,
            progress: report.progress,
            text: report.text
          });
        }
      }
    });
  }
  return enginePromise;
}

// Chrome's built-in model is only used when it is already downloaded. Starting
// the download needs a user gesture, which this hidden page never receives, so
// that happens from the toolbar panel instead.
async function pickEngine(): Promise<EngineKind> {
  if (getEnginePref() === "webllm") return "webllm";
  return (await builtInStatus()) === "available" ? "chrome" : "webllm";
}

async function generateWithWebLLM(
  requestId: string,
  text: string,
  action: ExplainAction | undefined,
  onDelta: (delta: string) => void
): Promise<string> {
  if (!("gpu" in navigator)) throw new Error(NO_WEBGPU_MESSAGE);

  currentRequestId = requestId;
  try {
    const engine = await getEngine();
    const stream = await engine.chat.completions.create({
      messages: [
        { role: "system", content: PROMPTS[action ?? "explain"] },
        { role: "user", content: text }
      ],
      stream: true
    });

    let fullText = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        onDelta(delta);
      }
    }
    return fullText;
  } finally {
    currentRequestId = null;
  }
}

async function runGenerate(requestId: string, text: string, action?: ExplainAction) {
  let emitted = false;
  const onDelta = (delta: string) => {
    emitted = true;
    send({ type: "EXPLAIN_STREAM_CHUNK", requestId, delta });
  };

  try {
    let engine = await pickEngine();
    let fullText: string;

    if (engine === "chrome") {
      try {
        fullText = await streamBuiltIn(PROMPTS[action ?? "explain"], text, onDelta);
      } catch (err) {
        // Once text has reached the popup there is nothing sensible to fall
        // back to. Before that, WebLLM can still answer.
        if (emitted) throw err;
        console.warn("Explain This: Chrome's built-in model failed, falling back to WebLLM", err);
        engine = "webllm";
        fullText = await generateWithWebLLM(requestId, text, action, onDelta);
      }
    } else {
      fullText = await generateWithWebLLM(requestId, text, action, onDelta);
    }

    send({ type: "EXPLAIN_STREAM_DONE", requestId, fullText, engine });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Explain This: generate error", err);
    send({ type: "EXPLAIN_ERROR", requestId, message });
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundToOffscreenMessage) => {
  if (message.type === "OFFSCREEN_GENERATE") {
    runGenerate(message.requestId, message.text, message.action);
  }
});
