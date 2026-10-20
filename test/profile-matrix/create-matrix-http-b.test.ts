import { createHttpTransport, registerCreateMatrix } from "./create-rig.js";

// Shard 2 of 3 of the creation matrix over the http transport: tools -> RelayClient -> relay (with the creation
// module and its watcher) -> mock XO and a local anvil. The shards are separate files so the runner executes them in
// parallel; together they cover both named profiles and every single switch flip (see registerCreateMatrix).
registerCreateMatrix({ label: "http", transport: createHttpTransport, shard: 1, shards: 3 });
