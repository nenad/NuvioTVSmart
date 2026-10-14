import { Platform } from "../../platform/index.js";
import { FocusEngine } from "./focusEngine.js";

// Holding OK on a remote opens the menus a TV app has instead of right-click:
// "hold to manage profile", poster and episode options, continue-watching
// actions. Screens time the hold from the OK keydown to its keyup. A finger
// that stays on a control is the same gesture, so press OK on its behalf: once
// the touch has been still long enough to not be the start of a scroll, focus
// the control and send OK down, and send it up when the finger lifts. Short
// taps are left to the click path.

const HOLD_START_MS = 350;
const MOVE_TOLERANCE_PX = 12;
const OK = { key: "Enter", keyCode: 13 };

function sendOk(type) {
  const event = new KeyboardEvent(type, { key: OK.key, bubbles: true, cancelable: true });
  // keyCode is a read-only prototype accessor that KeyboardEventInit ignores.
  Object.defineProperty(event, "keyCode", { get: () => OK.keyCode });
  Object.defineProperty(event, "which", { get: () => OK.keyCode });
  document.dispatchEvent(event);
}

export function installTouchHold() {
  if (!Platform.isBrowser() || !("ontouchstart" in window)) {
    return;
  }

  let pending = null;

  const reset = () => {
    if (pending?.timer) {
      clearTimeout(pending.timer);
    }
    pending = null;
  };

  document.addEventListener(
    "touchstart",
    (event) => {
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
      if (pending?.pressed) {
        // The keys stand in for this tap; its click must not act again.
        event.preventDefault();
        sendOk("keyup");
      }
      reset();
    },
    { capture: true, passive: false }
  );

  document.addEventListener("touchcancel", reset, { capture: true, passive: true });

  // A held finger otherwise opens the browser's own menus: save image, copy
  // link, the iOS callout.
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (event.target?.closest?.(".screen")) {
        event.preventDefault();
      }
    },
    true
  );
}
