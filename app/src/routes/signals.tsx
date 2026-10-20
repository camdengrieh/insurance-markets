import { SignalsView } from "../features/signals";
import type { RouteMeta } from "../ui";

export const route: RouteMeta = {
  id: "signals",
  path: "/signals",
  title: "Signals",
  nav: { label: "Signals", order: 35 },
  availability: "any",
};

export default function SignalsScreen() {
  return <SignalsView />;
}
