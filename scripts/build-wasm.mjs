import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const connector = path.join(root, "connector");
const output = path.resolve(root, process.argv[2] || "dist/tailcat");
const temporary = path.join(os.tmpdir(), `telay-${process.pid}.wasm`);
const go = process.env.RELAY_GO || "go";

const { stdout } = await run(go, ["env", "GOROOT"]);
const goroot = stdout.trim();
const runtime = [
  path.join(goroot, "lib/wasm/wasm_exec.js"),
  path.join(goroot, "misc/wasm/wasm_exec.js"),
].find((file) => {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
});
if (!runtime) throw new Error(`wasm_exec.js not found in Go SDK: ${goroot}`);

try {
  await run(
    go,
    ["build", "-trimpath", "-ldflags=-s -w", "-o", temporary, "./browser"],
    {
      cwd: connector,
      env: { ...process.env, CGO_ENABLED: "0", GOOS: "js", GOARCH: "wasm" },
    },
  );
  mkdirSync(output, { recursive: true });
  copyFileSync(runtime, path.join(output, "wasm_exec.js"));
  writeFileSync(
    path.join(output, "main.wasm.gz"),
    gzipSync(readFileSync(temporary), { level: 9, mtime: 0 }),
  );
} finally {
  rmSync(temporary, { force: true });
}
