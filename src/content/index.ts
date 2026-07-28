import type { BackgroundToContentMessage } from "../shared/messages";
import { handlePopupMessage } from "./popup";

chrome.runtime.onMessage.addListener((message: BackgroundToContentMessage) => {
  handlePopupMessage(message);
});
