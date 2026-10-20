import type { Stats } from "node:fs";
import { chmod, lstat, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import type { FlagEnv } from "../relay/flags.js";

// Where the local mode keeps its state (ledger, prepared items, credentials, audit log). Resolved at
// runtime, never written into the repository, never a fixed path in the code:
//
//   XO_DATA_DIR                          if set (an absolute path, or ~/...)
//   macOS    <home>/Library/Application Support/xo-market-plugin
//   Windows  %LOCALAPPDATA%\xo-market-plugin  (or <home>\AppData\Local\...)
//   other    $XDG_DATA_HOME/xo-market-plugin  (or <home>/.local/share/xo-market-plugin)
//
// The directory is created 0700 and the files inside it 0600. An existing directory that other users
// can read, or that someone else owns, is refused rather than silently tightened: the user pointed at
// it, and a directory such as ~ or ~/Documents must not have its permissions changed by a plugin.

export const DATA_DIR_ENV = "XO_DATA_DIR";
export const APP_DIR_NAME = "xo-market-plugin";

export class LocalPathError extends Error {
  readonly code: "data_dir_invalid" | "data_dir_not_directory" | "data_dir_insecure" | "data_dir_foreign" | "data_dir_unavailable";

  constructor(code: LocalPathError["code"], message: string) {
    super(message);
    this.name = "LocalPathError";
    this.code = code;
  }
}

export interface PathContext {
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

export function resolveDataDir(env: FlagEnv, context: PathContext = {}): string {
  const platform = context.platform ?? process.platform;
  let home: string;
  try {
    home = context.home ?? homedir();
  } catch {
    home = "";
  }
  const raw = typeof env[DATA_DIR_ENV] === "string" ? (env[DATA_DIR_ENV] as string).trim() : "";
  if (raw !== "") {
    if (raw.length > 1024 || CONTROL.test(raw)) throw new LocalPathError("data_dir_invalid", "XO_DATA_DIR is not a usable path.");
    const expanded = raw === "~" ? home : raw.startsWith("~/") || raw.startsWith("~\\") ? join(home, raw.slice(2)) : raw;
    if (!isAbsolute(expanded) || expanded === "") {
      throw new LocalPathError("data_dir_invalid", "XO_DATA_DIR must be an absolute path (or start with ~/), because the folder this process runs in is not something you chose.");
    }
    return resolve(expanded);
  }
  if (home === "") throw new LocalPathError("data_dir_unavailable", "No home directory could be found. Set XO_DATA_DIR to an absolute path for the plugin's state.");
  if (platform === "darwin") return join(home, "Library", "Application Support", APP_DIR_NAME);
  if (platform === "win32") {
    const local = typeof env["LOCALAPPDATA"] === "string" && isAbsolute(env["LOCALAPPDATA"] as string) ? (env["LOCALAPPDATA"] as string) : join(home, "AppData", "Local");
    return join(local, APP_DIR_NAME);
  }
  const xdg = typeof env["XDG_DATA_HOME"] === "string" && isAbsolute(env["XDG_DATA_HOME"] as string) ? (env["XDG_DATA_HOME"] as string) : join(home, ".local", "share");
  return join(xdg, APP_DIR_NAME);
}

export interface EnsuredDir {
  readonly created: boolean;
}

// Creates the directory 0700, or checks that an existing one is private and ours. POSIX only: Windows
// has no mode bits to check and relies on the profile directory's ACL.
export async function ensureDataDir(dir: string, platform: NodeJS.Platform = process.platform): Promise<EnsuredDir> {
  let existing: Stats | undefined;
  try {
    existing = await lstat(dir);
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw new LocalPathError("data_dir_unavailable", "The data directory could not be inspected.");
  }
  if (existing === undefined) {
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      if (platform !== "win32") await chmod(dir, 0o700);
    } catch {
      throw new LocalPathError("data_dir_unavailable", "The data directory could not be created.");
    }
    return { created: true };
  }
  // A symlink to a directory is fine (stat follows it); a file is not.
  const info: Stats | undefined = existing.isSymbolicLink() ? await stat(dir).catch(() => undefined) : existing;
  if (info === undefined || !info.isDirectory()) throw new LocalPathError("data_dir_not_directory", "The data directory path exists and is not a directory.");
  if (platform === "win32") return { created: false };
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid !== undefined && info.uid !== uid) throw new LocalPathError("data_dir_foreign", "The data directory belongs to another user, so it will not be used.");
  if ((info.mode & 0o077) !== 0) {
    throw new LocalPathError(
      "data_dir_insecure",
      "The data directory can be read by other users, and it will hold encrypted credentials and the audit log. Run chmod 700 on it, or point XO_DATA_DIR at a new directory.",
    );
  }
  return { created: false };
}
