import { SigningView } from "../features/signing";
import type { RouteMeta } from "../ui";

// Needs the local daemon: the inbox and the event feed are the daemon's. In the standalone build the shell shows the
// "needs the Cockpit" tile and never loads this screen.
export const route: RouteMeta = {
  id: "signing",
  path: "/signing",
  title: "Signing",
  nav: { label: "Signing", order: 45 },
  availability: "cockpit",
};

export default function SigningScreen() {
  return <SigningView />;
}
