import { sanitizeUntrusted } from "../../../src/guardrails/untrusted.js";
import type { Io } from "./types.js";

// What the live kit may print. Two layers:
//
//   1. a registry of exact secrets (the relay key of this run, the master secret, every signature the
//      signer handled, a stored XO triplet): any occurrence in any printed line is replaced, also in its
//      URL-encoded and JSON-escaped forms and after zero-width characters were stripped;
//   2. structure: a JSON body is printed with the value of every key that names a secret replaced, and any
//      0x string that is the length of a signature (65, 66 or 86 bytes) is replaced wherever it sits.
//
// A transaction hash, a user operation hash, an order hash and a digest are 32 bytes and are printed:
// the operator has to compare them with what PayBox shows.

const MASK = "[redacted]";
const ZERO_WIDTH = /[\u200b-\u200f\u2060\ufeff]/g;
const SIGNATURE_HEX = /0x(?:[0-9a-fA-F]{130}|[0-9a-fA-F]{132}|[0-9a-fA-F]{172})(?![0-9a-fA-F])/g;
const SECRET_KEY = /(secret|passphrase|signature|api[-_]?key|authorization|x-relay-key|cookie|password|private[-_]?key|mnemonic|triplet|^token$|access[-_]?token|auth[-_]?token)/i;
// Keys that look secret by name but carry public data.
const PUBLIC_KEY = /^(?:signature_type|signaturetype|key_tag|digest_tag|credential_id|credentials|credentials_state)$/i;

export class SecretRegistry {
  readonly #values = new Set<string>();

  add(value: string | undefined | null): void {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    // Short strings would redact ordinary words.
    if (trimmed.length >= 8) this.#values.add(trimmed);
  }

  size(): number {
    return this.#values.size;
  }

  scrub(text: string): string {
    // Zero-width characters inside a printed secret would defeat a plain match; they carry no meaning in the transcript.
    let out = text.replace(ZERO_WIDTH, "");
    for (const value of this.#values) {
      for (const form of forms(value)) {
        if (form.length >= 8 && out.includes(form)) out = out.split(form).join(MASK);
      }
    }
    return out.replace(SIGNATURE_HEX, "[redacted-signature]");
  }

  // True when the text still holds a registered secret in any form (a test of the scrubbing itself).
  leaks(text: string): boolean {
    for (const value of this.#values) {
      for (const form of forms(value)) if (form.length >= 8 && text.includes(form)) return true;
    }
    return false;
  }
}

function forms(value: string): string[] {
  const out = new Set<string>([value]);
  try {
    out.add(encodeURIComponent(value));
  } catch {
    // unpaired surrogate: the plain form is all there is
  }
  out.add(JSON.stringify(value).slice(1, -1));
  out.add(value.replace(ZERO_WIDTH, ""));
  if (/^0x[0-9a-fA-F]+$/.test(value)) out.add(value.slice(2));
  return [...out];
}

// A JSON value printed with every secret-named key masked. Depth and size are bounded.
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[too deep]";
  if (typeof value === "string") return value.replace(SIGNATURE_HEX, "[redacted-signature]");
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redactValue(entry, depth + 1));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      out[key] = SECRET_KEY.test(key) && !PUBLIC_KEY.test(key) ? MASK : redactValue(entry, depth + 1);
    }
    return out;
  }
  return value;
}

// A request body for the transcript: JSON is masked by key, anything else is shown as a length only.
export function describeBody(body: string | undefined, maxChars = 700): string {
  if (body === undefined || body === "") return "(no body)";
  try {
    const parsed = JSON.parse(body) as unknown;
    const text = JSON.stringify(redactValue(parsed));
    return text.length > maxChars ? `${text.slice(0, maxChars)}... (${String(text.length)} chars)` : text;
  } catch {
    return `(${String(body.length)} bytes, not JSON, not shown)`;
  }
}

// Headers a transcript may show with their values. Every other header is listed by name only.
const SHOWN_HEADERS = new Set(["user-agent", "content-type", "accept"]);

export function describeHeaders(headers: Readonly<Record<string, string>>): string {
  const shown: string[] = [];
  const hidden: string[] = [];
  for (const [name, value] of Object.entries(headers).sort(([a], [b]) => a.localeCompare(b))) {
    if (SHOWN_HEADERS.has(name)) shown.push(`${name}=${value}`);
    else hidden.push(name);
  }
  return `${shown.join(" ")}${hidden.length === 0 ? "" : `${shown.length === 0 ? "" : " "}+${String(hidden.length)} not shown (${hidden.join(", ")})`}`;
}

// URL for the transcript: no credentials. A query is shown in full only for the hosts this kit knows to carry
// no secret (XO's own and the loopback relay); for any other host (a Base node URL often carries its key
// there) only the names of the query parameters are shown, and the path is cut.
const OPEN_HOSTS = /(?:^|\.)xo\.market$|^127\.0\.0\.1$/;
export function describeUrl(url: URL): string {
  if (OPEN_HOSTS.test(url.hostname)) return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
  const query = url.search === "" ? "" : `?${[...url.searchParams.keys()].map((key) => `${key}=...`).join("&")}`;
  const path = url.pathname.length > 1 ? "/..." : "/";
  return `${url.protocol}//${url.host}${path}${query}`;
}

// One line of operator-facing text from something that came from outside: control and bidi characters
// gone, cut to a length.
export function cleanLine(text: unknown, maxChars = 300): string {
  return sanitizeUntrusted(typeof text === "string" ? text : String(text ?? ""), { maxChars }).text;
}

// The output channel of a run. Every line passes the registry before it leaves.
export class Printer {
  readonly #io: Io;
  readonly secrets: SecretRegistry;
  readonly lines: string[] = [];
  #quiet = false;

  constructor(io: Io, secrets: SecretRegistry) {
    this.#io = io;
    this.secrets = secrets;
  }

  // Prints nothing while `fn` runs (the mock's own set-up).
  async quietly<T>(fn: () => Promise<T>): Promise<T> {
    const was = this.#quiet;
    this.#quiet = true;
    try {
      return await fn();
    } finally {
      this.#quiet = was;
    }
  }

  line(text = ""): void {
    if (this.#quiet) return;
    for (const part of text.split("\n")) {
      const clean = this.secrets.scrub(part);
      this.lines.push(clean);
      this.#io.out(clean);
    }
  }

  error(text: string): void {
    for (const part of text.split("\n")) {
      const clean = this.secrets.scrub(part);
      this.lines.push(clean);
      this.#io.err(clean);
    }
  }

  heading(text: string): void {
    this.line("");
    this.line(`== ${text} ==`);
  }

  async ask(prompt: string): Promise<string | undefined> {
    return this.#io.ask(this.secrets.scrub(prompt));
  }
}
