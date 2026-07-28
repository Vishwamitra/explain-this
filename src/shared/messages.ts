export type BackgroundToOffscreenMessage = {
  type: "OFFSCREEN_GENERATE";
  requestId: string;
  text: string;
};

// Both hops downstream of the offscreen document (offscreen -> background,
// then background -> content) relay these events verbatim, so they share
// one shape instead of being declared twice.
type StreamEvent =
  | { type: "MODEL_LOAD_PROGRESS"; requestId: string; progress: number; text: string }
  | { type: "EXPLAIN_STREAM_CHUNK"; requestId: string; delta: string }
  | { type: "EXPLAIN_STREAM_DONE"; requestId: string; fullText: string }
  | { type: "EXPLAIN_ERROR"; requestId: string; message: string };

export type OffscreenToBackgroundMessage = StreamEvent;

export type BackgroundToContentMessage = StreamEvent | { type: "SHOW_LOADING"; requestId: string };
