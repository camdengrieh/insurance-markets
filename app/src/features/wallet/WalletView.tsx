import { useEffect, useState } from "react";

import { ACCOUNT_CHAINS } from "../../core/account";
import { Disclosure, EmptyTile, Field, UntrustedText } from "../../ui";
import { untrusted } from "../../core/untrusted";
import { AccountMapPanel, useAccountMap } from "./AccountMapPanel";
import { BalancesPanel } from "./BalancesPanel";
import { BindingsPanel } from "./BindingsPanel";
import { DEFAULT_ENABLED_CHAINS, loadEnabledChains, saveEnabledChains, toggleChain } from "./chain-settings";
import { FundingPanel } from "./FundingPanel";
import { useBindingsState } from "./services";

// The wallet screen (docs/dapp-design.md 4.5 Wallet): saved addresses and the venues asked about each, the account
// map per chain, balances, and decoded funding steps. It holds no key, signs nothing and sends nothing.

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

export function WalletView() {
  const state = useBindingsState();
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
    <div className="ui-stack wl-root">
      <section aria-labelledby="wl-addresses">
        <h2 id="wl-addresses">Saved addresses</h2>
        <BindingsPanel state={state} />
      </section>

      <section aria-labelledby="wl-map">
        <h2 id="wl-map">Account map</h2>
        {owner === null || ownerAddress === null ? (
          <EmptyTile title="No PayBox address saved" heading="h3">
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
            <Disclosure summary="Choose chains">
              <ChainChoice
                chainIds={chainIds}
                onChange={(next) => {
                  setChainIds(next);
                  if (state.stores !== null) void saveEnabledChains(state.stores.settings, next);
                }}
              />
            </Disclosure>
            <AccountMapPanel owner={ownerAddress} chainIds={chainIds} />
          </div>
        )}
      </section>

      {ownerAddress === null ? null : <OwnerSections owner={ownerAddress} chainIds={chainIds} />}
    </div>
  );
}

// Balances and funding steps for the chosen owner: both need the derived account, which comes from the shared
// account-map query.
function OwnerSections({ owner, chainIds }: { readonly owner: string; readonly chainIds: readonly number[] }) {
  const map = useAccountMap(owner, chainIds);
  const account = map.data?.ok === true ? map.data.map.account : null;
  return (
    <>
      <section aria-labelledby="wl-balances">
        <h2 id="wl-balances">Balances</h2>
        {account === null ? <p role="status">Waiting for the derived account</p> : <BalancesPanel owner={owner} account={account} chainIds={chainIds} />}
      </section>
      <section aria-labelledby="wl-funding">
        <h2 id="wl-funding">Funding steps</h2>
        <FundingPanel owner={owner} chainIds={chainIds} />
      </section>
    </>
  );
}
