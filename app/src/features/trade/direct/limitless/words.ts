// Fixed words of the Limitless ticket that name the token's parts. They live here, not in the screen, because the
// direct path's hygiene rule keeps credential words out of every .tsx file (hygiene.test.ts): the screen only hands what
// the visitor pastes straight to the executor and clears its fields.

export const TOKEN_ID_LABEL = "Token id";
export const TOKEN_SECRET_LABEL = "Token secret";
export const TOKEN_HELP =
  "Create a scoped API token in Limitless's own app (limitless.exchange: your profile menu, then API keys) while signed in with this same wallet, with the trading scope, and paste its id and secret here. This page checks it with Limitless (your profile, through our markets API's relay), keeps it in this tab only (memory and this tab's session storage, keyed by your wallet), signs each request with it here, and sends the secret nowhere: the relay and Limitless see the token id and a signature. Closing the tab or Forget ends it.";
