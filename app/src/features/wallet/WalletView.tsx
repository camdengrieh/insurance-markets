import { useEffect, useState } from "react";

import { ACCOUNT_CHAINS } from "../../core/account";
import { EmptyTile, Field, UntrustedText } from "../../ui";
import { untrusted } from "../../core/untrusted";
import { AccountMapPanel, useAccountMap } from "./AccountMapPanel";
import { BalancesPanel } from "./BalancesPanel";
import { BindingsPanel } from "./BindingsPanel";
import { DEFAULT_ENABLED_CHAINS, loadEnabledChains, saveEnabledChains, toggleChain } from "./chain-settings";
import { FundingPanel } from "./FundingPanel";
import type { BindingsState } from "./services";

// The wallet panels (docs/dapp-design.md 4.5 Wallet): saved addresses and the venues asked about each, then, folded
// under a disclosure, the account map per chain, balances and decoded funding steps. There is no Wallet page: the
// Connect modal's "Just watch an address" tab hosts this (features/wallet/ConnectDialog.tsx), so the design keeps its
// three places (the surface, the modal, the dock). The folded panels mount only once the disclosure is opened, so
// opening the modal reads nothing from any chain on its own. It holds no key, signs nothing and sends nothing.

export const WALLET_PANELS_SUMMARY = "Account map, balances and funding steps";

// The heading level of the sections: h2 on a page of their own, h3 inside the modal (under its h2 title).
export type WalletHeading = "h2" | "h3";

function ChainChoice({ chainIds, onChange }: { readonly chainIds: readonly number[]; readonly onChange: (next: readonly number[]) => void }) {
  return (
    <fieldset className="wl-venues">
      <legend>Chains to list the derived account on</legend>
      {ACCOUNT_CHAINS.map((chain) => {
        const id = `chain-${chain.chainId}`;
        return (
          <div key={chain.chainId} className="wl-venue-choice">
            <input id={id} type="checkbox" checked={chainIds.includes(chain.chainId)} onChange={(event) => onChange(toggleChain(chainIds, chain.chainId, event.target.checked))} />
            <label htmlFor={id}>{chain.name}</label>
            <span className="pf-note"> {chain.rpcService === null ? "no public RPC in this build: listed, not checked" : "checked through a public RPC"}</span>
          </div>
        );
      })}
    </fieldset>
  );
}

export interface WalletViewProps {
  readonly state: BindingsState;
  readonly heading?: WalletHeading;
}

export function WalletView({ state, heading = "h2" }: WalletViewProps) {
  const Heading = heading;
  const [open, setOpen] = useState(false);
  if (state.status === "loading") return <p role="status">Loading your saved addresses</p>;
  return (
    <div className="ui-stack wl-root">
      <section aria-labelledby="wl-addresses">
        <Heading id="wl-addresses">Saved addresses</Heading>
        <BindingsPanel state={state} />
      </section>
      <details className="ui-disclosure" data-testid="wallet-panels" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>{WALLET_PANELS_SUMMARY}</summary>
        <div className="ui-disclosure-body">{open ? <WalletPanels state={state} heading={heading} /> : null}</div>
      </details>
    </div>
  );
}

// The account map, balances and funding steps for the chosen owner. Mounted only while the disclosure is open.
export function WalletPanels({ state, heading = "h2" }: WalletViewProps) {
  const Heading = heading;
  const tileHeading = heading === "h2" ? "h3" : "h4";
  const [chainIds, setChainIds] = useState<readonly number[]>(DEFAULT_ENABLED_CHAINS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (state.stores === null) return;
    let live = true;
    void loadEnabledChains(state.stores.settings).then((loaded) => {
      if (live) setChainIds(loaded);
    });
    return () => {
      live = false;
    };
  }, [state.stores]);

  if (state.status === "loading") return <p role="status">Loading your saved addresses</p>;

  const owners = state.bindings.filter((binding) => binding.kind === "eoa" && binding.address !== null);
  const owner = owners.find((binding) => binding.id === selectedId) ?? owners[0] ?? null;
  const ownerAddress = owner?.address ?? null;

  return (
    <div className="ui-stack">
      <section aria-labelledby="wl-map">
        <Heading id="wl-map">Account map</Heading>
        {owner === null || ownerAddress === null ? (
          <EmptyTile title="No PayBox address saved" heading={tileHeading}>
            <p>Save the address that owns your accounts (a PayBox address) to see the account derived from it on each chain.</p>
          </EmptyTile>
        ) : (
          <div className="ui-stack">
            {owners.length > 1 ? (
              <Field label="Owner address">
                {(id) => (
                  <select id={id} className="ui-select" value={owner.id} onChange={(event) => setSelectedId(event.target.value)}>
                    {owners.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.address}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : (
              <p>
                Owner: <UntrustedText value={untrusted(owner.label)} field="generic" />
              </p>
            )}
            <details className="ui-disclosure">
              <summary>Choose chains</summary>
              <div className="ui-disclosure-body">
                <ChainChoice
                  chainIds={chainIds}
                  onChange={(next) => {
                    setChainIds(next);
                    if (state.stores !== null) void saveEnabledChains(state.stores.settings, next);
                  }}
                />
              </div>
            </details>
            <AccountMapPanel owner={ownerAddress} chainIds={chainIds} />
          </div>
        )}
      </section>

      {ownerAddress === null ? null : <OwnerSections owner={ownerAddress} chainIds={chainIds} heading={heading} />}
    </div>
  );
}

// Balances and funding steps for the chosen owner: both need the derived account, which comes from the shared
// account-map query.
function OwnerSections({ owner, chainIds, heading }: { readonly owner: string; readonly chainIds: readonly number[]; readonly heading: WalletHeading }) {
  const Heading = heading;
  const map = useAccountMap(owner, chainIds);
  const account = map.data?.ok === true ? map.data.map.account : null;
  return (
    <>
      <section aria-labelledby="wl-balances">
        <Heading id="wl-balances">Balances</Heading>
        {account === null ? <p role="status">Waiting for the derived account</p> : <BalancesPanel owner={owner} account={account} chainIds={chainIds} />}
      </section>
      <section aria-labelledby="wl-funding">
        <Heading id="wl-funding">Funding steps</Heading>
        <FundingPanel owner={owner} chainIds={chainIds} />
      </section>
    </>
  );
}
