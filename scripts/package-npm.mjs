import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "npm-dist");
const main = JSON.parse(readFileSync(path.join(root, "npm/telay/package.json"), "utf8"));
const platforms = [
  ["darwin", "x64", "darwin", "amd64"],
  ["darwin", "arm64", "darwin", "arm64"],
  ["linux", "x64", "linux", "amd64"],
  ["linux", "arm64", "linux", "arm64"],
  ["win32", "x64", "windows", "amd64"],
];
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(root, "npm/telay"), path.join(out, "telay"), { recursive: true });
cpSync(path.join(root, "README.md"), path.join(out, "telay/README.md"));
cpSync(path.join(root, "LICENSE"), path.join(out, "telay/LICENSE"));
for (const [os, cpu, goos, goarch] of platforms) {
  const name = `@telay-dev/${os}-${cpu}`;
  if (main.optionalDependencies[name] !== main.version) throw new Error(`Version mismatch: ${name}`);
  const dir = path.join(out, `${os}-${cpu}`);
  mkdirSync(path.join(dir, "bin"), { recursive: true });
  const extension = os === "win32" ? ".exe" : "";
  cpSync(path.join(root, `release/telay-${goos}-${goarch}${extension}`), path.join(dir, `bin/telay${extension}`));
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.txt", "THIRD_PARTY_LICENSES.txt"]) cpSync(path.join(root, "release", file), path.join(dir, file));
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: main.version, description: `Telay binary for ${os} ${cpu}`, license: "MIT", os: [os], cpu: [cpu], files: ["bin", "LICENSE", "THIRD_PARTY_NOTICES.txt", "THIRD_PARTY_LICENSES.txt"], repository: main.repository }, null, 2) + "\n");
}
