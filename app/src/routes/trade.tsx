import { TradeView } from "../features/trade";
import type { RouteMeta } from "../ui";

// Needs the local daemon: every call goes through its tool route. In the standalone build the shell shows the
// "needs the Cockpit" tile and never loads this screen.
export const route: RouteMeta = {
  id: "trade",
  path: "/trade",
  title: "Trade",
  nav: { label: "Trade", order: 48 },
  availability: "cockpit",
};

export default function TradeScreen() {
  return <TradeView />;
}
