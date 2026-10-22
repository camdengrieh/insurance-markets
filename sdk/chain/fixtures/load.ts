import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createRpcPort, type RpcPort } from "../rpc.js";
import { replayPost, type Recording } from "./replay.js";
import { SCENARIO_METHODS } from "./scenarios.js";

// Loads a venue's recording and builds a port that answers from it.

const CHAIN = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadRecording(venue: "polymarket" | "limitless" | "xo"): Recording {
  return JSON.parse(readFileSync(join(CHAIN, venue, "fixtures", "recorded_2026-10-22.json"), "utf8")) as Recording;
}

export function replayPort(recording: Recording): { readonly port: RpcPort; readonly sent: string[] } {
  const post = replayPost(recording.exchanges);
  return { port: createRpcPort({ url: recording.rpc, post, methods: SCENARIO_METHODS }), sent: post.sent };
}
