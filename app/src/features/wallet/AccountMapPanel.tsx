import { useQuery } from "@tanstack/react-query";

import type { AccountRow } from "../../core/account";
import { CAPABILITY_IDS, factDetail, type CapabilityFacts, type CapabilityId } from "../../core/capabilities";
import { Badge, CapabilityBadge, DataTable, EmptyTile, ErrorTile, NeedsCockpitTile, formatAge, formatUtc, toIso, useNow, type Column, type Tone } from "../../ui";
import { loadAccountMap, type AccountMap } from "./account-map";
import { chainsFromIds } from "./chain-settings";
import { useWalletServices } from "./services";

// The account map (docs/dapp-design.md 2.3, 4.5; acceptance M2-2, M2-3, M2-8). The derived account is listed once
// per enabled chain, each row with its own state. A chain this build has no RPC for reads "not checked"; a chain
// whose RPC did not answer reads "RPC unreachable". Neither is ever worded as "undeployed", and the only status
// that offers a deposit target is one backed by code at the address (and, on XO, door (a)).

const STATUS_TONE: Readonly<Record<AccountRow["status"], Tone>> = Object.freeze({
  derived: "warn",
  "code-present": "ok",
  "venue-registered": "ok",
  "trading-enabled": "ok",
  "rpc-unreachable": "warn",
  "foreign-code": "danger",
});

const CAPABILITY_LABELS: Readonly<Partial<Record<CapabilityId, string>>> = Object.freeze({
  door_a_bundler_admits_first_userop: "XO admits a first operation from a new account (door a)",
  paybox_address_is_plain_eoa: "Your PayBox address is a plain EOA",
  paybox_signs_raw_digest: "PayBox signs a raw digest",
  paybox_signs_typed_data_3223: "PayBox signs typed data for XO",
  door_d_orderbook_credits_usdce: "XO credits USDC.e sent to the account (door d)",
});

function columns(map: AccountMap): readonly Column<AccountRow>[] {
  const rpc = new Map(map.chains.map((state) => [state.chain.chainId, state.rpc] as const));
  return [
    { key: "chain", header: "Chain", rowHeader: true, render: (row) => `${row.chain.name} (${row.chain.caip2})` },
    {
      key: "state",
      header: "State of the account on this chain",
      render: (row) => (
        <>
          <Badge tone={STATUS_TONE[row.status]}>{row.status.replace("-", " ")}</Badge> {row.statusText}
          {rpc.get(row.chain.chainId) === "none" ? <span className="pf-note"> This build has no public RPC for this chain, so nothing was checked.</span> : null}
          {row.anomalies.length === 0 ? null : <span className="pf-note"> Inconsistent evidence: {row.anomalies.join(", ")}.</span>}
        </>
      ),
    },
    {
      key: "deposit",
      header: "Deposit target?",
      render: (row) =>
        row.deposit.allowed ? (
          <Badge tone="ok">yes</Badge>
        ) : (
          <>
            <Badge tone="warn">not yet</Badge>
            <ul className="pf-flags">
              {row.deposit.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </>
        ),
    },
  ];
}

export function CapabilityList({ facts }: { readonly facts: CapabilityFacts }) {
  const ids = CAPABILITY_IDS.filter((id) => CAPABILITY_LABELS[id] !== undefined);
  return (
    <ul className="wl-capabilities" aria-label="What has been proven">
      {ids.map((id) => (
        <li key={id} title={factDetail(facts[id])}>
          <CapabilityBadge state={facts[id]} label={CAPABILITY_LABELS[id] ?? id} />
        </li>
      ))}
    </ul>
  );
}

// One query shared by every panel that needs the account map (the same key is fetched once).
export function useAccountMap(owner: string, chainIds: readonly number[]) {
  const services = useWalletServices();
  const chains = chainsFromIds(chainIds);
  return useQuery({
    queryKey: ["account-map", services.mode, owner, chains.map((chain) => chain.chainId).join(",")],
    queryFn: () => loadAccountMap({ deps: services.deps, owner, chains, facts: services.facts, cockpit: services.mode === "cockpit" }),
    enabled: chains.length > 0,
  });
}

export function AccountMapPanel({ owner, chainIds }: { readonly owner: string; readonly chainIds: readonly number[] }) {
  const services = useWalletServices();
  const chains = chainsFromIds(chainIds);
  const query = useAccountMap(owner, chainIds);
  const now = useNow(10_000);

  if (chains.length === 0) return <EmptyTile title="No chains selected" heading="h3"><p>Choose at least one chain to list the account on.</p></EmptyTile>;
  if (query.isPending) return <p role="status">Checking each chain</p>;
  if (query.isError || query.data === undefined) return <ErrorTile code="UNKNOWN" title="The account map could not be built" message="Nothing was read. Try again." onRetry={() => void query.refetch()} heading="h3" />;
  const result = query.data;
  if (!result.ok) return <ErrorTile code="UNKNOWN" title="That address cannot own an account" message={result.message} heading="h3" />;
  const map = result.map;
  return (
    <div className="ui-stack" data-testid="account-map">
      <dl className="wl-facts">
        <div>
          <dt>Owner address (signs for everything below)</dt>
          <dd>
            <code data-testid="owner-address">{map.owner}</code>
          </dd>
          <dd data-testid="eoa-wording">{map.eoa.wording}{map.eoa.checkedOn === null ? "" : ` (code checked on ${map.eoa.checkedOn})`}</dd>
        </div>
        <div>
          <dt>Derived account (the same address on every chain)</dt>
          <dd>
            <code data-testid="derived-account">{map.account}</code>
          </dd>
          <dd>
            This is a derived address, computed from the owner without any key. It is an address map, not yet a usable multichain wallet: on every chain except XO it stays a counterfactual address until
            something deploys it.
          </dd>
        </div>
      </dl>
      <p data-testid="account-map-read" className="pf-note">
        Read from each chain's public RPC at <time dateTime={toIso(map.fetchedAtMs)}>{formatUtc(map.fetchedAtMs)}</time> ({formatAge(map.fetchedAtMs, now)}). Every chain is read on its own.
      </p>
      <p data-testid="polymarket-wallet-note">
        Polymarket wallet: this screen does not compute a Polymarket wallet address. The Portfolio asks Polymarket's own profile lookup for it, or you can save the wallet address you see on Polymarket yourself.
      </p>
      <DataTable caption="Derived account on each chain" columns={columns(map)} rows={map.rows} rowKey={(row) => row.chain.caip2} />
      {map.notes.map((note) => (
        <p key={note} className="pf-note">
          {note}
        </p>
      ))}
      {services.mode === "standalone" ? <NeedsCockpitTile venue="xo" what="whether XO has registered this account" heading="h3" /> : null}
      <CapabilityList facts={services.facts} />
    </div>
  );
}
