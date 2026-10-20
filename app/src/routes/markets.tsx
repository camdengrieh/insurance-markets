import { MarketsView } from "../features/explorer";
import type { RouteMeta } from "../ui";

export const route: RouteMeta = {
  id: "markets",
  path: "/markets",
  title: "Markets",
  nav: { label: "Markets", order: 10 },
};

export default function MarketsScreen() {
  return <MarketsView />;
}
