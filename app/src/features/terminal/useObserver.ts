import { useEffect, useReducer } from "react";

import { isDaemonError } from "./client";
import { INITIAL_OBSERVER, observerReducer, type ObserverState } from "./observer";
import type { TerminalServices } from "./services";
import { runEventStream } from "./stream";

// Subscribes to the daemon's event stream while `active` is true and folds the events into ObserverState.
// One connection per mounted pane: the daemon allows only a few per token, so the effect closes its stream
// before the next effect opens another (React's StrictMode runs the pair twice in development), and the signal
// aborts the moment the screen goes away.
export function useObserver(services: TerminalServices, active: boolean, onUnauthorized: () => void): ObserverState {
  const [state, dispatch] = useReducer(observerReducer, INITIAL_OBSERVER);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void runEventStream(
      services.stream,
      {
        onState: (next) => {
          if (controller.signal.aborted) return;
          dispatch({ type: "connection", state: next });
          if (next === "unauthorized") onUnauthorized();
        },
        onEvent: (event) => {
          if (!controller.signal.aborted) dispatch({ type: "event", event });
        },
        onViolation: () => {
          if (!controller.signal.aborted) dispatch({ type: "violation" });
        },
        resync: async () => {
          try {
            const snapshot = await services.client.inbox(controller.signal);
            if (!controller.signal.aborted) dispatch({ type: "inbox", items: snapshot.items, invalid: snapshot.invalid, eventId: snapshot.eventId });
            return snapshot.eventId;
          } catch (error) {
            if (isDaemonError(error) && error.code === "unauthorized") onUnauthorized();
            return null;
          }
        },
      },
      controller.signal,
    );
    return () => {
      controller.abort();
      dispatch({ type: "reset" });
    };
  }, [services, active, onUnauthorized]);

  return state;
}
