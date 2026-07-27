export type BackgroundToOffscreenMessage = { type: "OFFSCREEN_RUN_TEST" };

export type OffscreenToBackgroundMessage =
  | { type: "OFFSCREEN_MODEL_PROGRESS"; progress: number; text: string }
  | { type: "OFFSCREEN_TEST_RESULT"; text: string }
  | { type: "OFFSCREEN_ERROR"; message: string };
