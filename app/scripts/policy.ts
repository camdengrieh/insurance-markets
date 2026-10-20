import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS, NEVER_IN_APP_HOSTS } from "../headers.config.ts";
import { lineOf, type Violation } from "./lib.ts";

// What counts as a third-party origin, shared by check-origins (source) and check-bundle (built output).
//
// A hostname that appears as text in the app is one of:
//   network   an origin in headers.config.ts (a CSP entry, or a daemon-only host an adapter may name);
//   inert     a documentation link, XML namespace or schema id inside a library; never fetched, and the
//             CSP would block a fetch to it anyway. Each is listed here with the reason it is harmless;
//   never     a host that must not appear at all (headers.config.ts NEVER_IN_APP_HOSTS);
//   unknown   anything else: a violation.
// The CSP is the real barrier. This policy makes a new hostname a reviewed change.

export const INERT_HOSTS: Readonly<Record<string, string>> = Object.freeze({
  "react.dev": "React production error decoder link in a message string",
  "www.w3.org": "XML and SVG namespace identifiers used by the DOM",
  "json-schema.org": "JSON Schema dialect ids written by zod",
  "viem.sh": "viem documentation links in error messages",
  "abitype.dev": "abitype documentation links in error messages",
  "docs.soliditylang.org": "viem documentation link in an error message",
  "4byte.sourcify.dev": "viem decode-error message names a signature database; the string is never fetched",
});

export type HostClass = "network" | "inert" | "never" | "unknown";

const NETWORK_HOSTS: ReadonlySet<string> = new Set(
  [...BROWSER_DIRECT_ORIGINS.map((entry) => entry.origin), ...DAEMON_ONLY_ORIGINS.map((entry) => entry.origin)].map((origin) => new URL(origin).hostname),
);

export function classifyHost(host: string): HostClass {
  const lower = host.toLowerCase();
  if (Object.hasOwn(NEVER_IN_APP_HOSTS, lower)) return "never";
  if (NETWORK_HOSTS.has(lower)) return "network";
  if (Object.hasOwn(INERT_HOSTS, lower)) return "inert";
  return "unknown";
}

export interface UrlHit {
  readonly url: string;
  readonly scheme: string;
  readonly host: string;
  readonly line: number;
}

// scheme://host with a plain hostname (letters, digits, dots, hyphens). IPv6 and template-literal hosts such
// as `http://[${x}]` are not hostnames and are skipped on purpose.
const URL_PATTERN = /\b(https?|wss?|ftp):\/\/([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::\d+)?/g;

export function findUrls(text: string): UrlHit[] {
  const hits: UrlHit[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const scheme = match[1];
    const host = match[2];
    if (scheme === undefined || host === undefined) continue;
    hits.push({ url: match[0], scheme, host: host.toLowerCase(), line: lineOf(text, match.index ?? 0) });
  }
  return hits;
}

// A bare mention of a never-host without a scheme (a string such as "api.paybox.sh").
export function findNeverHosts(text: string): Array<{ host: string; line: number }> {
  const hits: Array<{ host: string; line: number }> = [];
  for (const host of Object.keys(NEVER_IN_APP_HOSTS)) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(host, from);
      if (at === -1) break;
      hits.push({ host, line: lineOf(text, at) });
      from = at + host.length;
    }
  }
  return hits;
}

// Origin findings for one text (a source file or a built asset).
export function originViolations(file: string, text: string): Violation[] {
  const violations: Violation[] = [];
  for (const hit of findUrls(text)) {
    const cls = classifyHost(hit.host);
    if (cls === "network" || cls === "inert") {
      if (hit.scheme === "http" || hit.scheme === "ws" || hit.scheme === "wss" || hit.scheme === "ftp") {
        if (cls === "network") violations.push({ file, line: hit.line, rule: "insecure-origin", detail: `${hit.url}: network origins are https only` });
      }
      continue;
    }
    if (cls === "never") {
      violations.push({ file, line: hit.line, rule: "never-host", detail: `${hit.host} must not appear: ${NEVER_IN_APP_HOSTS[hit.host] ?? ""}` });
    } else {
      violations.push({ file, line: hit.line, rule: "unknown-origin", detail: `${hit.url}: not in headers.config.ts and not a listed inert host` });
    }
  }
  for (const hit of findNeverHosts(text)) {
    violations.push({ file, line: hit.line, rule: "never-host", detail: `${hit.host} must not appear: ${NEVER_IN_APP_HOSTS[hit.host] ?? ""}` });
  }
  return dedupe(violations);
}

function dedupe(violations: Violation[]): Violation[] {
  const seen = new Set<string>();
  return violations.filter((violation) => {
    const key = `${violation.file}|${violation.line ?? 0}|${violation.rule}|${violation.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---- HTML rules (index.html and every built page) -------------------------------------------------------------------

// No inline script or style, no event-handler attribute, no external subresource, no remote form target.
export function htmlViolations(file: string, html: string): Violation[] {
  const violations: Violation[] = [];
  const add = (rule: string, detail: string, offset: number): void => {
    violations.push({ file, line: lineOf(html, offset), rule, detail });
  };
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = match[1] ?? "";
    const body = (match[2] ?? "").trim();
    if (!/\bsrc\s*=/.test(attrs)) add("inline-script", "an inline <script> block (script-src 'self' forbids it)", match.index ?? 0);
    else if (body !== "") add("inline-script", "a <script src> with a body", match.index ?? 0);
    if (/\bsrc\s*=\s*["']?(?:https?:)?\/\//i.test(attrs)) add("external-script", "a script loaded from another origin", match.index ?? 0);
  }
  for (const match of html.matchAll(/<style\b/gi)) add("inline-style", "an inline <style> block (style-src 'self' forbids it)", match.index ?? 0);
  for (const match of html.matchAll(/<[a-z][^>]*\sstyle\s*=/gi)) add("inline-style", "a style attribute (style-src 'self' forbids it)", match.index ?? 0);
  for (const match of html.matchAll(/<[a-z][^>]*\son[a-z]+\s*=/gi)) add("inline-handler", "an inline event-handler attribute", match.index ?? 0);
  for (const match of html.matchAll(/<(?:link|img|iframe|frame|embed|object|source|audio|video|form)\b[^>]*\s(?:href|src|action|data)\s*=\s*["']?(?:https?:)?\/\/[^\s"'>]+/gi)) {
    add("external-resource", `a resource or form target on another origin: ${match[0].slice(0, 120)}`, match.index ?? 0);
  }
  for (const match of html.matchAll(/\sstyle\s*=\s*["'][^"']*url\(/gi)) add("inline-style", "a style attribute with url()", match.index ?? 0);
  return violations;
}
