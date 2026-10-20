// Child process for the crash-durability test in relay-core-store.test.ts. Not a test itself.
// It opens a data directory, commits records one after another, and prints "ack <n>" after commit n
// has resolved. The parent kills it with SIGKILL at an arbitrary moment and then checks that every
// acknowledged commit is on disk and that the directory opens.
import { openRelayStorage } from "../relay/store.js";

const dir = process.argv[2];
if (dir === undefined) throw new Error("usage: relay-core-crash-child.ts <dir>");

const storage = await openRelayStorage({ dir });
let n = 0;
for (;;) {
  await storage.state.transact(() => ({
    ops: [
      { ns: "crash", key: `k${n}`, value: { n, pad: "x".repeat(300) } },
      { ns: "crash", key: "last", value: n },
    ],
    result: undefined,
  }));
  process.stdout.write(`ack ${n}\n`);
  n += 1;
}
