import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("manifest biedt een zelfstandige Nederlandse installatie met twee lokale PNG-iconen", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", root), "utf8")) as {
    name?: unknown;
    short_name?: unknown;
    lang?: unknown;
    display?: unknown;
    start_url?: unknown;
    icons?: unknown;
  };

  assert.equal(manifest.name, "Top Articles");
  assert.equal(manifest.short_name, "Top Articles");
  assert.equal(manifest.lang, "nl");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.deepEqual(manifest.icons, [
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
  ]);

  for (const iconPath of ["icons/icon-192.png", "icons/icon-512.png"]) {
    const icon = await readFile(new URL(iconPath, root));
    assert.deepEqual(icon.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.ok((await stat(new URL(iconPath, root))).size > 100);
  }
});

test("de pagina koppelt manifest, themakleur en installatie-icoon", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest" \/>/);
  assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}" \/>/i);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/icon-192\.png" \/>/);
});

test("worker serveert een volledige eerdere shell offline en ververst die alleen op de achtergrond", async () => {
  const worker = await readFile(new URL("service-worker.js", root), "utf8");
  for (const path of [
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
  ]) {
    assert.match(worker, new RegExp(JSON.stringify(path)));
  }
  assert.match(worker, /cache\.addAll\(APP_SHELL_URLS\)/);
  assert.match(worker, /event\.waitUntil\(/);
  assert.doesNotMatch(worker, /skipWaiting/);
});

test("worker laat niet-GET-verzoeken met rust en begrenst de afbeeldingscache", async () => {
  const worker = await readFile(new URL("service-worker.js", root), "utf8");
  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /request\.destination === "image"/);
  assert.match(worker, /MAX_IMAGE_ENTRIES\s*=\s*60/);
  assert.match(worker, /MAX_IMAGE_AGE_MS\s*=\s*30 \* 24 \* 60 \* 60 \* 1000/);
});

test("frontend registreert de worker alleen in een veilige ondersteunde context", async () => {
  const app = await readFile(new URL("dist/src/app.js", root), "utf8");
  assert.match(app, /window\.isSecureContext/);
  assert.match(app, /"serviceWorker" in navigator/);
  assert.match(app, /navigator\.serviceWorker\.register\("service-worker\.js"\)/);
  assert.match(app, /\.catch\(\(\) => undefined\)/);
});

test("footer toont een stabiel UTC-buildnummer uit de gegenereerde data", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("dist/src/app.js", root), "utf8"),
  ]);

  assert.match(html, /id="pwa-build"/);
  assert.match(app, /function formatBuildNumber\(iso\)/);
  assert.match(app, /getUTCFullYear\(\)/);
  assert.match(app, /getUTCMonth\(\) \+ 1/);
  assert.match(app, /getUTCSeconds\(\)/);
  assert.match(app, /pwaBuildEl\.textContent = `PWA-build \$\{formatBuildNumber\(data\.generatedAt\)\}`/);
});
