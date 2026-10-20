// File access for the working registry, kept out of the pure modules.

import { renameSync, writeFileSync, readFileSync, existsSync, mkdirSync, readSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalPretty } from "./canonical.js";
import { emptyRegistry, parseRegistry, type Outcome, type Registry } from "./store.js";

export interface FileEnv {
  readText(path: string): string;
  writeText(path: string, text: string): void;
  exists(path: string): boolean;
}

export const nodeFileEnv: FileEnv = {
  readText: (path) => readFileSync(path, "utf8"),
  writeText: (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  },
  exists: (path) => existsSync(path),
};

export function readRegistry(env: FileEnv, path: string): Outcome<Registry> {
  if (!env.exists(path)) return { ok: true, value: emptyRegistry() };
  let raw: unknown;
  try {
    raw = JSON.parse(env.readText(path)) as unknown;
  } catch {
    return { ok: false, errors: [`registry file is not valid JSON`] };
  }
  return parseRegistry(raw);
}

export function writeRegistry(env: FileEnv, path: string, reg: Registry): void {
  env.writeText(path, `${canonicalPretty(reg)}\n`);
}

// One line typed by a person at a terminal. Null when stdin is not a TTY (a pipe, a script, a
// closed stdin), so a scripted caller cannot answer. A pseudo-terminal can still be allocated by a
// determined caller: this is a speed bump that makes approval a deliberate act, not a credential.
export function nodeConfirm(question: string): string | null {
  if (process.stdin.isTTY !== true) return null;
  process.stderr.write(question);
  const buffer = Buffer.alloc(256);
  try {
    const n = readSync(0, buffer, 0, buffer.length, null);
    return buffer.toString("utf8", 0, n).trim();
  } catch {
    return null;
  }
}
