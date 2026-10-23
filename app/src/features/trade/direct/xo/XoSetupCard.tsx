import { Badge, Button, Disclosure } from "../../../../ui";
import { setupCardPasses, type XoSetupCard } from "./setup";

// The Signature Card for the account setup (the pattern of XoSignatureCard.tsx, for a user operation): what the
// operation does, every call decoded back from its call data (target, function, arguments; an unlimited approval said
// in words), the 32 bytes the wallet will be asked to sign as a message, and the checks this page ran on the packed
// operation with the relay's own code. "Sign in the wallet" stays off while any check fails. Every value is a
// fixed-format text node (an address, a number, a hex hash, or app words); no venue or wallet text appears here.

export interface XoSetupCardProps {
  readonly card: XoSetupCard;
  readonly onSign: () => void;
  readonly onDecline: () => void;
}

export function XoSetupCardView({ card, onSign, onDecline }: XoSetupCardProps) {
  const passes = setupCardPasses(card);
  return (
    <section className="signing-card" data-testid="xo-setup-card" data-action={card.action} aria-label="Signature card">
      <h3>Signature card: {card.title}</h3>
      <p>
        Your wallet will be asked to sign one 32-byte message (personal_sign). It is the hash of the user operation below; XO&apos;s chain runs the operation only with that signature. Check your wallet shows the same 32 bytes before you approve
        it there.
      </p>
      <dl className="signing-decoded" data-testid="xo-setup-rows">
        {card.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <code className="signing-code">{row.value}</code>
            </dd>
          </div>
        ))}
      </dl>
      <ol data-testid="xo-setup-calls">
        {card.calls.map((call, index) => (
          <li key={`${index}-${call.fn}`} data-unlimited={call.unlimited ? "true" : "false"}>
            <p>
              Call {index + 1}: <code className="signing-code">{call.fn}</code> on <code className="signing-code">{call.target}</code>
              {call.unlimited ? (
                <>
                  {" "}
                  <Badge tone="warn">unlimited</Badge>
                </>
              ) : null}
            </p>
            <dl className="signing-decoded">
              {call.args.map((arg) => (
                <div key={arg.label}>
                  <dt>{arg.label}</dt>
                  <dd>
                    <code className="signing-code">{arg.value}</code>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
      <dl className="signing-decoded" data-testid="xo-setup-wallet">
        <div>
          <dt>Wallet shows: the message, 32 bytes (the userOpHash)</dt>
          <dd>
            <code className="signing-code">{card.userOpHash}</code>
          </dd>
        </div>
        <div>
          <dt>The signature is over (EIP-191 of those bytes)</dt>
          <dd>
            <code className="signing-code">{card.eip191Digest}</code>
          </dd>
        </div>
      </dl>
      {card.notes.length === 0 ? null : (
        <ul data-testid="xo-setup-notes">
          {card.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      <Disclosure summary={`Checks: ${card.checks.filter((check) => check.pass).length} of ${card.checks.length} passed`} defaultOpen={!passes}>
        <ul className="signing-checks" data-testid="xo-setup-checks">
          {card.checks.map((check) => (
            <li key={check.label} data-pass={check.pass ? "true" : "false"}>
              <Badge tone={check.pass ? "ok" : "danger"}>{check.pass ? "pass" : "fail"}</Badge> {check.label}
            </li>
          ))}
        </ul>
      </Disclosure>
      <div className="ui-dialog-actions">
        <Button onClick={onDecline} data-action="decline">
          Do not sign
        </Button>
        <Button variant="primary" onClick={onSign} disabled={!passes} data-action="sign">
          Sign in the wallet
        </Button>
      </div>
      {passes ? null : <p data-testid="xo-setup-card-blocked">A check failed, so this card cannot be signed.</p>}
    </section>
  );
}
