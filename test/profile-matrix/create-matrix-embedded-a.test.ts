import { createEmbeddedTransport, registerCreateMatrix } from "./create-rig.js";

// Shard 1 of 2 of the creation matrix over the embedded transport: tools -> RelayClient -> relay (with the creation
// module and its watcher) -> mock XO and a local anvil. The shards are separate files so the runner executes them in
// parallel; together they cover both named profiles and every single switch flip (see registerCreateMatrix).
registerCreateMatrix({ label: "embedded", transport: createEmbeddedTransport, shard: 0, shards: 2 });
