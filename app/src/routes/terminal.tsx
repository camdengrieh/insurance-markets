import { TerminalView } from "../features/terminal";
import { PrepareConsole } from "../features/terminal/prepare";
import type { RouteMeta } from "../ui";

// Needs the local daemon: the terminal reads through its tool route and watches its event stream. In the
// standalone build the shell shows the "needs the Cockpit" tile and never loads this screen. Below the read
// terminal sits the prepare console: a closed grammar that prepares one checked item at a time (it signs and sends
// nothing, and every write path behind it is OFF until the operator turns it on). Both share the page's one session.
export const route: RouteMeta = {
  id: "terminal",
  path: "/terminal",
  title: "Terminal",
  nav: { label: "Terminal", order: 50 },
  availability: "cockpit",
};

export default function TerminalScreen() {
  return (
    <>
      <TerminalView />
      <PrepareConsole />
    </>
  );
}
