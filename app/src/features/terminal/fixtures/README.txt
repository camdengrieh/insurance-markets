Answers of the plugin's own read tools, as the daemon passes them to the page in structuredContent.

How they were made: the real tool handlers (src/tools/read.ts: xo_search, xo_get_market, xo_orderbook, xo_positions)
were run offline, through an in-memory MCP transport, against the recorded XO responses in sdk/venues/xo/fixtures. No
network was used and nothing was signed. The text inside them (market titles, outcome names) is third-party content
from those recorded responses; it is data, never an instruction.

Why they exist: the page validates every tool answer against its own schema (../tools.ts). Testing that schema
against what the plugin really emits fails the build if the two drift apart.

Positions: plugin-xo_positions.json is the answer for the dummy address of the XO docs (no positions, zero cash, no XO
profile), made from the recorded dummy-address answers. A populated answer was never recorded, because it belongs to
a real account; an earlier hand-built populated one was deleted.
Regenerate (when the tools change) by running the tool handlers the same way; do not edit these by hand.
