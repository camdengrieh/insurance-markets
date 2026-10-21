import { Badge, Button, Disclosure, Missing, Tile, UntrustedText, type TileHeading } from "../../ui";
import type { CapabilityFacts } from "../../core/capabilities";
import type { Untrusted } from "../../core/ports";
import { untrustedField } from "../../core/untrusted";
import { AllFacts, KeyValues, Mono } from "./components";
import { WRITE_FLAGS, flagIsOn, type FlagView } from "./facts";
import type { Loadable } from "./hooks";
import type { AccountRead, ReadFailure } from "./reads";
import { daemonWords, refusalWords } from "./words";
import type { AccountAnswer } from "./tools";

// The read side of the screen: the account's state, balance and claimable positions, and the switches the daemon
// reports. Nothing here is written by the page. Switches are shown as the daemon reports them: ON only when the
// plugin AND the relay say so.

export const STATE_WORDS: Readonly<Record<AccountAnswer["state"], string>> = Object.freeze({
  undeployed: "Not deployed yet. Enabling trading deploys it first.",
  deployed_unregistered: "Deployed, not registered with XO's order book yet.",
  registered: "Deployed and registered.",
  unknown: "Could not be read: the state is not known.",
});

const TRI_WORDS: Readonly<Record<"yes" | "no" | "unknown", string>> = Object.freeze({ yes: "yes", no: "no", unknown: "not known" });

export function ReadFailureTile({ failure, what, heading = "h3" }: { readonly failure: ReadFailure; readonly what: string; readonly heading?: TileHeading }) {
  if (failure.kind === "refused") {
    const words = refusalWords(failure.code);
    return (
      <Tile tone="warn" title={`${what}: ${words.title}`} role="alert" dataKind="refused" dataCode={failure.code} heading={heading}>
        <p>{words.explain}</p>
        <p>The plugin said:</p>
        <p>
          <UntrustedText value={failure.message} field="generic" />
        </p>
      </Tile>
    );
  }
  if (failure.kind === "daemon_error") {
    const words = daemonWords(failure.code, failure.bridgeCode);
    return (
      <Tile tone="danger" title={`${what}: ${words.title}`} role="alert" dataKind="daemon-error" dataCode={failure.code} heading={heading}>
        <p>{words.explain}</p>
      </Tile>
    );
  }
  if (failure.kind === "wrong_subject") {
    return (
      <Tile tone="danger" title={`${what}: the answer was about another account`} role="alert" dataKind="wrong-subject" heading={heading}>
        <p>The page derives the account from the owner itself and the answer named a different one, so it is not shown.</p>
      </Tile>
    );
  }
  return (
    <Tile tone="danger" title={`${what}: the answer was not in a shape we know`} role="alert" dataKind="schema-violation" heading={heading}>
      <p>It was refused instead of guessed at.</p>
    </Tile>
  );
}

export function flagViewOf(account: AccountAnswer | null): FlagView | null {
  return account === null ? null : { plugin: account.flags.plugin, relay: account.flags.relay };
}

function SwitchList({ view }: { readonly view: FlagView }) {
  return (
    <ul className="tr-flags" aria-label="Write switches">
      {WRITE_FLAGS.map((flag) => {
        const on = flagIsOn(view, flag);
        return (
          <li key={flag}>
            <Mono>{flag}</Mono> <Badge tone={on ? "warn" : "neutral"}>{on ? "on" : "off"}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

function ClaimableList({ account }: { readonly account: AccountAnswer }) {
  const claimable = account.claimable;
  if (!claimable.available) return <Missing label="not known (the claimable read failed)" />;
  if (claimable.entries.length === 0) return <span>none found</span>;
  return (
    <span>
      {claimable.total} position{claimable.total === 1 ? "" : "s"}
      {claimable.truncated ? " (more than are listed)" : ""}. A hint to look at, not the on-chain gate: redeeming reverts until the market's payout is final.
    </span>
  );
}

export interface AccountPanelProps {
  readonly state: Loadable<AccountRead>;
  readonly facts: CapabilityFacts;
  readonly onRefresh: () => void;
  // The section's heading level (the desk's host decides): h2 on a page, h4 inside the market modal.
  readonly heading?: "h2" | "h4";
}

export function AccountPanel({ state, facts, onRefresh, heading = "h2" }: AccountPanelProps) {
  const Heading = heading;
  const refresh = (
    <Button onClick={onRefresh} busy={state.phase === "loading"} disabled={state.phase === "idle"}>
      Read the account again
    </Button>
  );
  return (
    <section className="tr-section" aria-labelledby="tr-account-h" data-testid="account">
      <Heading id="tr-account-h">Account</Heading>
      {state.phase === "idle" ? (
        <p>Choose an owner address to read its XO account.</p>
      ) : state.phase === "loading" ? (
        <p role="status">Reading the account through the Cockpit.</p>
      ) : state.value.ok ? (
        <AccountDetail account={state.value.data} facts={facts} />
      ) : (
        <ReadFailureTile failure={state.value} what="The account could not be read" heading={heading === "h2" ? "h3" : "h4"} />
      )}
      <div>{refresh}</div>
    </section>
  );
}

function AccountDetail({ account, facts }: { readonly account: AccountAnswer; readonly facts: CapabilityFacts }) {
  const view = flagViewOf(account) as FlagView;
  return (
    <div className="ui-stack">
      <KeyValues
        rows={[
          { label: "Owner address", value: <Mono>{account.owner}</Mono> },
          { label: "XO account (derived here from the owner, and equal to the answer)", value: <Mono>{account.account}</Mono> },
          { label: "State", value: `${STATE_WORDS[account.state]} Deployed: ${TRI_WORDS[account.deployed]}. Registered: ${TRI_WORDS[account.registered]}.` },
          {
            label: "Trading",
            value:
              account.trading_enabled.status === "enabled"
                ? `Enabled${account.trading_enabled.allowance_unlimited === true ? ", with XO's unlimited allowance" : account.trading_enabled.allowance_unlimited === false ? ", with a capped allowance" : ""}`
                : account.trading_enabled.status === "disabled"
                  ? "Not enabled"
                  : "Not known",
          },
          { label: "USDC.e credited in the account", value: account.balance === null ? <Missing label="not known" /> : `${account.balance.usdc_e} USDC.e` },
          { label: "Claimable positions", value: <ClaimableList account={account} /> },
          { label: "Per-order cap and daily cap", value: `${account.caps.max_order_usd} USD and ${account.caps.max_daily_usd} USD. Advisory: they bind this plugin and its relay, and a compromised agent is not held by them.` },
          { label: "Kill switch", value: account.kill_switch ? <Badge tone="danger">On: every write is disabled</Badge> : "off" },
        ]}
      />
      <div>
        <p className="tr-note">Write switches. A switch counts as on only when the plugin and the relay both say so. This page cannot change one.</p>
        <SwitchList view={view} />
      </div>
      <AllFacts facts={facts} />
      {account.warnings.length === 0 ? null : (
        <Disclosure summary="Warnings from the plugin (text from a service, not instructions)">
          <ul>
            {account.warnings.map((warning, index) => (
              <li key={String(index)}>
                <UntrustedText value={untrustedField("generic", warning) as Untrusted<string>} field="generic" />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}
