import { AuthManager } from "../../core/auth/authManager.js";
import { SessionStore } from "../../core/storage/sessionStore.js";

const PLUGIN_PROTOCOL_VERSION = 1;
const PROBE_TIMEOUT_MS = 5000;
const SIGN_IN_REQUIRED_DETAIL = "Sign in to use plugins";

function getServiceBaseUrl() {
  return String(globalThis.__NUVIO_BROWSER_PLUGIN_SERVICE_URL__ || "").trim();
}

function withTimeout(promise, timeoutMs, message) {
  let timer = 0;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function getAccessToken() {
  if (!SessionStore.accessToken) {
    await AuthManager.refreshSessionIfNeeded();
  }
  const token = SessionStore.accessToken;
  if (!token) {
    throw new Error(SIGN_IN_REQUIRED_DETAIL);
  }
  return token;
}

async function requestJson(method, path, payload, { timeoutMs = PROBE_TIMEOUT_MS, signal } = {}) {
  const token = await getAccessToken();
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const abort = () => controller?.abort();
  signal?.addEventListener?.("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(`${getServiceBaseUrl()}/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
      cache: "no-store",
      signal: controller?.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Browser plugin service HTTP ${response.status}`);
    }
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abort);
  }
}

export const BrowserPluginService = {
  // The browser has no local service to probe. Availability is purely a
  // configuration question: a remote service URL must be configured.
  isAvailable() {
    return Boolean(getServiceBaseUrl());
  },

  async health() {
    const payload = await withTimeout(
      requestJson("GET", "health", null),
      PROBE_TIMEOUT_MS,
      "Browser plugin service health probe timed out"
    );
    if (
      payload?.returnValue !== true ||
      Number(payload?.protocolVersion || 0) !== PLUGIN_PROTOCOL_VERSION
    ) {
      throw new Error("Browser plugin service health is incompatible");
    }
    return payload;
  },

  async capabilities() {
    return withTimeout(
      requestJson("GET", "capabilities", null),
      PROBE_TIMEOUT_MS,
      "Browser plugin service capabilities request timed out"
    );
  },

  async diagnostics() {
    return withTimeout(
      requestJson("GET", "diagnostics", null),
      PROBE_TIMEOUT_MS,
      "Browser plugin service diagnostics request timed out"
    );
  },

  fetch(payload, options) {
    return requestJson("POST", "fetch", payload, options);
  },

  cancel(payload) {
    return requestJson("POST", "cancel", payload, { timeoutMs: 2000 }).catch(() => false);
  },

  clearCache() {
    return requestJson("POST", "cache/clear", {}, { timeoutMs: 5000 });
  }
};
