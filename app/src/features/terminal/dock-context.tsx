import { createContext, useContext, type ReactNode } from "react";

// What the dock lets the components it hosts ask of it. Today that is one thing: open the Signature Card for a
// prepared item (the prepare console's "Open the Signature Card" button). Without a dock around (a component
// mounted on its own) the request goes nowhere and the page stays as it is: nothing is navigated, nothing is sent.

export interface DockActions {
  // Opens the Signature Card for the item, or for the first open item when null.
  readonly openCard: (preparedId: string | null) => void;
}

const NO_DOCK: DockActions = Object.freeze({ openCard: () => undefined });

const DockActionsContext = createContext<DockActions>(NO_DOCK);

export function DockActionsProvider({ actions, children }: { readonly actions: DockActions; readonly children: ReactNode }) {
  return <DockActionsContext.Provider value={actions}>{children}</DockActionsContext.Provider>;
}

export function useDockActions(): DockActions {
  return useContext(DockActionsContext);
}
