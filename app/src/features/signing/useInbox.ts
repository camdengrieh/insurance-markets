import { useCallback, useEffect, useReducer, useRef } from "react";

import { isDaemonError } from "../terminal/client";
import { runEventStream } from "../terminal/stream";
import { INITIAL_SIGNING, signingReducer, type SigningAction, type SigningState } from "./store";
import type { SigningServices } from "./services";

// Subscribes to the daemon's event stream while `active` is true and folds the events into SigningState. One
// connection per mounted screen: the daemon allows only a few per token, so the effect closes its stream before the
// next effect opens another, and the signal aborts the moment the screen goes away.
export function useInbox(services: SigningServices, active: boolean, onUnauthorized: () => void): { readonly state: SigningState; readonly dispatch: (action: SigningAction) => void } {
  const [state, dispatch] = useReducer(signingReducer, INITIAL_SIGNING);
  const readRef = useRef<(() => Promise<number | null>) | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const read = async (): Promise<number | null> => {
      try {
        const snapshot = await services.client.inbox(controller.signal);
        if (!controller.signal.aborted) dispatch({ type: "inbox", items: snapshot.items, invalid: snapshot.invalid, eventId: snapshot.eventId });
        return snapshot.eventId;
      } catch (error) {
        if (isDaemonError(error) && error.code === "unauthorized") onUnauthorized();
        return null;
      }
    };
    readRef.current = read;
    void runEventStream(
      services.stream,
      {
        onState: (next) => {
          if (controller.signal.aborted) return;
          dispatch({ type: "connection", state: next });
          if (next === "unauthorized") onUnauthorized();
        },
        onEvent: (event) => {
          if (controller.signal.aborted) return;
          dispatch({ type: "event", event });
        },
        onViolation: () => {
          if (!controller.signal.aborted) dispatch({ type: "violation" });
        },
        resync: read,
      },
      controller.signal,
    );
    return () => {
      controller.abort();
      readRef.current = null;
      dispatch({ type: "reset" });
    };
  }, [services, active, onUnauthorized]);

  // A state change arrived for an item this page never saw: read the inbox again to bring it in.
  useEffect(() => {
    if (state.staleRead) void readRef.current?.();
  }, [state.staleRead]);

  const stable = useCallback((action: SigningAction): void => dispatch(action), []);
  return { state, dispatch: stable };
}
