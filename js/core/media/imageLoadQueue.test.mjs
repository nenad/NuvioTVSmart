import assert from "node:assert/strict";
import { test } from "node:test";

import { enqueueImageLoads, optimizePosterUrl } from "./imageLoadQueue.js";

test("uses smaller TMDB renditions for direct and encoded URLs", () => {
  assert.equal(
    optimizePosterUrl("https://image.tmdb.org/t/p/w600_and_h900_bestv2/id.jpg"),
    "https://image.tmdb.org/t/p/w342/id.jpg"
  );
  assert.equal(
    optimizePosterUrl(
      "https://cache.example/image?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Foriginal%2Fid.jpg"
    ),
    "https://cache.example/image?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw342%2Fid.jpg"
  );
});

test("routes AIOMetadata cached posters through its 300x450 transform", () => {
  const original = "https://assets.fanart.tv/fanart/reacher.jpg";
  const optimized = new URL(
    optimizePosterUrl(`https://metadata.example/poster-cache/poster/${original}`)
  );

  assert.equal(optimized.origin, "https://metadata.example");
  assert.equal(optimized.pathname, "/api/image/banner-to-background");
  assert.equal(optimized.searchParams.get("url"), original);
  assert.equal(optimized.searchParams.get("width"), "300");
  assert.equal(optimized.searchParams.get("height"), "450");
  assert.equal(optimized.searchParams.get("position"), "center");
});

test("limits concurrent image loads to four", async () => {
  let active = 0;
  let maximum = 0;

  class FakeImage extends EventTarget {
    constructor(index) {
      super();
      this.dataset = { src: `https://images.example/${index}.jpg` };
      this.isConnected = true;
      this.complete = false;
      this._src = "";
    }

    hasAttribute(name) {
      return name === "src" && Boolean(this._src);
    }

    removeAttribute(name) {
      if (name === "data-src") delete this.dataset.src;
    }

    set src(value) {
      this._src = value;
      active += 1;
      maximum = Math.max(maximum, active);
      setTimeout(() => {
        active -= 1;
        this.dispatchEvent(new Event("load"));
      }, 5);
    }

    get src() {
      return this._src;
    }
  }

  const images = Array.from({ length: 10 }, (_, index) => new FakeImage(index));
  assert.equal(enqueueImageLoads(images), images.length);
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(maximum, 4);
  assert.equal(
    images.every((image) => Boolean(image.src)),
    true
  );
});

test("falls back to the original poster when a transform fails", async () => {
  const requests = [];
  class FallbackImage extends EventTarget {
    constructor() {
      super();
      this.dataset = {
        src: "https://metadata.example/api/image/banner-to-background?url=poster",
        fallbackSrc: "https://images.example/original.jpg"
      };
      this.isConnected = true;
      this.complete = false;
      this._src = "";
    }

    hasAttribute(name) {
      return name === "src" && Boolean(this._src);
    }

    removeAttribute(name) {
      if (name === "data-src") delete this.dataset.src;
      if (name === "src") this._src = "";
    }

    set src(value) {
      this._src = value;
      requests.push(value);
      setTimeout(
        () => this.dispatchEvent(new Event(value === this.dataset.fallbackSrc ? "load" : "error")),
        0
      );
    }

    get src() {
      return this._src;
    }
  }

  const image = new FallbackImage();
  const optimized = image.dataset.src;
  enqueueImageLoads([image]);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual(requests, [optimized, image.dataset.fallbackSrc]);
});
