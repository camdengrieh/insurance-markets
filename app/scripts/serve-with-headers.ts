import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";

import { OUT_DIRS, securityHeaders, type BuildTarget } from "../headers.config.ts";
import { APP_DIR, isMain } from "./lib.ts";

// A static server for a built directory with the real security headers of that build, bound to 127.0.0.1
// on a free port. For previews and for the end-to-end tests of the CSP (acceptance W0-3); it is not the
// daemon and holds no state. GET and HEAD only, no directory listing, nothing outside the root.

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export interface RunningServer {
  readonly url: string;
  readonly port: number;
  readonly server: Server;
  close(): Promise<void>;
}

export interface ServeOptions {
  readonly dir: string;
  readonly target: BuildTarget;
  // 0 picks a free port.
  readonly port?: number;
}

export async function startStaticServer(options: ServeOptions): Promise<RunningServer> {
  const root = resolve(options.dir);
  const headers = securityHeaders(options.target);
  const server = createServer((request, response) => {
    void (async () => {
      const send = (status: number, body: string, type = "text/plain; charset=utf-8"): void => {
        for (const pair of headers) response.setHeader(pair.key, pair.value);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", type);
        response.statusCode = status;
        response.end(request.method === "HEAD" ? undefined : body);
      };
      if (request.method !== "GET" && request.method !== "HEAD") return send(405, "method not allowed\n");
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      } catch {
        return send(400, "bad request\n");
      }
      if (pathname.includes("\0")) return send(400, "bad request\n");
      const relative = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^[/\\]+/, "");
      const file = join(root, relative);
      if (file !== root && !file.startsWith(`${root}${sep}`)) return send(403, "forbidden\n");
      if (relative.split(sep).some((part) => part.startsWith("."))) return send(404, "not found\n");
      try {
        const info = await stat(file);
        if (!info.isFile()) return send(404, "not found\n");
        for (const pair of headers) response.setHeader(pair.key, pair.value);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
        response.setHeader("Content-Length", String(info.size));
        response.statusCode = 200;
        if (request.method === "HEAD") return void response.end();
        createReadStream(file).pipe(response);
      } catch {
        send(404, "not found\n");
      }
    })();
  });
  await new Promise<void>((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", resolveListening);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    server,
    close: () =>
      new Promise<void>((resolveClosed, reject) => {
        server.close((error) => (error === undefined ? resolveClosed() : reject(error)));
        server.closeAllConnections();
      }),
  };
}

if (isMain(import.meta.url)) {
  const target = process.argv[2];
  if (target !== "standalone" && target !== "cockpit") {
    console.error("usage: node scripts/serve-with-headers.ts <standalone|cockpit> [--port N]");
    process.exit(2);
  }
  const portAt = process.argv.indexOf("--port");
  const port = portAt === -1 ? 0 : Number(process.argv[portAt + 1]);
  const running = await startStaticServer({ dir: resolve(APP_DIR, OUT_DIRS[target]), target, port });
  console.log(`serving ${OUT_DIRS[target]} with the ${target} headers at ${running.url}`);
  const stop = (): void => {
    void running.close().then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
