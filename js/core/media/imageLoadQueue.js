const MAX_CONCURRENT_IMAGE_LOADS = 4;
const IMAGE_LOAD_TIMEOUT_MS = 15_000;
const queue = [];
const queuedImages = new WeakSet();
const queuedEntries = new WeakMap();
const activeImages = new Map();
const retryCounts = new WeakMap();
let activeLoads = 0;

export function optimizePosterUrl(value) {
  const source = String(value || "");
  const literalOptimized = source.replace(
    /(image\.tmdb\.org\/t\/p\/)(?:original|w\d+(?:_and_h\d+_bestv2)?)(\/)/i,
    "$1w342$2"
  );
  return literalOptimized.replace(
    /(image\.tmdb\.org%2Ft%2Fp%2F)(?:original|w\d+(?:_and_h\d+_bestv2)?)(%2F)/i,
    "$1w342$2"
  );
}

function drainQueue() {
  while (activeLoads < MAX_CONCURRENT_IMAGE_LOADS && queue.length) {
    const { image, src } = queue.shift();
    if (!image?.isConnected) {
      queuedImages.delete(image);
      queuedEntries.delete(image);
      continue;
    }

    activeLoads += 1;
    queuedEntries.delete(image);
    let timeoutId = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      if (timeoutId) clearTimeout(timeoutId);
      queuedImages.delete(image);
      activeImages.delete(image);
      retryCounts.delete(image);
      activeLoads = Math.max(0, activeLoads - 1);
      drainQueue();
    };
    activeImages.set(image, { finish, src });
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    timeoutId = setTimeout(() => {
      const retryCount = retryCounts.get(image) || 0;
      image.dataset.src = src;
      image.removeAttribute("src");
      finish();
      if (image.isConnected && retryCount < 1) {
        retryCounts.set(image, retryCount + 1);
        setTimeout(() => enqueueImageLoad(image, src), 0);
      }
    }, IMAGE_LOAD_TIMEOUT_MS);
    image.loading = "eager";
    image.removeAttribute("data-src");
    image.src = src;
    if (image.complete) Promise.resolve().then(finish);
  }
}

export function enqueueImageLoad(image, src = image?.dataset?.src, { priority = false } = {}) {
  const source = String(src || "").trim();
  if (!image || !source || image.hasAttribute?.("src")) return false;
  if (queuedImages.has(image)) {
    if (priority) {
      const queued = queuedEntries.get(image);
      const index = queue.indexOf(queued);
      if (index > 0) {
        queue.splice(index, 1);
        queue.unshift(queued);
      }
    }
    return false;
  }
  queuedImages.add(image);
  const entry = { image, src: source };
  queuedEntries.set(image, entry);
  if (priority) queue.unshift(entry);
  else queue.push(entry);
  drainQueue();
  return true;
}

export function enqueueImageLoads(entries, options) {
  const orderedEntries = options?.priority ? [...entries].reverse() : entries;
  return orderedEntries.reduce(
    (count, entry) =>
      enqueueImageLoad(entry.image || entry, entry.src || entry.dataset?.src, options)
        ? count + 1
        : count,
    0
  );
}

export function observeDeferredImages(
  container,
  { selector = "img[data-src]", root = null, rootMargin = "600px" } = {}
) {
  const images = Array.from(container?.querySelectorAll?.(selector) || []);
  if (typeof IntersectionObserver !== "function") {
    enqueueImageLoads(images);
    return () => cancelImageLoadsWithin(container);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        enqueueImageLoad(entry.target);
      });
    },
    { root, rootMargin, threshold: 0.01 }
  );
  images.forEach((image) => observer.observe(image));
  return () => {
    observer.disconnect();
    cancelImageLoadsWithin(container);
  };
}

export function prioritizeCardPosterWindow(card, { cardSelector, imageSelector, radius = 2 } = {}) {
  const cards = Array.from(card?.parentElement?.querySelectorAll?.(cardSelector) || []);
  const index = cards.indexOf(card);
  if (index < 0) return 0;
  const images = cards
    .slice(Math.max(0, index - radius), index + radius + 1)
    .map((node) => node.querySelector(imageSelector))
    .filter(Boolean);
  return enqueueImageLoads(images, { priority: true });
}

export function cancelImageLoadsWithin(container) {
  if (!container) return;
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const entry = queue[index];
    if (!container.contains(entry.image)) continue;
    queue.splice(index, 1);
    queuedImages.delete(entry.image);
    queuedEntries.delete(entry.image);
  }
  activeImages.forEach(({ finish, src }, image) => {
    if (!container.contains(image)) return;
    image.dataset.src = src;
    image.removeAttribute("src");
    finish();
  });
}
