import { MarketsView } from "../features/explorer";
import type { RouteMeta } from "../ui";

// The start of the page is the Markets surface: the one table with its views, inspector and market modal. The h1
// lives in the surface's hero band (`hero: true`), so the shell renders none.
export const route: RouteMeta = {
  id: "home",
  path: "/",
  title: "Markets",
  hero: true,
};

export default function HomeScreen() {
  return <MarketsView />;
}
