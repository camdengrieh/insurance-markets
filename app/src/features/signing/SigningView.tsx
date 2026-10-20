import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { InboxItem } from "@bridge/contract";

import { parseIsoMs } from "../../core/format";
import { Badge, Button, DataTable, EmptyTile, ErrorTile, NeedsCockpitTile, Tile, formatCountdown, useAnnounce, useAppMode, useNow, type Column, type Tone } from "../../ui";
import { PAIR_REASON_TEXT, type PairReason } from "../terminal/session";
import { isDaemonError } from "../terminal/client";
import type { StreamState } from "../terminal/stream";
import { SignatureCard } from "./SignatureCard";
import { evaluateCard } from "./card";
import { useSigningServices, type SigningServices } from "./services";
import { useInbox } from "./useInbox";
import { KIND_TEXT, REMINDERS, STATE_TEXT, requesterText } from "./words";

// The signing inbox: every prepared item the daemon holds, whoever asked for it (this page, the terminal or an agent
// token), and the Signature Card for the one you open. The page only reads and records decisions; it holds no submit
// power and has no code path that sends a signature (acceptance M4-4).

type Pairing = { readonly phase: "checking" } | { readonly phase: "ready" } | { readonly phase: "expired" } | { readonly phase: "unpaired"; readonly reason: PairReason };

const CONNECTION_TEXT: Readonly<Record<StreamState | "idle", { readonly text: string; readonly tone: Tone }>> = {
  idle: { text: "not connected", tone: "neutral" },
  connecting: { text: "connecting", tone: "info" },
  live: { text: "live", tone: "ok" },
  reconnecting: { text: "reconnecting: what you see may be out of date", tone: "warn" },
  resyncing: { text: "reading the inbox again", tone: "info" },
  unauthorized: { text: "the session is no longer valid: the feed stopped", tone: "danger" },
  stopped: { text: "stopped", tone: "neutral" },
};

function PairingNotice({ pairing }: { readonly pairing: Pairing }) {
  if (pairing.phase === "ready") return null;
  if (pairing.phase === "checking") {
    return (
      <Tile tone="info" title="Connecting to the daemon" dataKind="pairing" dataCode="checking">
        <p>Checking whether this page already has a session.</p>
      </Tile>
    );
  }
  const text = pairing.phase === "expired" ? "The daemon no longer accepts this page's session (it expired, or the daemon restarted). Reload the page to have the daemon print a fresh pair link." : PAIR_REASON_TEXT[pairing.reason];
  return <ErrorTile code="NOT_PAIRED" title="Not paired with the daemon" message={text} />;
}

export function SigningView({ services: provided }: { readonly services?: SigningServices }) {
  const mode = useAppMode();
  const fallback = useSigningServices();
  const services = provided ?? fallback;
  const announce = useAnnounce();
  const now = useNow(1000);
  const [pairing, setPairing] = useState<Pairing>({ phase: "checking" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onUnauthorized = useCallback((): void => {
    services.session.forget();
    setPairing({ phase: "expired" });
  }, [services]);

  // A token already held (this tab, or another screen's pairing) wins; otherwise the page's pairing code is exchanged.
  useEffect(() => {
    let cancelled = false;
    if (mode !== "cockpit") return;
    if (services.session.token() !== null) {
      setPairing({ phase: "ready" });
      return;
    }
    void services.session.pair().then((outcome) => {
      if (!cancelled) setPairing(outcome.ok ? { phase: "ready" } : { phase: "unpaired", reason: outcome.reason });
    });
    return () => {
      cancelled = true;
    };
  }, [services, mode]);

  const { state, dispatch } = useInbox(services, mode === "cockpit" && pairing.phase === "ready", onUnauthorized);

  const selected: InboxItem | undefined = useMemo(() => {
    const byId = selectedId === null ? undefined : state.items.find((item) => item.prepared_id === selectedId);
    return byId ?? state.items.find((item) => item.state === "prepared" || item.state === "shown") ?? state.items[0];
  }, [state.items, selectedId]);

  const nowSecond = Math.floor(now / 1000);
  // Rebuilt once a second at most (the clock is the only thing that changes between renders).
  const evaluation = useMemo(
    () => (selected === undefined ? null : evaluateCard(selected.prepared, { nowMs: nowSecond * 1000, state: selected.state })),
    [selected, nowSecond],
  );

  // Tell the daemon the card was shown (audit only; the daemon runs its own checks and never trusts this).
  const posted = useRef(new Set<string>());
  const verification = evaluation?.verification ?? null;
  const selectedState = selected?.state ?? null;
  const selectedPreparedId = selected?.prepared_id ?? null;
  useEffect(() => {
    if (mode !== "cockpit" || pairing.phase !== "ready" || evaluation === null || selectedPreparedId === null || selectedState !== "prepared") return;
    const item = evaluation.item;
    if (item === null || verification === null) return;
    const key = `${selectedPreparedId}:${verification}`;
    if (posted.current.has(key)) return;
    posted.current.add(key);
    services.client
      .decide({
        decision: "shown",
        prepared_id: selectedPreparedId,
        digest_tag: item.summary.digest_tag,
        inner_hash_tag: item.summary.inner_hash_tag ?? null,
        verification,
        failed_checks: [...evaluation.failedChecks],
      })
      .then((updated) => dispatch({ type: "replace", item: updated }))
      .catch((error: unknown) => {
        if (isDaemonError(error) && error.code === "unauthorized") onUnauthorized();
        else setNotice("The daemon could not record that this card was shown. The card is still correct; the audit log may lack that line.");
      });
  }, [mode, pairing.phase, evaluation, selectedPreparedId, selectedState, verification, services, dispatch, onUnauthorized]);

  const reject = useCallback(async (): Promise<boolean> => {
    if (selectedPreparedId === null) return false;
    try {
      dispatch({ type: "replace", item: await services.client.decide({ decision: "reject", prepared_id: selectedPreparedId }) });
      return true;
    } catch (error) {
      if (isDaemonError(error) && error.code === "unauthorized") onUnauthorized();
      return false;
    }
  }, [services, selectedPreparedId, dispatch, onUnauthorized]);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await services.copyText(text);
        return true;
      } catch {
        return false;
      }
    },
    [services],
  );

  const reconcile = useCallback(
    async (kind: "userop" | "order", hash: string) => {
      try {
        return await services.client.reconcile(kind, hash);
      } catch (error) {
        if (isDaemonError(error) && error.code === "unauthorized") onUnauthorized();
        return null;
      }
    },
    [services, onUnauthorized],
  );

  const columns: readonly Column<InboxItem>[] = [
    { key: "id", header: "Item", rowHeader: true, render: (row) => <code>{row.prepared_id.slice(0, 8)}</code> },
    { key: "kind", header: "Kind", render: (row) => KIND_TEXT[row.prepared.kind] ?? "Other" },
    { key: "by", header: "Requested by", render: (row) => requesterText(row.requested_by) },
    { key: "state", header: "State", render: (row) => <Badge tone={STATE_TEXT[row.state].tone}>{STATE_TEXT[row.state].text}</Badge> },
    {
      key: "left",
      header: "Time left",
      render: (row) => {
        if (row.state === "expired") return "expired";
        const ms = parseIsoMs(row.expires_at);
        return ms === null ? "unknown" : formatCountdown(ms - now);
      },
    },
    {
      key: "open",
      header: "Open",
      render: (row) => (
        <Button
          aria-pressed={selected?.prepared_id === row.prepared_id}
          aria-label={`Open item ${row.prepared_id.slice(0, 8)}`}
          onClick={() => {
            setSelectedId(row.prepared_id);
            setNotice(null);
            announce("Opened a signature card.");
          }}
        >
          Open
        </Button>
      ),
    },
  ];

  if (mode !== "cockpit") {
    return <NeedsCockpitTile what="the signing inbox" />;
  }

  const link = CONNECTION_TEXT[state.connection];
  const armedMs = state.armedUntil === null ? null : parseIsoMs(state.armedUntil);
  const postureText =
    state.kill || state.posture === "KILLED"
      ? "KILLED (one-way: only a restart clears it)"
      : state.posture === "ARMED" && armedMs !== null
        ? `ARMED ${formatCountdown(armedMs - now)}`
        : (state.posture ?? "not known yet");

  return (
    <div className="signing">
      <p className="signing-lead">
        This is every item your agent, the terminal or this page asked the relay to prepare for signing. Open one to read it as a card. This page checks the item and records your decision; it never signs and never submits. Your own agent asks PayBox to sign and then submits.
      </p>
      <PairingNotice pairing={pairing} />
      {pairing.phase !== "ready" ? null : (
        <>
          <p className="signing-strip" aria-label="Session">
            Feed: <Badge tone={link.tone}>{link.text}</Badge> Posture: <strong>{postureText}</strong>
            {state.instance === "read_only" ? " This daemon instance serves reads only." : ""}
          </p>
          <ul className="signing-reminders-top" aria-label="Reminders">
            <li>{REMINDERS.dedicated}</li>
            <li>{REMINDERS.advisoryCaps}</li>
          </ul>
          {state.invalid > 0 || state.violations > 0 ? (
            <p className="signing-warning" role="status">
              {state.invalid > 0 ? `${state.invalid} inbox item${state.invalid === 1 ? "" : "s"} did not match the relay's contract and ${state.invalid === 1 ? "is" : "are"} not listed. ` : ""}
              {state.violations > 0 ? `${state.violations} event${state.violations === 1 ? "" : "s"} from the daemon did not match its contract and ${state.violations === 1 ? "was" : "were"} ignored.` : ""}
            </p>
          ) : null}
          <section aria-labelledby="signing-inbox-title">
            <h2 id="signing-inbox-title">Inbox</h2>
            {!state.loaded ? (
              <p>Reading the inbox.</p>
            ) : (
              <DataTable
                caption="Prepared items"
                captionHidden
                columns={columns}
                rows={state.items}
                rowKey={(row) => row.prepared_id}
                empty={<EmptyTile title="No prepared items">The inbox is empty. When your agent prepares something to sign, it appears here with a card. This is an empty list, not an error.</EmptyTile>}
              />
            )}
          </section>
          {selected === undefined || evaluation === null ? null : (
            <section aria-labelledby="signing-card-title" className="signing-card-wrap">
              <h2 id="signing-card-title">Signature card</h2>
              <SignatureCard
                key={selected.prepared_id}
                record={selected}
                evaluation={evaluation}
                nowMs={nowSecond * 1000}
                posture={state.posture}
                armedUntilMs={armedMs}
                kill={state.kill}
                instance={state.instance}
                approvalMode={services.approvalMode}
                facts={services.facts}
                onReject={reject}
                onCopy={copy}
                onReconcile={reconcile}
                notice={notice}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
