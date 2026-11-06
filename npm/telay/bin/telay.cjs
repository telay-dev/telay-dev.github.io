#!/usr/bin/env node
const { spawn } = require("node:child_process");
const path = require("node:path");
const version = require("../package.json").version;

if (process.argv.length === 3 && process.argv[2] === "--version") {
  console.log(version);
  process.exit(0);
}
const platform = `${process.platform}-${process.arch}`;
const supported = new Set(["darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64", "win32-x64"]);
if (!supported.has(platform)) {
  console.error(`telay: unsupported platform ${platform}`);
  process.exit(1);
}
const pkg = `@telay-dev/${platform}`;
let executable;
try {
  const manifest = require.resolve(`${pkg}/package.json`);
  executable = path.join(path.dirname(manifest), "bin", process.platform === "win32" ? "telay.exe" : "telay");
} catch {
  console.error(`telay: ${pkg} is missing. Reinstall with optional dependencies enabled.`);
  process.exit(1);
}
const child = spawn(executable, process.argv.slice(2), { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { if (!child.killed) child.kill(signal); });
}
child.on("error", (error) => { console.error(`telay: ${error.message}`); process.exitCode = 1; });
child.on("exit", (code, signal) => {
  if (signal && process.platform !== "win32") {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  }
  else process.exitCode = code ?? 1;
});
