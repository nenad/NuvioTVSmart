import { Platform } from "../../platform/index.js";
import { FocusEngine } from "./focusEngine.js";
import { Router } from "./routerState.js";

// Holding OK on a remote opens the menus a TV app has instead of right-click:
// "hold to manage profile", poster and episode options, continue-watching
// actions. Screens time the hold from the OK keydown to its keyup. A finger
// that stays on a control is the same gesture, so press OK on its behalf: once
// the touch has been still long enough to not be the start of a scroll, focus
// the control and send OK down, and send it up when the finger lifts. Short
// taps are left to the click path.

// Long enough to tell a hold from the start of a scroll. A screen's own hold
// timer (650ms on Home) runs on top, so a menu opens just under a second in.
const HOLD_START_MS = 250;
const MOVE_TOLERANCE_PX = 12;
const OK = { key: "Enter", keyCode: 13 };

function sendOk(type) {
  const event = new KeyboardEvent(type, { key: OK.key, bubbles: true, cancelable: true });
  // keyCode is a read-only prototype accessor that KeyboardEventInit ignores.
  Object.defineProperty(event, "keyCode", { get: () => OK.keyCode });
  Object.defineProperty(event, "which", { get: () => OK.keyCode });
  document.dispatchEvent(event);
}

// A right-click is a long press already over: press OK, date the press far
// enough back that every screen's hold threshold has passed, and release.
const RIGHT_CLICK_HELD_MS = 5000;

function sendHeldOk() {
  sendOk("keydown");
  FocusEngine.activeKeyDownStartedAt?.set?.(`code:${OK.keyCode}`, Date.now() - RIGHT_CLICK_HELD_MS);
  sendOk("keyup");
}

export function installTouchHold() {
  if (!Platform.isBrowser()) {
    return;
  }

  let pending = null;
  let touching = false;

  const reset = () => {
    if (pending?.timer) {
      clearTimeout(pending.timer);
    }
    pending = null;
  };

  document.addEventListener(
    "touchstart",
    (event) => {
      touching = true;
      reset();
      if (event.touches.length !== 1) {
        return;
      }
      const target = FocusEngine.getPointerFocusable(event);
      if (!target || target.matches("input, textarea, select")) {
        return;
      }
      const touch = event.touches[0];
      pending = { target, x: touch.clientX, y: touch.clientY, pressed: false, timer: 0 };
      pending.timer = setTimeout(() => {
        if (!pending || !pending.target.isConnected) {
          reset();
          return;
        }
        pending.pressed = true;
        FocusEngine.focusPointerTarget(pending.target);
        // Home and Library track their focus themselves; without this they
        // put it back on what they last focused and the OK lands there.
        Router.getCurrentScreen()?.setFocusedNode?.(pending.target);
        sendOk("keydown");
      }, HOLD_START_MS);
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    "touchmove",
    (event) => {
      if (!pending || pending.pressed) {
        return;
      }
      const touch = event.touches[0];
      if (
        !touch ||
        Math.abs(touch.clientX - pending.x) > MOVE_TOLERANCE_PX ||
        Math.abs(touch.clientY - pending.y) > MOVE_TOLERANCE_PX
      ) {
        reset();
      }
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    "touchend",
    (event) => {
      // Android asks for the context menu after a hold, before this.
      setTimeout(() => {
        touching = false;
      }, 0);
      if (pending?.pressed) {
        // The keys stand in for this tap; its click must not act again.
        event.preventDefault();
        sendOk("keyup");
      }
      reset();
    },
    { capture: true, passive: false }
  );

  document.addEventListener(
    "touchcancel",
    () => {
      touching = false;
      reset();
    },
    { capture: true, passive: true }
  );

  // The browser's own menu (save image, copy link, the iOS callout) would
  // open on a held finger or a right-click; text fields keep theirs (paste).
  // A right-click opens the item's hold menu instead. A held finger already
  // has, on Android, by the time the browser asks.
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (event.target?.closest?.("input, textarea")) {
        return;
      }
      event.preventDefault();
      if (touching) {
        return;
      }
      const target = FocusEngine.getPointerFocusable(event);
      if (!target || !target.closest(".screen")) {
        return;
      }
      FocusEngine.focusPointerTarget(target);
      Router.getCurrentScreen()?.setFocusedNode?.(target);
      sendHeldOk();
    },
    true
  );
}
