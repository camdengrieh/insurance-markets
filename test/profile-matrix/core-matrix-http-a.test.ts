import { httpTransport, registerProfileMatrix } from "./helpers.js";

// Shard 1 of 3 of the profile matrix over tools -> HTTP RelayClient -> loopback relay -> mock XO. The shards are
// separate files so the runner executes them in parallel; together they cover both named profiles and every single
// switch flip (see registerProfileMatrix in helpers.ts for what is asserted).
registerProfileMatrix({ label: "http", transport: httpTransport, shard: 0, shards: 3 });
