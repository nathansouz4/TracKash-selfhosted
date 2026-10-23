// Which Host headers the app answers to (see src/start.ts): this machine's
// loopback names only.

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** "localhost:3000" → "localhost"; "[::1]:3000" → "[::1]". */
export function hostName(host: string): string {
  const value = host.trim().toLowerCase();
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1);
  return value.split(":")[0] ?? "";
}

export function isLocalHost(host: string): boolean {
  const name = hostName(host);
  return LOOPBACK.has(name) || name.endsWith(".localhost");
}
