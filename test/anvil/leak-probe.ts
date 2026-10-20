// Helper process for test/anvil-harness.test.ts, not a test. It starts an anvil and prints its URL.
//   (no argument)  exits at once WITHOUT calling stop(), so the test can check that the process exit
//                  hook of start.ts still kills the child
//   wait           keeps running until it is signalled (SIGTERM or SIGINT), so the test can check that
//                  the signal handlers kill the child too

import { startAnvil } from "./start.js";

const started = await startAnvil({ chainId: 3223 });
console.log(started.ok ? started.url : `skip: ${started.reason}`);
if (process.argv[2] === "wait") {
  setInterval(() => {}, 1_000);
} else {
  process.exit(0);
}
