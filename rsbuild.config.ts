import { defineConfig } from "@rsbuild/core";
import { pluginPreact } from "@rsbuild/plugin-preact";
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";
import { readFileSync } from "node:fs";
import path from "node:path";

const devWasm = path.resolve(import.meta.dirname, ".cache/tailcat");
const relayRuntime = path.resolve(import.meta.dirname, "src/relay-runtime");
const relayAssets = new Map([
  ["/bridge-sw.js", "bridge-sw.js"],
  ...[
    "history.js",
    "http-response.js",
    "i18n.js",
    "language-menu.js",
    "runtime.js",
  ].map((name) => [`/__relay/${name}`, name]),
]);

export default defineConfig(({ command }) => {
  const appBase =
    command === "dev" ? "/" : process.env.TELAY_BASE_PATH || "/telay/";
  return {
    plugins: [pluginPreact(), pluginTailwindcss()],
    output: { assetPrefix: appBase },
    dev: { assetPrefix: appBase },
    source: {
      entry: {
        index: "./src/main.tsx",
        standalone: "./src/standalone-entry.ts",
      },
    },
    html: {
      title: "Telay · Connect a device",
    },
    tools: {
      htmlPlugin(config, { entryName }) {
        const standalone = entryName === "standalone";
        config.template = standalone ? "./src/standalone.html" : "./index.html";
        config.filename = standalone ? "__relay/index.html" : "index.html";
      },
    },
    server: {
      base: appBase,
      port: 5173,
      setup({ action, server }) {
        if (action !== "dev") return;
        server.middlewares.use((req, res, next) => {
          const pathname = new URL(req.url || "/", "http://localhost").pathname;
          const relayAsset = relayAssets.get(pathname);
          if (relayAsset) {
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Content-Type", "text/javascript");
            res.end(readFileSync(path.join(relayRuntime, relayAsset)));
            return;
          }
          const name = path.basename(pathname);
          if (
            !pathname.startsWith("/tailcat/") ||
            !["wasm_exec.js", "main.wasm.gz"].includes(name)
          )
            return next();
          try {
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader(
              "Content-Type",
              name.endsWith(".js")
                ? "text/javascript"
                : "application/octet-stream",
            );
            res.end(readFileSync(path.join(devWasm, name)));
          } catch {
            next();
          }
        });
      },
    },
  };
});
