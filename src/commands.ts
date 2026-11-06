export const shellQuote = (value: string) =>
  "'" + value.replaceAll("'", "'\\''") + "'";
const powerShellQuote = (value: string) =>
  "'" + value.replaceAll("'", "''") + "'";

export function installCommand(web: string, method: "wget" | "curl") {
  const download = method === "wget" ? "wget -qO- " : "curl -fsSL ";
  return (
    download +
    shellQuote(web + "/install.sh") +
    " | sh -s -- --web " +
    shellQuote(web)
  );
}
export function startCommand(web: string, upstream = "", platform?: string) {
  const windows = platform?.startsWith("windows");
  const quote = windows ? powerShellQuote : shellQuote;
  const binary = platform
    ? (windows ? ".\\" : "./") + "telay-" + platform
    : '"$HOME/.local/bin/telay"';
  return (
    binary +
    " --web " +
    quote(web) +
    (upstream.trim() ? " --upstream " + quote(upstream.trim()) : "")
  );
}
