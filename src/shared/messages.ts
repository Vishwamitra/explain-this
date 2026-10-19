export type ExplainAction = "regenerate" | "elaborate" | "simplify" | "example";

export type EngineKind = "chrome" | "webllm";

// The question and the page passages (already ranked, best first) that an
// answer may draw on.
export interface AskContext {
  question: string;
  passages: string[];
}

export type BackgroundToOffscreenMessage = {
  type: "OFFSCREEN_GENERATE";
  requestId: string;
  text: string;
  action?: ExplainAction;
  ask?: AskContext;
};

export type ContentToBackgroundMessage =
  | { type: "ACTION_REQUEST"; requestId: string; action: ExplainAction }
  | { type: "ASK_REQUEST"; requestId: string; ask: AskContext };

// Both hops downstream of the offscreen document (offscreen -> background,
// then background -> content) relay these events verbatim, so they share
// one shape instead of being declared twice.
type StreamEvent =
  | { type: "MODEL_LOAD_PROGRESS"; requestId: string; progress: number; text: string }
  | { type: "EXPLAIN_STREAM_CHUNK"; requestId: string; delta: string }
  | { type: "EXPLAIN_STREAM_DONE"; requestId: string; fullText: string; engine: EngineKind }
  | { type: "EXPLAIN_ERROR"; requestId: string; message: string };

export type OffscreenToBackgroundMessage = StreamEvent;

export type BackgroundToContentMessage =
  | StreamEvent
  | { type: "SHOW_LOADING"; requestId: string }
  | { type: "SHOW_ASK_BOX" };
