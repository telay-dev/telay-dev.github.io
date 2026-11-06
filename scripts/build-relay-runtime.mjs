import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src/relay-runtime");
const output = path.join(root, "dist");
const relayOutput = path.join(output, "__relay");

await mkdir(relayOutput, { recursive: true });
await Promise.all([
  copyFile(
    path.join(source, "bridge-sw.js"),
    path.join(output, "bridge-sw.js"),
  ),
  ...[
    "history.js",
    "http-response.js",
    "i18n.js",
    "language-menu.js",
    "runtime.js",
  ].map((file) =>
    copyFile(path.join(source, file), path.join(relayOutput, file)),
  ),
]);
