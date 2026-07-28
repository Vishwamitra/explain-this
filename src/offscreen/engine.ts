import { CreateMLCEngine, type MLCEngine } from "@mlc-ai/web-llm";
import { DEFAULT_MODEL_ID } from "../shared/config";
import type { BackgroundToOffscreenMessage, OffscreenToBackgroundMessage } from "../shared/messages";

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

async function runGenerate(requestId: string, text: string) {
  currentRequestId = requestId;
  try {
    const engine = await getEngine();
    const stream = await engine.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "Explain the following text in simple, plain language. Be concise: a few sentences at most."
        },
        { role: "user", content: text }
      ],
      stream: true
    });

    let fullText = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        send({ type: "EXPLAIN_STREAM_CHUNK", requestId, delta });
      }
    }
    send({ type: "EXPLAIN_STREAM_DONE", requestId, fullText });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Explain This: generate error", err);
    send({ type: "EXPLAIN_ERROR", requestId, message });
  } finally {
    currentRequestId = null;
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundToOffscreenMessage) => {
  if (message.type === "OFFSCREEN_GENERATE") {
    runGenerate(message.requestId, message.text);
  }
});
