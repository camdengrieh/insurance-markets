import { MarketsView } from "../features/explorer";
import type { RouteMeta } from "../ui";

// The same surface as "/" at its older address, so links and tests that open #/markets keep working. There is no
// navigation bar; the h1 is the hero band's.
export const route: RouteMeta = {
  id: "markets",
  path: "/markets",
  title: "Markets",
  hero: true,
};

export default function MarketsScreen() {
  return <MarketsView />;
}
