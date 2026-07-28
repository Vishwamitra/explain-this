export type BackgroundToOffscreenMessage = {
  type: "OFFSCREEN_GENERATE";
  requestId: string;
  text: string;
};

export type OffscreenToBackgroundMessage =
  | { type: "MODEL_LOAD_PROGRESS"; requestId: string; progress: number; text: string }
  | { type: "EXPLAIN_STREAM_CHUNK"; requestId: string; delta: string }
  | { type: "EXPLAIN_STREAM_DONE"; requestId: string; fullText: string }
  | { type: "EXPLAIN_ERROR"; requestId: string; message: string };

export type BackgroundToContentMessage =
  | { type: "SHOW_LOADING"; requestId: string }
  | { type: "MODEL_LOAD_PROGRESS"; requestId: string; progress: number; text: string }
  | { type: "EXPLAIN_STREAM_CHUNK"; requestId: string; delta: string }
  | { type: "EXPLAIN_STREAM_DONE"; requestId: string; fullText: string }
  | { type: "EXPLAIN_ERROR"; requestId: string; message: string };
