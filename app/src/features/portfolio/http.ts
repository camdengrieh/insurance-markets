import { AdapterException } from "../../core/errors";
import { adapterErrorOfStatus } from "../../core/fetch";
import type { AdapterDeps } from "../../core/ports";

// One GET for one JSON value. Failures are AdapterException with a closed code and a fixed message: an upstream
// body is never copied into an error. A thrown fetch (the app's port refuses a host, a daemon error) is passed
// up as it is, and failureOf classifies it.

export const MAX_BODY_CHARS = 2 * 1024 * 1024;

export type JsonAnswer = { readonly status: "ok"; readonly body: unknown } | { readonly status: "not_found" };

export async function getJson(deps: AdapterDeps, url: string, options: { readonly notFoundIsAnswer?: boolean } = {}): Promise<JsonAnswer> {
  const response = await deps.fetch(url, { method: "GET", headers: { accept: "application/json" } });
  if (response.status === 404 && options.notFoundIsAnswer === true) return { status: "not_found" };
  if (!response.ok) throw new AdapterException(adapterErrorOfStatus(response.status), "http_status");
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new AdapterException("TIMEOUT", "body_unreadable");
  }
  if (text.length > MAX_BODY_CHARS) throw new AdapterException("SCHEMA_DRIFT", "body_too_large");
  try {
    return { status: "ok", body: JSON.parse(text) as unknown };
  } catch {
    throw new AdapterException("SCHEMA_DRIFT", "not_json");
  }
}
