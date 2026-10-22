import { useState, type FormEvent } from "react";

import type { AddressWarning } from "../../core/address";
import { BINDING_PRIVACY_NOTICE, type AddressBinding, type BindingKind, type BindingResult } from "../../core/bindings";
import type { VenueId } from "../../core/ports";
import { untrusted } from "../../core/untrusted";
import { Badge, Button, Disclosure, Field, Tile, UntrustedText, useAnnounce, venueName } from "../../ui";
import type { BindingsState } from "./services";

// The binding screen (acceptance M2-1 and M2-9): paste an address, see every warning with the full addresses,
// and choose per saved address which venues are asked about it. The privacy cost is stated first, in the
// words of core/bindings.ts. The store holds addresses and labels only: no key, no credential, no market data.

// The venues that have a position reader in this build, and the kinds of address each one understands.
const VENUE_CHOICES: ReadonlyArray<{ readonly venue: VenueId; readonly kinds: readonly BindingKind[]; readonly asks: string }> = [
  { venue: "xo", kinds: ["eoa", "kernel"], asks: "asks XO about the account derived from this address" },
  { venue: "polymarket", kinds: ["eoa", "venue_proxy"], asks: "asks a public Polygon RPC for the token balances of this address and of the Polymarket wallets derived from it" },
  { venue: "trueo", kinds: ["eoa", "venue_proxy", "kernel"], asks: "asks a public Base RPC for the token balances" },
  { venue: "pascal", kinds: ["solana"], asks: "asks Pascal's data API about this Solana address" },
];

const KIND_TEXT: Readonly<Record<BindingKind, string>> = Object.freeze({
  eoa: "PayBox address (EOA)",
  kernel: "Derived XO account",
  venue_proxy: "Polymarket wallet",
  solana: "Solana address",
  venue_account: "Venue account",
});

const SOURCE_TEXT = { pasted: "pasted by you", agent_import: "imported from your agent", derived: "derived from your address" } as const;

type AddKind = "eoa" | "venue_proxy" | "solana";

function WarningList({ warnings, bindings }: { readonly warnings: readonly AddressWarning[]; readonly bindings: readonly AddressBinding[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="wl-warnings">
      {warnings.map((warning) => {
        const other = warning.otherId === undefined ? undefined : bindings.find((binding) => binding.id === warning.otherId);
        return (
          <li key={`${warning.code}:${warning.otherId ?? ""}`}>
            <Badge tone={warning.requiresConfirmation ? "danger" : "warn"}>{warning.code.replace("_", " ")}</Badge> {warning.message}
            {other?.address === undefined || other.address === null ? null : (
              <>
                {" "}
                Saved address to compare with: <code>{other.address}</code>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AddForm({ state }: { readonly state: BindingsState }) {
  const announce = useAnnounce();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<AddKind>("eoa");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BindingResult | null>(null);

  async function submit(confirm: boolean): Promise<void> {
    if (state.store === null) return;
    setPending(true);
    const outcome = await state.store.add({ address, kind, ...(label.trim() === "" ? {} : { label }), ...(confirm ? { confirm: true } : {}) });
    setPending(false);
    setResult(outcome);
    if (outcome.ok) {
      setAddress("");
      setLabel("");
      await state.refresh();
      announce("Address saved. Choose which venues to ask about it.");
    } else {
      announce(outcome.error === "confirmation_required" ? "Check the warnings before saving." : outcome.message, "assertive");
    }
  }

  const needsConfirm = result !== null && !result.ok && result.error === "confirmation_required";
  return (
    <form
      className="ui-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <Field label="Address">
        {(id) => <input id={id} className="ui-input" value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="off" spellCheck={false} inputMode="text" aria-describedby="wl-address-help" />}
      </Field>
      <p id="wl-address-help" className="pf-note">
        Paste the full 0x address (or a Solana address). Names such as .eth are not resolved.
      </p>
      <Field label="What kind of address is it?">
        {(id) => (
          <select id={id} className="ui-select" value={kind} onChange={(event) => setKind(event.target.value as AddKind)}>
            <option value="eoa">PayBox address (the address that owns your accounts)</option>
            <option value="venue_proxy">Polymarket wallet (its proxy or deposit wallet)</option>
            <option value="solana">Solana address (Pascal)</option>
          </select>
        )}
      </Field>
      <Field label="Label (optional)">{(id) => <input id={id} className="ui-input" value={label} maxLength={48} onChange={(event) => setLabel(event.target.value)} autoComplete="off" />}</Field>
      <div>
        <Button type="submit" variant="primary" busy={pending} disabled={state.store === null || address.trim() === ""}>
          Check and save
        </Button>
      </div>
      {result === null ? null : (
        <div role={result.ok ? "status" : "alert"} data-testid="add-result">
          {result.ok ? <p>Saved. It is not looked up anywhere until you choose venues for it below.</p> : <p>{result.message}</p>}
          <WarningList warnings={result.warnings ?? []} bindings={state.bindings} />
          {needsConfirm ? (
            <>
              <p>
                You pasted: <code>{address.trim()}</code>
              </p>
              <Button onClick={() => void submit(true)} busy={pending}>
                I compared every character: save anyway
              </Button>
            </>
          ) : null}
        </div>
      )}
    </form>
  );
}

function BindingCard({ binding, state }: { readonly binding: AddressBinding; readonly state: BindingsState }) {
  const announce = useAnnounce();
  async function toggle(venue: VenueId, on: boolean): Promise<void> {
    if (state.store === null) return;
    const next = on ? [...binding.venues, venue] : binding.venues.filter((candidate) => candidate !== venue);
    const outcome = await state.store.setVenues(binding.id, next);
    await state.refresh();
    announce(outcome.ok ? `${venueName(venue)} ${on ? "will be asked about" : "will no longer be asked about"} this address.` : outcome.message, outcome.ok ? "polite" : "assertive");
  }
  return (
    <li className="wl-binding" data-binding={binding.id}>
      <h4>
        <UntrustedText value={untrusted(binding.label)} field="generic" /> <Badge tone="neutral">{KIND_TEXT[binding.kind]}</Badge>
      </h4>
      <p>
        <code>{binding.address ?? "no address"}</code> <span className="pf-note">({SOURCE_TEXT[binding.source]})</span>
      </p>
      <fieldset className="wl-venues">
        <legend>Ask these venues about this address</legend>
        {VENUE_CHOICES.map((choice) => {
          const applies = choice.kinds.includes(binding.kind);
          const checked = binding.venues.includes(choice.venue);
          const inputId = `${binding.id}:${choice.venue}`;
          return (
            <div key={choice.venue} className="wl-venue-choice">
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                disabled={!applies && !checked}
                onChange={(event) => void toggle(choice.venue, event.target.checked)}
                aria-describedby={`${inputId}:hint`}
              />
              <label htmlFor={inputId}>{venueName(choice.venue)}</label>
              <span id={`${inputId}:hint`} className="pf-note">
                {applies ? ` ${choice.asks}` : " not for this kind of address"}
              </span>
            </div>
          );
        })}
      </fieldset>
      <Button
        onClick={() => {
          void (async () => {
            await state.store?.remove(binding.id);
            await state.refresh();
            announce("Address removed.");
          })();
        }}
      >
        Remove this address
      </Button>
    </li>
  );
}

function ExportImport({ state }: { readonly state: BindingsState }) {
  const announce = useAnnounce();
  const [exported, setExported] = useState<string | null>(null);
  const [incoming, setIncoming] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [wipe, setWipe] = useState(false);
  return (
    <Disclosure summary="Export, import or wipe saved addresses">
      <div className="ui-stack">
        <p>The export is a plain list of addresses and labels. It holds no key. Import refuses anything that looks like a secret.</p>
        <div>
          <Button
            onClick={() => {
              void (async () => setExported(state.store === null ? null : await state.store.exportJson()))();
            }}
          >
            Show export
          </Button>
        </div>
        {exported === null ? null : (
          <Field label="Export (copy this)">{(id) => <textarea id={id} className="ui-input wl-textarea" readOnly value={exported} rows={8} />}</Field>
        )}
        <Field label="Import (paste an export here)">{(id) => <textarea id={id} className="ui-input wl-textarea" value={incoming} onChange={(event) => setIncoming(event.target.value)} rows={5} />}</Field>
        <div>
          <Button
            disabled={incoming.trim() === "" || state.store === null}
            onClick={() => {
              void (async () => {
                const outcome = await state.store?.importJson(incoming);
                if (outcome === undefined) return;
                setMessage(outcome.ok ? `Imported ${outcome.imported} addresses; ${outcome.skipped} already saved were left as they were. An import selects no venue: choose them yourself.` : outcome.message);
                if (outcome.ok) {
                  setIncoming("");
                  await state.refresh();
                }
                announce(outcome.ok ? "Import finished." : "Import refused.", outcome.ok ? "polite" : "assertive");
              })();
            }}
          >
            Import
          </Button>
        </div>
        {message === null ? null : <p role="status">{message}</p>}
        <div>
          {wipe ? (
            <>
              <p>This removes every saved address from this browser. It cannot be undone.</p>
              <Button
                onClick={() => {
                  void (async () => {
                    await state.store?.clear();
                    await state.refresh();
                    setWipe(false);
                    setExported(null);
                    announce("Saved addresses removed.");
                  })();
                }}
              >
                Yes, remove all saved addresses
              </Button>{" "}
              <Button onClick={() => setWipe(false)}>Keep them</Button>
            </>
          ) : (
            <Button onClick={() => setWipe(true)}>Remove all saved addresses</Button>
          )}
        </div>
      </div>
    </Disclosure>
  );
}

export function BindingsPanel({ state }: { readonly state: BindingsState }) {
  return (
    <div className="ui-stack" data-testid="bindings-panel">
      <Tile tone="info" title="What looking up an address costs" role="note" heading="h3" dataKind="privacy">
        <p>{BINDING_PRIVACY_NOTICE}</p>
        <p>
          {state.persistence === "indexeddb"
            ? "Saved addresses are kept in this browser's own storage."
            : state.persistence === "memory"
              ? "This browser would not give the page storage, so saved addresses last only until you close the tab."
              : "Opening storage."}
        </p>
      </Tile>
      <AddForm state={state} />
      {state.bindings.length === 0 ? (
        <p>No addresses saved yet.</p>
      ) : (
        <ul className="wl-bindings">
          {state.bindings.map((binding) => (
            <BindingCard key={binding.id} binding={binding} state={state} />
          ))}
        </ul>
      )}
      <ExportImport state={state} />
    </div>
  );
}
