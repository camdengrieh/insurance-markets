import { Badge, Button, Disclosure } from "../../../../ui";
import { cardPasses, type XoSigningCard } from "./signing";

// The Signature Card for a direct XO signature (the pattern of features/signing/SignatureCard.tsx, for a request this
// page built itself): the decoded fields the inner struct holds, what the wallet will display (the Kernel domain and
// one hash), and the checks this page ran by rebuilding both digests from the fields shown. "Sign in the wallet" stays
// off while any check fails. Every value is a fixed-format text node (an address, a decimal, a hex hash, or app words);
// no venue or creator text appears on the card.

export interface XoSignatureCardProps {
  readonly card: XoSigningCard;
  readonly onSign: () => void;
  readonly onDecline: () => void;
}

export function XoSignatureCard({ card, onSign, onDecline }: XoSignatureCardProps) {
  const passes = cardPasses(card);
  return (
    <section className="signing-card" data-testid="xo-signature-card" data-kind={card.kind} aria-label="Signature card">
      <h3>Signature card: {card.title}</h3>
      <p>
        Your wallet will be asked to sign one EIP-712 message on XO&apos;s chain {card.wallet.chainId}. Check it shows the same domain and hash as below before you approve it there.
      </p>
      <dl className="signing-decoded" data-testid="xo-card-rows">
        {card.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <code className="signing-code">{row.value}</code>
            </dd>
          </div>
        ))}
      </dl>
      <dl className="signing-decoded" data-testid="xo-card-wallet">
        <div>
          <dt>Wallet shows: domain</dt>
          <dd>
            <code className="signing-code">
              {card.wallet.domainName} {card.wallet.domainVersion}, chain {card.wallet.chainId}
            </code>
          </dd>
        </div>
        <div>
          <dt>Wallet shows: verifying contract (your XO account)</dt>
          <dd>
            <code className="signing-code">{card.wallet.verifyingContract}</code>
          </dd>
        </div>
        <div>
          <dt>Wallet shows: Kernel hash</dt>
          <dd>
            <code className="signing-code">{card.wallet.hash}</code>
          </dd>
        </div>
      </dl>
      <Disclosure summary={`Checks: ${card.checks.filter((check) => check.pass).length} of ${card.checks.length} passed`} defaultOpen={!passes}>
        <ul className="signing-checks" data-testid="xo-card-checks">
          {card.checks.map((check) => (
            <li key={check.label} data-pass={check.pass ? "true" : "false"}>
              <Badge tone={check.pass ? "ok" : "danger"}>{check.pass ? "pass" : "fail"}</Badge> {check.label}
            </li>
          ))}
        </ul>
        <p>
          Digest the wallet signs: <code className="signing-code">{card.wrappedDigest}</code>
        </p>
      </Disclosure>
      <div className="ui-dialog-actions">
        <Button onClick={onDecline} data-action="decline">
          Do not sign
        </Button>
        <Button variant="primary" onClick={onSign} disabled={!passes} data-action="sign">
          Sign in the wallet
        </Button>
      </div>
      {passes ? null : <p data-testid="xo-card-blocked">A check failed, so this card cannot be signed.</p>}
    </section>
  );
}
