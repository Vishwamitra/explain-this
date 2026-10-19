export type EnginePref = "auto" | "webllm";

const KEY = "explainThisEngine";

// localStorage is shared by the extension's own pages (the offscreen document
// and the toolbar panel) and, unlike chrome.storage, needs no permission.
export function getEnginePref(): EnginePref {
  try {
    return localStorage.getItem(KEY) === "webllm" ? "webllm" : "auto";
  } catch {
    return "auto";
  }
}

export function setEnginePref(pref: EnginePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch (err) {
    console.warn("Explain This: could not save the engine preference", err);
  }
}
