import { CreateMLCEngine, type MLCEngine } from "@mlc-ai/web-llm";
import { DEFAULT_MODEL_ID } from "../shared/config";
import type { BackgroundToOffscreenMessage, OffscreenToBackgroundMessage } from "../shared/messages";

let enginePromise: Promise<MLCEngine> | null = null;

function send(message: OffscreenToBackgroundMessage) {
  chrome.runtime.sendMessage(message).catch((err) => {
    console.warn("Explain This: no listener for offscreen message", message.type, err);
  });
}

function getEngine(): Promise<MLCEngine> {
  if (!enginePromise) {
    enginePromise = CreateMLCEngine(DEFAULT_MODEL_ID, {
      initProgressCallback: (report) => {
        send({ type: "OFFSCREEN_MODEL_PROGRESS", progress: report.progress, text: report.text });
      }
    });
  }
  return enginePromise;
}

async function runTest() {
  try {
    const engine = await getEngine();
    const reply = await engine.chat.completions.create({
      messages: [{ role: "user", content: "Say hello in five words." }]
    });
    const text = reply.choices[0]?.message.content ?? "";
    console.log("Explain This: test completion ->", text);
    send({ type: "OFFSCREEN_TEST_RESULT", text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Explain This: offscreen engine error", err);
    send({ type: "OFFSCREEN_ERROR", message });
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundToOffscreenMessage) => {
  if (message.type === "OFFSCREEN_RUN_TEST") {
    runTest();
  }
});
