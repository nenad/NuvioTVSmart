import { I18n } from "../../i18n/index.js";
import { Platform } from "../../platform/index.js";
import { FocusEngine } from "../navigation/focusEngine.js";

// TVs have a Back key on every remote. A browser has its own back button
// only while its chrome is showing; an app added to an iPhone home screen has
// none, and a phone has no keyboard. This gives browsers an on-screen Back on
// every screen that has somewhere to go back to (css/components-61.css shows
// it by route, from the data-route attribute the router keeps on <html>).

const BACK_GLYPH = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path>
  </svg>
`;

export function mountBrowserBackButton() {
  if (!Platform.isBrowser() || document.querySelector(".browser-back-button")) {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "browser-back-button";
  button.setAttribute("aria-label", I18n.t("common.back", {}, { fallback: "Back" }));
  button.innerHTML = BACK_GLYPH;
  document.body.appendChild(button);

  // Handle the click before the pointer routing on document sees it, so no
  // screen treats it as a click on its own content.
  window.addEventListener(
    "click",
    (event) => {
      if (!event.target?.closest?.(".browser-back-button")) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      // The same path a remote's Back key takes: an open dialog or overlay
      // closes first, otherwise the route goes back.
      FocusEngine.handleBack(event, undefined, { source: "button" });
    },
    true
  );
}
