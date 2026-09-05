import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const distDirectory = path.resolve("dist");
const indexPath = path.join(distDirectory, "index.html");
const serviceWorkerPath = path.join(distDirectory, "sw.js");

const indexHtml = await readFile(indexPath, "utf8");
const serviceWorker = await readFile(serviceWorkerPath, "utf8");
const buildVersion = createHash("sha256").update(indexHtml).digest("hex").slice(0, 12);
const buildAssets = Array.from(
  indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
  (match) => match[1]
).sort();

if (buildAssets.length === 0) {
  throw new Error("No built frontend assets were found in dist/index.html.");
}
if (!serviceWorker.includes("__BUILD_VERSION__") || !serviceWorker.includes("__BUILD_ASSETS__")) {
  throw new Error("Service-worker build placeholders are missing.");
}

const finalizedServiceWorker = serviceWorker
  .replace("__BUILD_VERSION__", buildVersion)
  .replace('"__BUILD_ASSETS__"', JSON.stringify(buildAssets));

await writeFile(serviceWorkerPath, finalizedServiceWorker);
