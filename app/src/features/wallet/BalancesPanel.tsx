import { useQueries, useQuery } from "@tanstack/react-query";

import { USDC_E_ADDRESS } from "@shared/xo/chain/constants";

import { Badge, DataTable, ErrorTile, Tile, UntrustedText, type Column } from "../../ui";
import { chainsFromIds } from "./chain-settings";
import { readChainBalances, readExplorerBalances, atomicText, type BalanceRow, type ChainBalancesState, type ExplorerBalances } from "./balances";
import { useWalletServices } from "./services";

// Balances per chain (docs/dapp-design.md 4.5 Wallet): the owner and its derived account, from the chain's public
// RPC (one Multicall3 read) and, on XO 3223, from the XO explorer. Nothing is summed across chains or assets, an
// unreadable balance prints "not read" (never 0), and a chain this build cannot reach says so.

const SHAPE = "synthetic-shape tested";

function rowColumns(): readonly Column<BalanceRow>[] {
  return [
    { key: "holder", header: "Holder", rowHeader: true, render: (row) => (row.holder === "owner" ? "Owner address" : "Derived account") },
    { key: "asset", header: "Asset", render: (row) => (row.untrustedSymbol === null ? row.symbol : <UntrustedText value={row.untrustedSymbol} field="generic" />) },
    { key: "amount", header: "Amount", align: "end", render: (row) => (row.text === null ? null : `${row.text} ${row.untrustedSymbol === null ? row.symbol : ""}`.trim()) },
    { key: "source", header: "Read from", render: (row) => (row.source === "explorer" ? "XO explorer" : row.source === "rpc_multicall" ? "public RPC (multicall)" : "public RPC") },
  ];
}

function ChainBalances({ name, state }: { readonly name: string; readonly state: ChainBalancesState | undefined }) {
  if (state === undefined) return <p role="status">Reading {name}</p>;
  if (state.state === "no_rpc") {
    return (
      <Tile tone="info" title={`${name}: balances not read`} heading="h4" dataKind="no-rpc">
        <p>This build has no public RPC for this chain, so nothing was asked. That is not an empty wallet.</p>
      </Tile>
    );
  }
  if (state.state === "failed" && state.failure.unauthorized) {
    return (
      <Tile tone="warn" title={`${name}: this page is not paired with your Cockpit`} heading="h4" dataKind="not-paired">
        <p>Nothing was read. Open the pairing link your Cockpit printed when it started, then reload.</p>
      </Tile>
    );
  }
  if (state.state === "failed") return <ErrorTile code={state.failure.code === "UNKNOWN" ? undefined : state.failure.code} title={`${name}: the chain did not answer`} heading="h4" />;
  return (
    <DataTable
      caption={`${name} balances`}
      captionHidden
      columns={rowColumns()}
      rows={state.rows}
      rowKey={(row) => `${row.holder}:${row.symbol}`}
    />
  );
}

function ExplorerBlock({ account, data }: { readonly account: string; readonly data: ExplorerBalances | "failed" | undefined }) {
  if (data === undefined) return <p role="status">Reading the XO explorer</p>;
  if (data === "failed") return <ErrorTile code="TIMEOUT" title="The XO explorer did not answer" heading="h4" />;
  return (
    <div className="ui-stack" data-testid="explorer-balances">
      <p>
        <Badge tone="warn">{SHAPE}</Badge> XO explorer view of <code>{account}</code>. An address the explorer has never seen is not listed: that is not a zero balance.
      </p>
      <ul>
        <li>
          Native coin: {data.native === null ? "not listed" : atomicText(data.native, 18)}
        </li>
        {data.tokens.map((token, index) => (
          <li key={`${token.address ?? "none"}:${index}`}>
            <UntrustedText value={token.symbol} field="generic" />: {token.decimals === null ? "decimals not given" : atomicText(token.raw, token.decimals)}
            {token.address === null ? null : (
              <>
                {" "}
                <code>{token.address}</code>
              </>
            )}
          </li>
        ))}
      </ul>
      {data.skipped > 0 ? <p>{data.skipped} token rows were not understood and are not shown.</p> : null}
    </div>
  );
}

// The RPC and the explorer should agree on USDC.e. If they do not, both are shown and the disagreement is said.
export function usdceDisagreement(state: ChainBalancesState | undefined, explorer: ExplorerBalances | "failed" | undefined): string | null {
  if (state === undefined || state.state !== "ok" || explorer === undefined || explorer === "failed") return null;
  const rpc = state.rows.find((row) => row.holder === "account" && row.symbol === "USDC.e")?.raw ?? null;
  const listed = explorer.tokens.find((token) => token.address?.toLowerCase() === USDC_E_ADDRESS.toLowerCase());
  if (rpc === null || listed === undefined) return null;
  return rpc === listed.raw ? null : "The RPC and the XO explorer disagree about the USDC.e balance of the account. Neither is assumed right.";
}

export function BalancesPanel({ owner, account, chainIds }: { readonly owner: string; readonly account: string; readonly chainIds: readonly number[] }) {
  const services = useWalletServices();
  const chains = chainsFromIds(chainIds);
  const chainQueries = useQueries({
    queries: chains.map((chain) => ({
      queryKey: ["balances", services.mode, chain.chainId, owner, account],
      queryFn: () => readChainBalances(services.deps, chain, { owner, account }),
    })),
  });
  const xo = chains.find((chain) => chain.isXo);
  const explorer = useQuery({
    queryKey: ["explorer", services.mode, account],
    enabled: xo !== undefined,
    queryFn: async (): Promise<ExplorerBalances | "failed"> => {
      try {
        return await readExplorerBalances(services.deps, account);
      } catch {
        return "failed";
      }
    },
  });

  return (
    <div className="ui-stack" data-testid="balances">
      <p>Each chain is read on its own. Balances are not added together: different chains and assets are different things.</p>
      {chains.map((chain, index) => {
        const state = chainQueries[index]?.data;
        const mismatch = chain.isXo ? usdceDisagreement(state, explorer.data) : null;
        return (
          <section key={chain.caip2} className="wl-chain" aria-label={`${chain.name} chain`} data-chain={chain.caip2}>
            <h3>{chain.name}</h3>
            <ChainBalances name={chain.name} state={state} />
            {chain.isXo ? <ExplorerBlock account={account} data={explorer.data} /> : null}
            {mismatch === null ? null : (
              <p role="alert" data-testid="usdce-mismatch">
                {mismatch}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
