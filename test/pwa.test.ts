import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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

test("worker bewaart een volledige shell voor offline gebruik en activeert updates direct", async () => {
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
  assert.match(worker, /skipWaiting/);
});

test("worker haalt versiegebonden JS eerst online op en gebruikt de cache bij netwerkuitval", async () => {
  const worker = await readFile(new URL("service-worker.js", root), "utf8");
  type ShellEvent = {
    request: Request;
    respondWith: (response: Promise<Response>) => void;
    waitUntil: (operation: Promise<unknown>) => void;
  };
  let handler: ((event: ShellEvent) => void) | undefined;
  let online = true;
  const cached = new Response("oude data");
  const stored: string[] = [];
  const pending: Promise<unknown>[] = [];
  vm.runInNewContext(worker, {
    URL, Response,
    self: {
      registration: { scope: "https://example.com/top-articles/" },
      addEventListener: (name: string, listener: (event: ShellEvent) => void) => {
        if (name === "fetch") {handler = listener;}
      },
    },
    caches: {
      match: (url: string) => {
        assert.equal(url, "https://example.com/top-articles/data/score.js");
        return Promise.resolve(cached.clone());
      },
      open: () => Promise.resolve({ put: async (url: string, response: Response) => {
        assert.equal(url, "https://example.com/top-articles/data/score.js");
        stored.push(await response.text());
      } }),
    },
    fetch: (_request: Request, options: { cache: string }) => {
      assert.equal(options.cache, "no-cache");
      return online ? Promise.resolve(new Response("nieuwe data")) : Promise.reject(new Error("offline"));
    },
  });
  assert.ok(handler);
  const load = (): Promise<Response> => new Promise((resolve, reject) => {
    handler?.({
      request: new Request("https://example.com/top-articles/data/score.js?c=123"),
      respondWith: (response) => { response.then(resolve, reject); },
      waitUntil: (operation) => { pending.push(operation); },
    });
  });
  assert.equal(await (await load()).text(), "nieuwe data");
  await Promise.all(pending);
  assert.deepEqual(stored, ["nieuwe data"]);
  online = false;
  assert.equal(await (await load()).text(), "oude data");
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
