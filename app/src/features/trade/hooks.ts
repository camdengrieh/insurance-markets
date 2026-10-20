import { useCallback, useEffect, useRef, useState } from "react";

import type { PrepareResult } from "./prepare";
import { readAccount, readOrders, type AccountRead, type OrdersRead } from "./reads";
import type { TradeServices } from "./services";

// One prepare at a time per panel. A second press while one is running is ignored (a prepare reserves cap budget at
// the relay, so a double press must not become two items). Leaving the screen cancels the request in flight.
export function usePrepare(onDone?: () => void): {
  readonly result: PrepareResult | null;
  readonly running: boolean;
  readonly run: (call: (signal: AbortSignal) => Promise<PrepareResult>) => void;
  readonly clear: () => void;
} {
  const [result, setResult] = useState<PrepareResult | null>(null);
  const [running, setRunning] = useState(false);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  const run = useCallback((call: (signal: AbortSignal) => Promise<PrepareResult>): void => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    setResult(null);
    const controller = new AbortController();
    abort.current = controller;
    void call(controller.signal)
      .then((outcome) => {
        if (!controller.signal.aborted) setResult(outcome);
      })
      .catch(() => {
        // prepare.ts turns every expected failure into a result; anything else is a bug and shows as a schema violation.
        if (!controller.signal.aborted) setResult({ kind: "schema_violation" });
      })
      .finally(() => {
        busy.current = false;
        if (!controller.signal.aborted) {
          setRunning(false);
          done.current?.();
        }
      });
  }, []);

  const clear = useCallback((): void => setResult(null), []);
  return { result, running, run, clear };
}

export type Loadable<T> = { readonly phase: "idle" } | { readonly phase: "loading" } | { readonly phase: "done"; readonly value: T };

function useRead<T>(owner: string | null, enabled: boolean, load: (owner: string, signal: AbortSignal) => Promise<T>): { readonly state: Loadable<T>; readonly refresh: () => void } {
  const [state, setState] = useState<Loadable<T>>({ phase: "idle" });
  const [round, setRound] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (owner === null || !enabled) {
      setState({ phase: "idle" });
      return;
    }
    const controller = new AbortController();
    setState({ phase: "loading" });
    void loadRef
      .current(owner, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ phase: "done", value });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [owner, enabled, round]);

  return { state, refresh: useCallback(() => setRound((value) => value + 1), []) };
}

// Reads happen when the owner changes and when the person presses Refresh or a prepare finishes. There is no timer:
// nothing here polls.
export function useAccount(services: TradeServices, owner: string | null, enabled: boolean) {
  return useRead<AccountRead>(owner, enabled, (address, signal) => readAccount({ client: services.client, nowMs: services.nowMs }, address, signal));
}

export function useOrders(services: TradeServices, owner: string | null, enabled: boolean) {
  return useRead<OrdersRead>(owner, enabled, (address, signal) => readOrders({ client: services.client, nowMs: services.nowMs }, address, signal));
}
