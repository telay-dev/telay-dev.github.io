export const shellQuote = (value: string) =>
  "'" + value.replaceAll("'", "'\\''") + "'";
const powerShellQuote = (value: string) =>
  "'" + value.replaceAll("'", "''") + "'";

export function installCommand(web: string, method: "wget" | "curl") {
  const download = method === "wget" ? "wget -qO- " : "curl -fsSL ";
  return (
    download + shellQuote(web + "/install.sh") + " | sh"
  );
}
export function startCommand(upstream = "", platform?: string) {
  const windows = platform?.startsWith("windows");
  const quote = windows ? powerShellQuote : shellQuote;
  const binary = platform
    ? (windows ? ".\\" : "./") + "telay-" + platform
    : "./telay/telay";
  return (
    binary +
    (upstream.trim() ? " --upstream " + quote(upstream.trim()) : "")
  );
}
