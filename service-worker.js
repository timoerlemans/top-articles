const APP_SHELL_CACHE = "top-articles-shell-v1";
const IMAGE_CACHE = "top-articles-images-v1";
const APP_SHELL_URLS = [
  "./",
  "index.html",
  "styles.css",
  "favicon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "data/data.js",
  "data/score.js",
  "dist/src/app.js",
  "dist/src/types/browser-data.js",
];
const MAX_IMAGE_ENTRIES = 60;
const MAX_IMAGE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_PREFIX = "top-articles-";

const shellUrls = new Set(APP_SHELL_URLS.map((path) => new URL(path, self.registration.scope).href));

function cacheShellResponse(request, response) {
  if (!response.ok) { return Promise.resolve(); }
  return caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, response));
}

async function trimImageCache(cache) {
  const requests = await cache.keys();
  const now = Date.now();
  const retained = [];

  for (const request of requests) {
    const response = await cache.match(request);
    const cachedAt = Number(response?.headers.get("x-top-articles-cached-at"));
    if (!Number.isFinite(cachedAt) || now - cachedAt > MAX_IMAGE_AGE_MS) {
      await cache.delete(request);
      continue;
    }
    retained.push({ request, cachedAt });
  }

  retained.sort((a, b) => a.cachedAt - b.cachedAt);
  await Promise.all(retained.slice(0, Math.max(0, retained.length - MAX_IMAGE_ENTRIES)).map(({ request }) => cache.delete(request)));
}

async function cacheImage(request, response) {
  if (!response.ok || response.type === "opaque") { return response; }
  const headers = new Headers(response.headers);
  headers.set("x-top-articles-cached-at", String(Date.now()));
  const cachedResponse = new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  const cache = await caches.open(IMAGE_CACHE);
  await cache.put(request, cachedResponse);
  await trimImageCache(cache);
  return response;
}

async function serveShell(request, event) {
  const cached = await caches.match(request);
  const refresh = fetch(request)
    .then((response) => cacheShellResponse(request, response.clone()))
    .catch(() => undefined);
  event.waitUntil(refresh);
  return cached ?? fetch(request);
}

async function serveImage(request) {
  const cached = await caches.match(request);
  try {
    return await cacheImage(request, await fetch(request));
  } catch {
    return cached ?? Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== APP_SHELL_CACHE && key !== IMAGE_CACHE)
      .map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") { return; }
  if (shellUrls.has(request.url)) {
    event.respondWith(serveShell(request, event));
    return;
  }
  if (request.destination === "image") {
    event.respondWith(serveImage(request));
  }
});
