import { embeddedTransport, registerProfileMatrix } from "./helpers.js";

// The same profile matrix over tools -> embedded RelayClient -> in-process relay (relay/embedded.ts) -> mock XO.
registerProfileMatrix({ label: "embedded", transport: embeddedTransport, shard: 0, shards: 1 });
