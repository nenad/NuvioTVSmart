import { Platform } from "../index.js";

// Browsers play MP4, WebM and HLS. Addon and debrid streams are mostly
// Matroska, often HEVC with Dolby audio: a TV plays them natively, a browser
// refuses them ("source not supported"). When the deployment runs a Stremio
// streaming server, hand those streams to its HLS converter: it repackages the
// file as HLS and only transcodes the tracks this browser cannot decode.
//
// Configured by globalThis.__NUVIO_BROWSER_STREAMING_SERVER_URL__, the
// server's base URL (absolute, or a path on this origin).

const DIRECT_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "audio/mp4",
  "audio/mpeg",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/dash+xml"
]);

const VIDEO_CODECS = [
  ["h264", 'video/mp4; codecs="avc1.640028"'],
  ["hevc", 'video/mp4; codecs="hvc1.1.6.L150.90"'],
  ["vp9", 'video/mp4; codecs="vp09.00.40.08"']
];

const AUDIO_CODECS = [
  ["aac", 'audio/mp4; codecs="mp4a.40.2"'],
  ["mp3", "audio/mpeg"],
  ["ac3", 'audio/mp4; codecs="ac-3"'],
  ["eac3", 'audio/mp4; codecs="ec-3"'],
  ["opus", 'audio/mp4; codecs="opus"'],
  ["flac", 'audio/mp4; codecs="flac"']
];

function serverBaseUrl() {
  return String(globalThis.__NUVIO_BROWSER_STREAMING_SERVER_URL__ || "")
    .trim()
    .replace(/\/+$/, "");
}

// Safari plays HLS natively and other browsers through MSE (hls.js), so a
// codec counts when either path can decode it.
function canDecode(video, type) {
  try {
    if (video?.canPlayType?.(type)) return true;
  } catch (_) {
    // Fall through to MSE.
  }
  try {
    return Boolean(globalThis.MediaSource?.isTypeSupported?.(type));
  } catch (_) {
    return false;
  }
}

function randomId() {
  const bytes = new Uint8Array(8);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const BrowserStreamConverter = {
  isEnabled() {
    return Platform.isBrowser() && Boolean(serverBaseUrl());
  },

  shouldConvert(url, mimeType, requestHeaders = {}) {
    if (!this.isEnabled()) return false;
    const source = String(url || "").trim();
    if (!/^https?:\/\//i.test(source)) return false;
    // The converter fetches the file itself and cannot send these.
    if (requestHeaders && Object.keys(requestHeaders).length) return false;
    const type = String(mimeType || "")
      .toLowerCase()
      .split(";")[0]
      .trim();
    return !DIRECT_TYPES.has(type);
  },

  toHlsUrl(url, video) {
    const params = new URLSearchParams();
    params.set("mediaURL", String(url || "").trim());
    VIDEO_CODECS.forEach(([codec, type]) => {
      if (codec === "h264" || canDecode(video, type)) params.append("videoCodecs", codec);
    });
    AUDIO_CODECS.forEach(([codec, type]) => {
      if (codec === "aac" || canDecode(video, type)) params.append("audioCodecs", codec);
    });
    params.set("maxAudioChannels", "2");
    return `${serverBaseUrl()}/hlsv2/${randomId()}/master.m3u8?${params.toString()}`;
  }
};
