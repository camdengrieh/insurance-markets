import { useState } from "react";
import { createRoot } from "react-dom/client";
import { isAddress } from "viem";
import * as z from "zod/v4";

import { inboxItemSchema, readProxyPath } from "@bridge/contract";
import { digestTag } from "@shared/relay/contract";
import { buildInitData } from "@shared/xo/account/derive";
import { sanitizeUntrusted } from "@shared/guardrails/untrusted";

// A build fixture, not feature code: it pulls in one shared source of each kind (the relay contract with
// viem and zod, the account derivation with viem, the sanitiser, the bridge contract) so the checks look
// at a real bundle with every shared dependency in it.
const tag = digestTag(`0x${"ab".repeat(32)}`);
const init = buildInitData("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
const path = readProxyPath("polymarket_gamma", "/markets", "limit=1");
const text = sanitizeUntrusted("fixture title");
// The app's own use of the two shared packages (the shared sources above use them too).
const own = z.string().refine((value) => isAddress(value)).safeParse("0x0").success;

// A small tree with the DOM features the real screens use (style prop, attributes, svg, input, handlers,
// lists), so the runtime test can watch for string-to-HTML sinks while React renders and updates it.
function Fixture() {
  const [count, setCount] = useState(0);
  const rows = [1, 2, 3].map((n) => <li key={n} style={{ color: n === 2 ? "red" : "inherit" }}>{`row ${n}`}</li>);
  return (
    <main aria-label="fixture">
      <p>
        {tag} {init.length} {path} {String(inboxItemSchema.safeParse({}).success)} {String(own)} {JSON.stringify(text)}
      </p>
      <ul>{rows}</ul>
      <svg width="12" height="12" viewBox="0 0 12 12" role="img" aria-label="dot">
        <circle cx="6" cy="6" r="4" />
      </svg>
      <input type="text" value="x" readOnly aria-label="value" />
      <button type="button" onClick={() => setCount(count + 1)}>{`clicked ${count}`}</button>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<Fixture />);
