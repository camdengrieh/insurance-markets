import { XoClient as SdkXoClient } from "../../sdk/venues/xo/api/client.js";
import { withNodeDefaults, type HttpOptions } from "./http.js";

// The XO read client and its decoders live in the SDK (sdk/venues/xo/api/client.ts). This is the plugin's (Node)
// host for it: an XoClient whose options take Node's defaults (src/xo/http.ts), so every tool and test keeps its
// import path and its behaviour.

export * from "../../sdk/venues/xo/api/client.js";

export type XoClientOptions = HttpOptions;

export class XoClient extends SdkXoClient {
  constructor(options: XoClientOptions = {}) {
    super(withNodeDefaults(options));
  }
}
