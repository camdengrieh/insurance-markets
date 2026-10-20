import type { Stats } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";

import { OUT_DIRS } from "../app/headers.config.js";

// Static file serving for the Cockpit build (app/dist/cockpit), same origin as the API (docs/dapp-design.md
// 1.1, 5.4). It serves files and nothing else:
//
//   - GET and HEAD only; the caller (bridge/server.ts) has already pinned Host and Origin and adds the CSP and
//     the other security headers from app/headers.config.ts to every response;
//   - the path is decoded once, then must stay inside the build directory after symlinks are resolved;
//     dot-files and dot-directories, NUL, backslashes and dot segments are refused; no directory listing;
//   - a path without a file extension that a browser asked for as a page (Accept: text/html) gets index.html,
//     so the client-side router can own its routes; any other missing path is a plain 404;
//   - Cache-Control: no-store (a rebuild is picked up at once; this is local traffic).

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

export function contentTypeFor(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
}

// <repo>/app/dist/cockpit, found from this module's own location. The module lives in <repo>/bridge when
// run from source and is bundled into <repo>/dist/local.mjs in the built form: both are one level below the
// repository root. A different location is given with --app-dir (an absolute path).
export function defaultAppDir(moduleUrl: string = import.meta.url): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "..", "app", OUT_DIRS.cockpit);
}

export type StaticOutcome =
  | {
      readonly kind: "file";
      readonly status: 200;
      readonly contentType: string;
      readonly size: number;
      readonly isIndex: boolean;
      // Absent for HEAD.
      readonly body?: Readable;
      readonly close: () => Promise<void>;
    }
  | { readonly kind: "missing"; readonly reason: "not_built" | "not_found" }
  | { readonly kind: "refused"; readonly reason: "bad_path" | "outside_root" | "hidden" };

export interface StaticRequest {
  readonly method: "GET" | "HEAD";
  // The raw path as sent (already validated by parseTarget: no dot segments, no encoded slash).
  readonly path: string;
  readonly accept: string | undefined;
}

export interface StaticSite {
  readonly root: string;
  // False when the build directory has no index.html (the app is not built).
  available(): Promise<boolean>;
  serve(request: StaticRequest): Promise<StaticOutcome>;
}

function wantsHtml(accept: string | undefined): boolean {
  return accept !== undefined && accept.toLowerCase().includes("text/html");
}

export function createStaticSite(rootDir: string): StaticSite {
  if (!isAbsolute(rootDir)) throw new Error("The app directory must be an absolute path.");
  const root = resolve(rootDir);
  let realRoot: string | undefined;

  async function realRootDir(): Promise<string | undefined> {
    try {
      // Resolved on each request when it failed before, so a build that appears later is served.
      realRoot ??= await realpath(root);
      return realRoot;
    } catch {
      return undefined;
    }
  }

  async function openInside(base: string, relative: string): Promise<{ handle: FileHandle; info: Stats } | "outside" | undefined> {
    const candidate = join(base, relative);
    let real: string;
    try {
      real = await realpath(candidate);
    } catch {
      return undefined;
    }
    if (real !== base && !real.startsWith(`${base}${sep}`)) return "outside";
    let info: Stats;
    try {
      info = await stat(real);
    } catch {
      return undefined;
    }
    if (!info.isFile()) return undefined;
    try {
      return { handle: await open(real, "r"), info };
    } catch {
      return undefined;
    }
  }

  async function serve(request: StaticRequest): Promise<StaticOutcome> {
    const base = await realRootDir();
    if (base === undefined) return { kind: "missing", reason: "not_built" };
    let decoded: string;
    try {
      decoded = decodeURIComponent(request.path);
    } catch {
      return { kind: "refused", reason: "bad_path" };
    }
    if (decoded.includes("\0") || decoded.includes("\\")) return { kind: "refused", reason: "bad_path" };
    const parts = decoded.split("/").filter((part) => part !== "");
    if (parts.some((part) => part === "." || part === ".." || part.includes("/"))) return { kind: "refused", reason: "bad_path" };
    if (parts.some((part) => part.startsWith("."))) return { kind: "refused", reason: "hidden" };

    const wantsIndex = parts.length === 0;
    let relative = wantsIndex ? "index.html" : parts.join("/");
    let opened = await openInside(base, relative);
    if (opened === "outside") return { kind: "refused", reason: "outside_root" };
    let isIndex = wantsIndex;
    if (opened === undefined && !wantsIndex) {
      const last = parts[parts.length - 1] ?? "";
      // Client-side routes have no extension; a missing asset (with one) must stay a 404.
      if (extname(last) === "" && wantsHtml(request.accept)) {
        relative = "index.html";
        opened = await openInside(base, relative);
        isIndex = true;
        if (opened === "outside") return { kind: "refused", reason: "outside_root" };
      }
    }
    if (opened === undefined) {
      const indexThere = await openInside(base, "index.html");
      if (indexThere === undefined || indexThere === "outside") return { kind: "missing", reason: "not_built" };
      await indexThere.handle.close().catch(() => undefined);
      return { kind: "missing", reason: "not_found" };
    }
    const { handle, info } = opened;
    const contentType = contentTypeFor(relative);
    const close = async (): Promise<void> => {
      await handle.close().catch(() => undefined);
    };
    if (request.method === "HEAD") {
      await close();
      return { kind: "file", status: 200, contentType, size: info.size, isIndex, close: async () => undefined };
    }
    return { kind: "file", status: 200, contentType, size: info.size, isIndex, body: handle.createReadStream(), close };
  }

  return {
    root,
    async available() {
      const base = await realRootDir();
      if (base === undefined) return false;
      const opened = await openInside(base, "index.html");
      if (opened === undefined || opened === "outside") return false;
      await opened.handle.close().catch(() => undefined);
      return true;
    },
    serve,
  };
}
