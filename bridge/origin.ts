// Host and Origin pinning for the Cockpit daemon (docs/dapp-design.md section 1.3 B1, 5.4; M1-1, M1-2).
//
// Pure functions, no I/O, so every rule has a table test. The daemon binds 127.0.0.1 on one port and the
// page it serves has exactly one origin, so the rules are exact string comparisons, never patterns:
//
//   Host    must be exactly `127.0.0.1:<port>`. Anything else (another name, another port, no Host, a
//           trailing dot, `localhost:<port>`) is a DNS-rebinding attempt or a wrong client: 403 host_forbidden.
//   Origin  when present must be exactly `http://127.0.0.1:<port>`; `null` is refused too. A browser sends
//           Origin on every cross-origin request and on same-origin POSTs; a plain navigation GET has none.
//           403 origin_forbidden.
//   Fetch metadata (Sec-Fetch-Site) on API routes: only `same-origin`, `none` (typed URL) or absent
//           (a non-browser client) pass. `cross-site` and `same-site` (another port on the same host) fail.
//
// The request target is validated here too, so route matching and the static server only ever see a path
// that has no encoded slash, dot or backslash, no dot segment, no scheme and no authority.

export const LOOPBACK_HOST = "127.0.0.1";

export function expectedHost(port: number): string {
  return `${LOOPBACK_HOST}:${port}`;
}

export function expectedOrigin(port: number): string {
  return `http://${LOOPBACK_HOST}:${port}`;
}

export function checkHost(hostHeader: string | undefined, port: number): boolean {
  return hostHeader !== undefined && hostHeader === expectedHost(port);
}

export type OriginVerdict = "absent" | "ok" | "bad";

export function checkOrigin(originHeader: string | undefined, port: number): OriginVerdict {
  if (originHeader === undefined) return "absent";
  return originHeader === expectedOrigin(port) ? "ok" : "bad";
}

// `same-site` is refused on purpose: another loopback port on the same host is same-site, and it may be a
// hostile local page.
export function checkFetchSite(value: string | undefined): boolean {
  return value === undefined || value === "same-origin" || value === "none";
}

// A user typing the URL (or following a bookmark) is a navigation with site `none`; the daemon announces a
// fresh pairing link only for that, never for a script on another page.
export function isUserNavigation(headers: Readonly<Record<string, string | undefined>>): boolean {
  const site = headers["sec-fetch-site"];
  return headers["sec-fetch-mode"] === "navigate" && headers["sec-fetch-dest"] === "document" && (site === "none" || site === "same-origin");
}

export interface ParsedTarget {
  // The raw path as sent: percent-escapes are not decoded here.
  readonly path: string;
  // The raw query without the leading "?", possibly empty.
  readonly query: string;
}

export const MAX_TARGET_LENGTH = 4096;

// Visible ASCII only (0x21 to 0x7e): no space, no control character, no non-ASCII byte, no backslash, no "#".
const TARGET_CHARS = /^[\x21-\x7e]+$/;
// %00, %2e, %2f and %5c in any letter case: an encoded NUL, dot, slash or backslash.
const FORBIDDEN_ESCAPE = /%(?:00|2e|2f|5c)/i;

export function parseTarget(raw: string): ParsedTarget | undefined {
  if (raw.length === 0 || raw.length > MAX_TARGET_LENGTH) return undefined;
  // Origin-form only: no absolute-form (`http://...`), no `*`, no authority form, and no `//host/...`.
  if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
  if (!TARGET_CHARS.test(raw) || raw.includes("\\") || raw.includes("#")) return undefined;
  const queryAt = raw.indexOf("?");
  const path = queryAt === -1 ? raw : raw.slice(0, queryAt);
  const query = queryAt === -1 ? "" : raw.slice(queryAt + 1);
  if (FORBIDDEN_ESCAPE.test(path)) return undefined;
  for (const segment of path.split("/")) {
    if (segment === "." || segment === "..") return undefined;
  }
  return { path, query };
}

// Headers whose duplicate copies make a request ambiguous (one proxy or parser reads the first, another the
// last). Node keeps one of them silently, so the raw header list is checked.
export const SINGLE_VALUE_HEADERS = ["host", "origin", "authorization", "content-type", "content-length", "transfer-encoding"] as const;

export function duplicatedHeader(rawHeaders: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index]?.toLowerCase();
    if (name === undefined || !(SINGLE_VALUE_HEADERS as readonly string[]).includes(name)) continue;
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return undefined;
}

// `application/json` with an optional charset parameter and nothing else.
export function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false;
  const parts = value.split(";").map((part) => part.trim().toLowerCase());
  if (parts[0] !== "application/json") return false;
  return parts.slice(1).every((part) => part === "charset=utf-8");
}
