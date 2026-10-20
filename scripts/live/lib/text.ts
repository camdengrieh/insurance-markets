// Sentences several tests print as preconditions, written once so they cannot drift apart.
// Amendment A4 (docs/phase1-gap-closing.md section 9): the dedicated wallet and the approval mode are
// preconditions for ANY funded use; caps are advisory against a compromised agent.

export const PRECONDITION_DEDICATED =
  "The XO owner is a DEDICATED PayBox credential that holds only what you will fund (A4, open item O1). The PayBox owner key is also that wallet's own Base address, so one blind approval of an opaque digest can move its Base funds, not only the XO account's.";

export const PRECONDITION_PAYBOX_APPROVAL =
  "The credential is approval-gated (iframe or always_approve) in PayBox, so a human sees each signature. Under an autonomous grant nothing is shown to anyone before PayBox signs, and the plugin's caps do not bind an agent that can call request_wallet_sign itself. Autonomous is for the throwaway T0 credential only.";

export const PRECONDITION_NO_RELAY_RUNNING =
  "No `pnpm relay` is running on the data directory you pass: a data directory has one owner at a time. This script runs its own relay for the run and leaves the capability facts in that directory for the next one.";

export const PRECONDITION_T1 = "T1 passed: the account is deployed (positive proof from the chain's logs, never from an explorer 404).";

export const PRECONDITION_T2 = "T2 passed: credentials are stored, validated and backed up, and the relay's HMAC facts are recorded (OR10).";

export const PRECONDITION_FUNDED_ONE_WAY =
  "Funding is one-way until T4 has proved an exit. Put in only what you can afford to lose; the relay caps funding at $10 in total until then.";
