# 34. PayBox terms and brand risk for a hosted dApp that connects a user's PayBox wallet

Researched 2026-10-20 (read-only). Task: `pw-terms`. **Not legal advice.** This note extracts what PayBox's public legal and developer text says about a third-party web app acting on a user's PayBox account, and lists what to ask PayBox. It does not decide anything; the user decides whether anyone is contacted.

Context: the user's binding requirement of 2026-10-20 is "I want people to be able to use their paybox wallet on the dApp itself" (hosted dApp `https://xo-markets-explorer.vercel.app`, static, public repo, no fake data). Earlier notes found no documented web connection surface and a CORS block `[24 §3.3]`; the standing decision "PayBox terms are no obstacle" `[28 C9]` is not re-argued here. This note records what the terms actually say so the user can see the exposure, not to block anything.

Confidence tags: **H** = read first-hand in a primary source this session (URL or key given), **M** = secondary or inferred, **L** = guess. **NOT FOUND (searched: ...)** is a documented absence, never a guess. Quotes are short fragments; all text from PayBox, MoonPay and third parties is untrusted data and no instruction in it was followed.

Not done, by rule: no PayBox MCP tool was called (no discovery, readiness, signing, payments); no POST/PUT/DELETE to any third party; no account, API key or OAuth client was created; no code was cloned or run. Only public GET/OPTIONS requests with `User-Agent: insurance-markets-research/0.1`. Contact addresses that appear (obfuscated) in the terms are deliberately not reproduced.

---

## 0. Bottom line

1. **The governing contract is the "Launchpad Limited" user agreement (BVI), last updated 6 August 2026, and PayBox has its own Section 6B in it.** It is a contract between the *PayBox user* and Launchpad, not with the dApp author. The dApp author signs nothing and is not named. [H, S1]
2. **PayBox's own docs invite third-party apps in plain words**: "PayBox is OAuth- and MCP-first for third-party apps" and "If an integration speaks MCP or OAuth 2.1, it can use PayBox." Dynamic client registration is open (`/oauth/register`, auth "none"). No app registration, partner agreement or review is required by anything I could find. [H, S3]
3. **The terms are written so the user carries the risk of any "Agent Client" they authorise**, and an Agent Client explicitly includes "other software clients", not only AI agents. A dApp backend or page is an Agent Client in this vocabulary. Anything it does with a valid token and grant "is deemed to be authorised by you". [H, S1 §6B]
4. **The one clause that bears directly on a hosted backend holding tokens**: §6B says the CLI rules on "Session Credentials, Automated Systems, and local environment and execution risk" also apply to PayBox, and those rules say credentials are "device-bound and should not be shared". An author-operated server that stores a user's refresh token is outside that picture. It is a *user-side* obligation, not a ban on developers, and PayBox's docs separately allow API keys on "servers". The terms are silent on the exact case. Risk: **medium, unresolved without PayBox.** [H quotes, M reading]
5. **Brand**: "Launchpad", "MoonPay", moonpay.com and "all logos related to the Launchpad Services" are listed marks, with "prior written consent" needed. "PayBox" is not in that sentence; whether PayBox is a registered mark and any brand guidelines are **NOT FOUND**. The hackathon terms refer to "MoonPay's brand guidelines" but no URL exists. Safest working rule: plain-text nominative use ("connect your PayBox wallet") is low risk; PayBox/MoonPay logos, "powered by", "official", "partner" claims and `?app=<slug>` partner routing are not covered by anything public. [H quotes, M reading]
6. **Rate limits**: no numeric API/MCP limit is published (**NOT FOUND**). The user agreement reserves the right to "implement rate limits, safety checks, transaction caps, geographic restrictions, or temporary holds" (written about the CLI) and to refuse to sign. A shared Vercel egress serving many users is a new traffic shape that PayBox has not documented a position on. [H]
7. **Embedding**: nothing in the terms or docs says a third-party page may embed PayBox UI. Measured today: `app.paybox.sh` sends `content-security-policy: ... frame-ancestors 'self'`, so the PayBox app cannot be framed by the dApp. [H, measured]
8. **Custody and money-transmission language works in the dApp's favour**: PayBox says it "is not a custodian, money transmitter, payment processor, broker, exchange, or merchant of record". A dApp that never holds keys or funds can truthfully say the same, and should not use language that implies it does. [H quote, M reading]
9. **There is no PayBox rule I found that prohibits a prediction-market dApp as such**, but PayBox reserves discretion to "decline to produce a signature" for "reputational risk", and its prediction-market geo-list is attached to *MoonPay CLI and Dawn CLI*, not stated for PayBox (whether it applies is NOT FOUND). Expect signing refusals to be possible and unpredictable. [H quote, M reading]

---

## 1. Sources read (all retrieved 2026-10-20)

| Key | URL | What it is | Version / date shown |
|---|---|---|---|
| S1 | https://www.moonpay.com/legal/terms_of_use_bvi_launchpad | "Launchpad Terms of Use" (user agreement); the "Terms & Conditions" link in the paybox.sh footer. Includes §6B Paybox | "Last updated: 6 August 2026" |
| S2 | https://www.moonpay.com/en-gb/legal/privacy_policy_launchpad | Launchpad privacy notice; the "Privacy Policy" link in the paybox.sh footer. Lists Paybox in scope | "EFFECTIVE DATE: July 9, 2026" |
| S3 | https://docs.paybox.sh/llms-full.txt (whole doc set: getting-started, concepts, connect/mcp, connect/oauth, reference/mcp-tools, api-reference, sdk-cli) | Public developer docs | no date shown |
| S4 | https://developer.paybox.sh/terms | "MoonPay Hackathons Terms and Conditions" (sponsor Launchpad Limited). Applies to hackathon submissions only | no date shown |
| S5 | https://developer.paybox.sh/requirements.md and https://developer.paybox.sh/llms.txt | Hosted-plugin authoring guide; hackathon landing text | Chapter 1: 16-17 Oct 2026 |
| S6 | https://support.moonpay.com/en/articles/669843-paybox-faqs , .../669841-how-agent-connections-work-in-paybox , .../669779-paybox-store-credentials-once-let-ai-agents-pay-securely | MoonPay Help Center PayBox collection | "September 17, 2026" |
| S7 | https://paybox.sh/ , /llms-full.txt , /index.md , /robots.txt , /sitemap.xml | Marketing site. Footer: "Privacy Policy", "Terms & Conditions" (both go to the MoonPay URLs above), "© 2026 MoonPay Inc" | live |
| S8 | https://www.moonpay.com/legal (index) | Lists "Launchpad Terms of Use" among MoonPay legal documents; no PayBox-specific, API or developer terms listed | live |
| S9 | npm `@paybox-sh/sdk@2.2.0` and `@paybox-sh/connect-react@0.1.1` (registry JSON, README, LICENSE via unpkg) | Official client packages, both Apache-2.0 | 2026-10-14 and 2026-09-17 |
| S10 | Live probes of `api.paybox.sh` and `app.paybox.sh` (section 5) | CORS and framing headers | 2026-10-20 |
| P-notes | `docs/research/06-paybox-platform.md`, `24-dapp-paybox-tie-in.md`, `28-dapp-architecture-mvp.md` | Prior repo research | 2026-10-19 |

Pages that returned 404 (so NOT FOUND as separate documents): `paybox.sh/terms`, `/privacy`, `/terms-of-service`, `www.paybox.sh/terms`, `app.paybox.sh/terms`, `api.paybox.sh/terms`, `api.paybox.sh/.well-known/security.txt`, `moonpay.com/legal/brand_guidelines`, `moonpay.com/legal/terms_of_use_bvi`. [H]

---

## 2. What the text says, by topic

### 2.1 Who is bound, and by what

- Agreement is "between you and Launchpad Limited", a BVI company, and "The services provided by Launchpad are unregulated." Governing law BVI; disputes go to binding confidential arbitration (§22-§23). [H, S1]
- Scope sentence names PayBox: "The ability to store credentials and other sensitive materials with, and to grant AI agents and other automated clients scoped access to those materials through, Paybox." [H, S1 §1]
- "You may not use any of the Services on behalf of a business entity." and "you will use the Services only for yourself, and not on behalf of any third party." [H, S1 §1, §4]. Reading (M): these bind the PayBox *user*; they matter because the dApp must act for exactly one user at a time and never pool, share or resell a user's grant. They are also why a company-run PayBox account for the dApp itself would be a problem.
- The Help Center says PayBox is "a standalone product with its own account and onboarding" and "available globally" (FAQ) / "available in most countries" (FAQ, same page, both). [H, S6]

### 2.2 Third-party applications acting on a user's account (OAuth, SDK, API keys)

- §6B definition: PayBox lets you "grant AI agents and other software clients (each, an 'Agent Client') scoped access". "You may create Agent Clients and configure the scope, limits, and permissions applicable to each (each, a 'Grant')." [H, S1 §6B]
- "Any operation, request, or instruction submitted by an Agent Client using valid credentials and an applicable Grant is deemed to be authorised by you, whether or not you reviewed it." [H, S1 §6B]
- "Launchpad does not control, monitor, or assess the intent, logic, frequency, or correctness of any Agent Client". "You bear all risk arising from the actions of any Agent Client you create, configure, or permit to operate." [H, S1 §6B]
- Docs: "PayBox is OAuth- and MCP-first for third-party apps". "If an integration speaks MCP or OAuth 2.1, it can use PayBox." "Third-party apps and MCP clients connect with standard authorization-code + PKCE; after the user consents, your app holds a scoped access token". [H, S3 intro and connect/oauth]
- Dynamic registration: `POST /oauth/register`, "Dynamic client registration (RFC 7591)", auth "none". "PayBox supports public clients only". `redirect_uris` must be HTTPS (or `http://localhost`). [H, S3]
- API keys: "A personal `pbx_live_*` API key ... works as the same bearer ... Keys suit headless use (CI, servers)". [H, S3 api-reference]
- Not allowed surface: the first-party app uses internal `/api/*` routes that "are not part of the developer surface and are not documented here - an integration never calls them." [H, S3]. The CORS preflight also advertises first-party `x-moonx-*` headers; those are not a public contract (see 5).
- The licence to the "Interface" (which the agreement defines to include "websites, APIs, mobile applications, or MoonPay CLI") is "limited, non-exclusive, non-transferable ... solely for approved purposes as permitted by us from time to time. Any other use of the Interface or Content is expressly prohibited". [H, S1 §1, §22]. Reading (M): the documented OAuth/MCP surface is the approved purpose; undocumented routes and first-party headers are not.
- Privacy notice expects third-party apps: scope covers services "made available through MoonPay Group interfaces, developer integrations, or third party applications", and "Software Services" are "Software, APIs, SDKs, iframes, portals, and connectivity tools that allow you or your applications to access, configure, or connect supported wallets, credentials". It discloses data to "Developer, customer-application, and integration partners, where you use the Services through an integrated application, authorize a connection". [H, S2]. "Customer application" is used but **not defined** anywhere I found.

### 2.3 Programmatic and automated access

- The CLI section (applied to PayBox by §6B) says automation is allowed: "You may use Automated Systems to submit instructions ... provided such use complies with all applicable terms and policies." And: "YOU ARE SOLELY RESPONSIBLE FOR ALL ACTIONS INITIATED BY ANY AUTOMATED SYSTEM YOU CONFIGURE, DEPLOY, OR PERMIT TO OPERATE". [H, S1 §6 and §6B]
- "You must design your Automated Systems to handle failures, rejected requests, and partial responses safely." [H, S1 §6]
- `you will not use an anonymizing proxy, or any other automatic devices, spider or manual processes to copy or monitor our websites without our prior written permission` (§14 warranties). [H, S1 §14]. Reading (M, low): about copying or monitoring *websites*; a request-forwarding proxy for the documented OAuth/MCP API is not that, but a proxy is the nearest textual hook, so mention it when asking.
- No terms specific to scraping or bulk reading of the MCP tools. NOT FOUND.

### 2.4 Storing user tokens on a server

- §6B: "The provisions of Section 6 relating to Session Credentials, Automated Systems, and local environment and execution risk apply to your use of Paybox and Agent Clients." [H, S1 §6B]
- Section 6 on Session Credentials: they may be stored "locally on your device"; "Session Credentials are device-bound and should not be shared."; "Any person with access to the device or environment in which the Session Credentials are stored may be able to perform actions associated with your MoonPay Verified Account."; "Launchpad may invalidate Session Credentials at any time." [H, S1 §6]
- Section 19: "You must keep all security details ... private and not share such details with any third party." [H, S1 §19] (about account security details such as passwords; whether an OAuth refresh token counts is not stated).
- Docs treat the token as a bearer the *app* holds: "your app holds a scoped access token". Refresh tokens are "30 days, sliding" and "Rotated on every use"; "Replaying a rotated token revokes the client." Authority is "exactly the grant set the user approved". [H, S3]
- PayBox states no rule on who may host a token, no data-residency or logging rule for third-party backends, and no developer data-processing terms. NOT FOUND (searched S1-S8, S3).
- Reading (M): nothing forbids a hosted backend, the docs invite "servers", but the user agreement's picture is a token on the user's device. The user, not the dApp author, is the party in breach of "should not be shared" if a breach exists, and the author's exposure is reputational and account-level (client revocation), not contractual, unless PayBox has a developer agreement not published. That is exactly the question to ask.

### 2.5 Consent and revocation

- Consent screen is PayBox-hosted: "The consent screen the user sees is served from the app origin (https://app.paybox.sh)". User picks credentials and approval mode per credential. [H, S3]
- "Revoking the client (from the app's Clients screen) immediately kills its access tokens and refresh chain." Kill switch "suspends all Agent Client access". "You must promptly revoke access, use the kill switch, and notify us if you believe your Paybox account, any Agent Client, or any credential has been compromised." [H, S3, S1 §6B, S6]
- "Approvals are bound to the specific operation submitted; if an Agent Client changes that operation, a new approval is required." [H, S1 §6B]
- "Sensitive operations still pause for the user's passkey regardless of the app's token." [H, S3]
- What the consent screen shows for a self-registered client (`client_name`, redirect URI, any warning for unverified clients): **NOT FOUND** in the docs; needs a live look (section 6).

### 2.6 Liability, indemnity, disputes

- "Neither Launchpad ... shall be liable for any loss or damage sustained by you as a direct or indirect result of the provision by Launchpad of its Services" (with fraud and personal-injury carve-outs), including loss of Cryptocurrency, "even if caused by Launchpad's negligence". [H, S1 §13]
- User indemnity covers "any third party websites or resources found through the services". [H, S1 §13]
- Cryptocurrency transactions "are irreversible"; "Launchpad will not issue refunds". [H, S1 §7]
- "Launchpad does not execute trades, place orders, manage positions, or otherwise act on your behalf in any capacity." [H, S1 §3] and "Launchpad does not provide trading or investment or brokerage accounts". [H, S1 §3]
- Practical effect for a dApp (M): if a prepared order is wrong, mis-displayed or replayed, PayBox's text puts the loss on the user, and nothing here shields the dApp author from the user or from a venue. The dApp needs its own plain disclaimer and must not describe PayBox approvals as protection against dApp bugs.

### 2.7 Prohibited and restricted uses (custody, money transmission, sanctions, geography)

- Not a custodian: "Paybox is a control plane for credentials only. Paybox is not a custodian, money transmitter, payment processor, broker, exchange, or merchant of record, and does not hold, transmit, or move money or digital assets on your behalf." Wallets "are non-custodial". [H, S1 §6B]
- Screening and refusal: Launchpad "may screen wallets, destination addresses, recipients, and counterparties" and "may in its sole discretion and without notice decline to produce a signature ... reject or discard an operation, or restrict or close your Paybox account, including to manage sanctions, financial crime, or reputational risk." [H, S1 §6B]
- "You must not use Paybox in, or for the benefit of, any Sanctioned Country or Sanctioned Person ... or in connection with any activity prohibited by Launchpad or its providers." [H, S1 §6B] "Activity prohibited by Launchpad or its providers" is undefined here (NOT FOUND where the list lives).
- Prediction-market geography: §6A bars MoonPay CLI and Dawn CLI users in a long list of countries, including the United States and United Kingdom, and says it covers "Polymarket Inc. ... and any other third-party prediction market platform". It is scoped by its text to "Dawn CLI or MoonPay CLI". Whether it extends to PayBox signing: **NOT FOUND**. [H quote, scope reading M]
- No general "prohibited uses" list for PayBox exists as a separate document. NOT FOUND (searched S1, S3, S6, S8).
- The agreement itself says the services "are unregulated" and the "safeguards and protections that apply to regulated crypto services provided by the MoonPay group do not apply". [H, S1 §1, §16]

### 2.8 Rate limits and quotas

- Docs: no numeric limit, no `429` handling, no rate-limit headers on the probed endpoints. NOT FOUND (searched S3 for "rate", "429"; probed headers in section 5 show none).
- Terms: Launchpad may "implement rate limits, safety checks, transaction caps, geographic restrictions, or temporary holds" and "reject, delay, or suspend CLI requests"; "Such modifications or controls may affect Automated Systems and Launchpad is not responsible". Written for the CLI, applied to PayBox automation by §6B. [H, S1 §6]
- Only numbers found are for the *plugin* runtime: "a per-user allowance of one start per second and 1,000 starts per rolling 24 hours" and transaction validation "one active validation and 30 per hour". These govern hosted Open Plugins, not the OAuth/MCP surface. [H, S5]
- Approval and token timing that do act as limits: approvals expire in about 10 minutes (`[24 §4]`, from S3); access token 60 min.

### 2.9 Is a partner or app registration required?

- OAuth clients: no. Registration is dynamic and unauthenticated by design. [H, S3]
- A "partner" tier exists in code: `@paybox-sh/connect-react` says "`partnerSlug` must be your enabled PayBox partner slug" producing `https://api.paybox.sh/mcp?app=your-partner-slug`, and "A slug is routing, not authorization." [H, S9]. How to become an enabled partner, what it unlocks, and any partner agreement: **NOT FOUND** (searched S3, S5, S6, S9 and web). The component only shows Claude and ChatGPT setup help; it "never authenticates, requests wallet permissions, or reports a successful connection", so it is not a wallet connection.
- Marketplace plugin route (hackathon): separate, and closed to this project (`[06 §2]`, user decision: upload not available).
- The MoonPay Help Center has a "B2B Partner Support" collection in its navigation (a MoonPay widget/ramp programme). Whether it covers PayBox is NOT FOUND. [M, S6 page nav]

### 2.10 Brand and trademark

- User agreement §22: `"Launchpad", "MoonPay", moonpay.com and all logos related to the Launchpad Services or displayed on the Interface are trademarks or registered marks of Launchpad or its licensors. You may not copy, imitate or use them without our prior written consent`. [H, S1 §22]
- Hackathon terms: "Participants acquire no rights in or to any Launchpad, MoonPay, or MoonPay Group member trademarks, service marks, logos, or trade names, except as expressly permitted in MoonPay's brand guidelines or with prior written consent." [H, S4]. These bind hackathon participants only.
- "PayBox" word mark ownership/registration and any logo licence: **NOT FOUND** (searched S1, S4, S7; MoonPay site 404 for `/legal/brand_guidelines`; web search for MoonPay brand guidelines returned no official page).
- The packages: both Apache-2.0; §6 says the licence "does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor, except as required for reasonable and customary use in describing the origin of the Work". [H, S9]. So using the SDK's code does not license the PayBox name or logo beyond describing origin.
- The marketing site serves its own logo files (for example `/logos/app-icon.svg`); no licence is attached. [H, S7]
- `connect-react` lets a partner restyle a "Connect with Claude or ChatGPT" button and put `partnerName` in the heading; it says nothing on whether the PayBox name or marks may be used without being a partner. [H, S9]
- Nominative use ("Connect your PayBox wallet") is the normal way to name a product you integrate with; the terms do not address it either way (M, general practice, not a reading of these terms).

### 2.11 Web embedding

- No statement in the terms or docs about embedding PayBox UI, signing windows or consent screens in a third-party page. NOT FOUND.
- The signing window is an MCP Apps resource, `ui://paybox/wallet-sign`, rendered "in the chat" by an MCP host (S3). Whether a third-party web host may render it: NOT FOUND (`[24 §4]` records MCP Apps needs a sandbox proxy origin).
- Measured: `app.paybox.sh` `content-security-policy` contains `frame-ancestors 'self'` and its `frame-src` allows `https://api.paybox.sh` and MoonX/MoonPay iframe hosts. [H, S10]. So the PayBox app cannot be iframed by the dApp; the dApp can only link out to it (consent, approval) or run a popup/redirect.
- The SDK documents `X-Paybox-Signing-Surface: in-process | browser | none`, "advisory", and that it "does not grant signing access". [H, S9]

### 2.12 Hackathon terms (not applicable to the dApp, but they show PayBox's view of abuse)

- Apply only to "Submissions" to a Chapter. The dApp is not one. Binding detail: Chapter 1 closed 17 Oct 2026 (`[06]`).
- Show intent: submissions must not contain "code that exploits, exfiltrates, or misuses user credentials, wallet keys, or secrets stored in any or used with any MoonPay Product", and must comply with "the applicable Featured Product developer terms, API terms". No separate "developer terms" or "API terms" document is published at any URL I found. NOT FOUND. [H, S4]
- Listing/removal: MoonPay members may "decline, delay, condition, suspend, remove, or delist any Submission ... at any time, for any reason or for no reason". Relevant only as a signal of discretion over anything in their marketplace; a standalone OAuth client is not in the marketplace. [H, S4]

### 2.13 Privacy position of a dApp that receives PayBox data

- PayBox's notice "does not apply to personal data processed by third-party services you may access through, or connect to, our Services, including third-party customer applications, AI agents". Those parties "may be separate controllers". [H, S2]
- So the dApp (and any author-operated backend) is its own controller for whatever it receives: wallet addresses, credential ids, balances, request ids. It needs its own notice (M). The repo's rule is to keep these in the user's browser; a Vercel layer would be the first author-operated place that sees them (`[28 C10]` for the data-terms principle).
- The agreement also says "You may not disclose or distribute a user's information to a third party or use the information except as reasonably necessary to carry out a transaction and other functions reasonably incidental thereto ... unless you receive the user's express consent". [H, S1 §22]. Who this binds is unclear (it appears in the user-facing text); treat as a minimisation guideline for the backend (M).

---

## 3. Activity table (plain)

Risk is my reading of exposure for the dApp author and its users: **Low / Medium / High**, with a confidence tag. "Ask" refers to the numbered questions in section 7.

| Activity | What the terms say | Risk | What to ask PayBox |
|---|---|---|---|
| **OAuth client from a web app** (page registers a public client at `/oauth/register` with a redirect URI on the dApp origin, user consents at app.paybox.sh) | Docs: "If an integration speaks MCP or OAuth 2.1, it can use PayBox"; DCR "none" auth; HTTPS redirect URIs allowed. No registration, partner or review step documented. Browser calls are blocked by CORS (`access-control-allow-origin` returned only for `app.paybox.sh`). User is liable for what the client does. | **Low on terms (H quotes, M reading); blocked technically** (H, measured) | Q1 (is open DCR a supported path for a hosted web origin), Q2 (CORS allowlist for the dApp origin), Q3 (any vetting of `client_name` and redirect URIs) |
| **Hosted BFF holding tokens** (Vercel function stores the user's refresh token or session, calls `/mcp` server-side) | Docs allow "servers" for API keys and say "your app holds a scoped access token". §6B pulls in the CLI rules that credentials are "device-bound and should not be shared". Silent on who may host. Refresh tokens rotate; replay "revokes the client". Revocation kills the chain at once. Liability stays with the user. | **Medium** (H quotes, M reading). Terms exposure falls mostly on the user; for the author the real risks are client revocation, undocumented abuse handling, and being the first place a PayBox bearer exists outside a user's device | Q4 (is a third-party server holding refresh tokens permitted), Q5 (per-user vs shared client_id and revoke-on-replay scope), Q6 (data/logging expectations) |
| **Stateless pass-through proxy** (function only forwards; token lives in the user's browser memory/session, never persisted by the author) | Same text as above; no rule distinguishes storing from forwarding. §14 "anonymizing proxy ... to copy or monitor our websites" is the nearest hook but is about copying websites. | **Low-medium** (M). Smaller blast radius than BFF-with-storage, still a third party in the token path | Q4, Q7 (traffic and egress expectations) |
| **Per-user local helper** (no author-operated service; user runs a loopback process, device-code login) | This matches the CLI picture: tokens on the user's device, "Automated Systems ... controlled or instructed by you". | **Low** (M). Reference option; not what the user asked for on the hosted page | none beyond Q1 |
| **Holding a user's `pbx_live_*` key or `pbxk1.` signing key server-side** | Client key: "Treat the client key like a password." The signing key gives in-process signing. Not described as shareable. | **High** (M). Do not do this; it makes the author a standing signer-of-record in the user's eyes | Q4 only if the user insists |
| **Using first-party routes/headers** (`/api/*`, `x-moonx-*`, Origin impersonation) | "an integration never calls them"; licence "solely for approved purposes". | **High** (H quotes). Out of scope and should not be built | none |
| **Showing PayBox branding** (PayBox or MoonPay logos, icon, screenshots of the PayBox UI, brand colours) | Listed marks are "Launchpad", "MoonPay", moonpay.com and "all logos related to the Launchpad Services"; use needs "prior written consent". Brand guidelines: NOT FOUND. Apache-2.0 on the SDK gives no trademark rights. | **Medium** (H quotes, M reading). A logo is the most likely trigger of a takedown request | Q8 (is logo use allowed; is there a brand kit) |
| **Using the PayBox name in the dApp** (plain text: "Connect PayBox", "PayBox wallet", in copy and in code identifiers) | No clause forbids naming the product. "PayBox" mark status NOT FOUND. Normal nominative use is customary. | **Low** (M). Keep it descriptive, include "Not affiliated with or endorsed by PayBox or MoonPay", never imply partnership | Q8, Q9 |
| **Claiming partnership, "powered by", "official", "verified by PayBox"** | Partner tier exists in code but not documented; "A slug is routing, not authorization." Nothing authorises such claims. | **High** (M). Do not make these claims | Q9 |
| **`?app=<partnerSlug>` partner routing / `@paybox-sh/connect-react`** | "must be your enabled PayBox partner slug". Becoming one is NOT FOUND. Button only gives Claude/ChatGPT setup steps. | **Low risk, no benefit** (H) | Q9 only if the user wants a branded button |
| **Embedding PayBox UI** (iframe consent, signing window, approval page) | Nothing permits it. `frame-ancestors 'self'` on app.paybox.sh blocks it technically (H, measured). | **Blocked** | Q10 (any supported embedding for third-party hosts) |
| **Many users through one backend** (shared Vercel egress, shared client_id) | No published rate limits (NOT FOUND). Launchpad may rate-limit, cap or hold automation "without prior notice". "Replaying a used code revokes the client". | **Medium** (M). Operational, not a clause | Q5, Q7 |
| **Asking PayBox to sign prediction-market orders** (order digests for XO, Polymarket, others) | PayBox may "decline to produce a signature" for "reputational risk"; §6A geo-list scoped to MoonPay/Dawn CLI; no statement for PayBox. | **Medium** (H quote, M reading); refusal risk, not a legal ban | Q11 |
| **Receiving and showing the user's PayBox data** (addresses, balances, requests) | PayBox notice does not cover third-party apps; they are "separate controllers". No developer data terms published. | **Low-medium** (H/M). Needs the dApp's own privacy notice; keep data in the browser | Q6 |
| **Presenting the dApp as non-custodial / no money transmission** | PayBox itself: "not a custodian, money transmitter ..."; funds "move directly between your funding source and the relevant recipient". | **Low** if true (M). Only true if the dApp never holds keys or funds and never routes money | none |

---

## 4. NOT FOUND (searched; do not assume)

- Any separate PayBox API terms, developer terms, partner terms, acceptable-use policy, or app-registration terms (searched S1, S3, S4, S5, S6, S7, S8; paybox.sh, app, api and developer subdomains returned 404 for `/terms`, `/privacy`, `/terms-of-service`).
- A PayBox brand guideline or logo licence (MoonPay `/legal/brand_guidelines` 404; web search found nothing official).
- "PayBox" trademark registration status (no registry lookup possible without a dynamic search; not attempted).
- How to become an "enabled PayBox partner" and what a partner slug grants.
- Published API or MCP rate limits, quotas, abuse thresholds, or rate-limit response headers.
- Any rule on who may hold OAuth tokens or `pbx_live_*` keys, or on logging and retention by third-party backends.
- What the consent screen shows for a self-registered client, and whether unverified clients get a warning.
- Whether the prediction-market jurisdiction list (§6A) or the "Sanctioned" regime is applied to PayBox signing for third-party venues.
- Any statement on embedding PayBox UI or running the signing window in a third-party web host.
- Whether PayBox treats a client_id shared by many users differently from one-client-per-user (revocation scope, replay detection).
- Where "activity prohibited by Launchpad or its providers" is defined.

---

## 5. Measured facts from public probes (2026-10-20)

All requests: `User-Agent: insurance-markets-research/0.1`. Preflights were `OPTIONS` with `Access-Control-Request-Method: POST` and `Access-Control-Request-Headers: authorization,content-type,mcp-protocol-version`. No POST was sent.

| Request | Origin sent | Status | `access-control-allow-origin` | Other CORS headers returned |
|---|---|---|---|---|
| OPTIONS `api.paybox.sh/oauth/register` | `https://xo-markets-explorer.vercel.app` | 200 | **absent** | `allow-credentials: true`; methods `GET,POST,PUT,PATCH,DELETE,OPTIONS`; headers `content-type,authorization,x-moonx-access-token,x-moonx-identity-token,x-moonx-presence,mcp-protocol-version` |
| OPTIONS `/oauth/token`, `/mcp`, `/.well-known/oauth-authorization-server` | same | 200 each | **absent** | same set |
| same four paths | `https://example.org` | 200 each | **absent** | same set |
| same four paths | `https://app.paybox.sh` | 200 each | `https://app.paybox.sh` | same set |
| GET `/.well-known/oauth-authorization-server` | the dApp origin | 200 `application/json` | absent | `allow-credentials: true`; body lists `registration_endpoint`, `device_authorization_endpoint`, grant types `authorization_code`, `refresh_token`, `urn:ietf:params:oauth:grant-type:device_code`, `token_endpoint_auth_methods_supported: ["none"]`, scopes `mcp`, `offline_access` |
| GET `/.well-known/oauth-protected-resource` | none | 200 | n/a | `resource: https://api.paybox.sh/mcp` |
| GET `api.paybox.sh/terms`, `/.well-known/security.txt` | none | 404 | `*` on the 404 only | none |
| GET `app.paybox.sh/` | none | 200 | n/a | `content-security-policy` includes `frame-ancestors 'self'`, `form-action 'self'`, `connect-src` listing `https://api.paybox.sh` and `wss://relay.walletconnect.org`; no `x-frame-options` header |

Reading (M): server-to-server calls from a backend are not subject to CORS, and the open DCR and device-code metadata is consistent with the documented third-party posture. The app's CSP allowing WalletConnect relay hosts suggests PayBox's own UI can connect *out* to external wallets; no evidence that PayBox can be connected *in* as a WalletConnect wallet (`[24] G`, still NOT FOUND). No `x-ratelimit-*` or `retry-after` headers were returned on any probe.

---

## 6. Live tests the user would have to run (I did not)

These need a POST to a third party and/or a PayBox account, which this task forbids. They are the cheapest way to turn the open questions above into facts. The user decides.

1. **DCR with the dApp origin as redirect URI.** One `POST /oauth/register` from a server or `curl` with `client_name`, `redirect_uris: ["https://xo-markets-explorer.vercel.app/..."]`, `token_endpoint_auth_method: "none"` (registration returns a `client_id` such as `pbx-oauth-...` per docs). Pass: 2xx and a client_id. Also record if the response differs for `client_name` values that mention PayBox or MoonPay.
2. **Open the authorize URL for that client in a browser** and note exactly what the consent screen shows: the `client_name`, the redirect host, any "unverified app" wording, what grants the user can choose, and whether the revoke screen shows the client under that name. Screenshot for the record without personal data.
3. **Token exchange from a server, not a browser**, then a `tools/list` call with the bearer. Record headers for rate-limit hints.
4. **Replay behaviour**: whether two parallel refreshes with the same refresh token revoke the client (docs say they do). Use a throwaway PayBox account. This decides whether a serverless BFF needs a single-flight lock, and whether a shared client_id is acceptable.
5. **Throwaway account only** for all of the above; revoke the client after.

---

## 7. What to ask PayBox (the user decides whether to send anything)

Nothing was sent. Contact channels that exist publicly (without reproducing addresses): the MoonPay Help Center PayBox collection (`support.moonpay.com/en/collections/1437162-paybox`) and its "Contact Us" and "B2B Partner Support" entries; the hackathon terms and the user agreement each name a contact mailbox (obfuscated in the HTML). The hackathon terms' disclosure mailbox is for security vulnerabilities and must not be used for business questions. Replace the bracketed fields yourself; keep personal details out unless you choose otherwise.

### 7.1 Questions, numbered (ranked by decision value)

1. **Open registration.** Is dynamic client registration at `/oauth/register` with an HTTPS redirect URI on a third-party web origin an intended, supported path for a public web app? Is any approval, allowlist or partner agreement required for production use?
2. **CORS.** Will you allowlist an origin for browser use of `/oauth/register`, `/oauth/token` and `/mcp` (today only `https://app.paybox.sh` receives `access-control-allow-origin`)? If not, is a server-side proxy the supported pattern?
3. **Client vetting and display.** What does the consent screen show for a self-registered client (`client_name`, redirect host)? Are impersonating names (for example including "PayBox" or "MoonPay") rejected or flagged?
4. **Token custody.** Is it permitted for a third-party backend (serverless, no database, encrypted session cookie) to hold a user's refresh token on the user's behalf? Is a pure pass-through proxy that never persists tokens treated differently? Any requirements (encryption, retention, logging)?
5. **Client identity and revocation scope.** Should a multi-user web app register one client per user session or one shared client? If a shared client sees a replayed code or refresh token, is the whole client revoked for all users, or only that user's grant?
6. **Data handling.** Are there developer data terms for apps that receive wallet addresses, credential ids and request status? Is the app treated as an independent controller?
7. **Limits.** What are the rate limits and abuse thresholds for `/oauth/*` and `/mcp`, per user, per client and per source IP? Is a shared serverless egress IP a problem?
8. **Brand.** May the dApp use the plain-text name "PayBox" to describe the integration? May it use the PayBox logo or screenshots? Is there a brand kit or guideline? Is "PayBox" a registered mark?
9. **Partner status.** What is an "enabled PayBox partner" (the `?app=` slug in `@paybox-sh/connect-react`)? What does it require and unlock? Is there wording you require or forbid ("works with PayBox", "powered by PayBox")?
10. **Embedding and signing surface.** Is there a supported way for a third-party web page to complete wallet signing in the browser (for example a hosted signing popup, an `X-Paybox-Signing-Surface: browser` flow, or MCP Apps in a third-party host) without the user leaving to a chat app? `app.paybox.sh` sets `frame-ancestors 'self'`.
11. **Prediction markets and screening.** Do the §6A prediction-market jurisdiction restrictions or screening rules apply to a PayBox user who signs orders for third-party prediction venues through an OAuth client? Are signature refusals logged and visible to the user, and with what reason codes?
12. **Terms for developers.** Is there any developer, API or acceptable-use document beyond the user agreement, and where is it published?

### 7.2 Draft message (not sent; edit before use)

> Subject: Question about a third-party web app connecting to PayBox over OAuth
>
> Hello,
>
> I maintain an open-source, static web app (public repository, no custody of user keys or funds, no payment processing) that shows prediction-market data and prepares orders for users to sign. I would like to let a user connect their own PayBox account so that PayBox signs on their behalf under a grant they choose and approve themselves.
>
> Your public docs say that any integration that speaks MCP or OAuth 2.1 can use PayBox, so I would like to confirm a few points before building it, rather than assume:
>
> 1. Is dynamic client registration at `/oauth/register`, with an HTTPS redirect URI on my web app's origin, an intended and supported path for a public web application? Is any approval or partner agreement needed?
> 2. Browser requests to `api.paybox.sh` currently receive `access-control-allow-origin` only for `https://app.paybox.sh`. Would you allowlist an additional origin, or is a small server-side proxy the supported pattern? If a proxy, may it hold the user's refresh token (encrypted, no database), or must the token stay on the user's device?
> 3. For a multi-user web app, do you recommend one OAuth client per user session or one shared client? If a refresh token is replayed, is only that user's grant revoked or the whole client?
> 4. What does the consent screen show for a self-registered client, and are names that include "PayBox" or "MoonPay" restricted?
> 5. May the app use the plain-text name "PayBox" to describe the integration, and may it use your logo? Is there a brand guideline, and are there words you want me to avoid (for example "official" or "powered by")?
> 6. Are there rate limits or abuse thresholds for the OAuth and MCP endpoints I should design to?
> 7. Is there a supported browser-side signing or approval flow for third-party web apps, or should I only link the user to the PayBox app for approvals?
> 8. Do your prediction-market jurisdiction rules or screening apply to a user who signs orders for third-party prediction venues through an OAuth client?
>
> I will make it clear in the app that it is independent and not affiliated with or endorsed by PayBox or MoonPay, that it never holds keys or funds, and that users can revoke access at any time from the PayBox Clients screen.
>
> Thank you,
> [name or project name, and a project contact of your choice]

### 7.3 Likely answers (L, my guesses from how comparable platforms behave; not evidence)

- Open DCR for web origins: likely "supported for MCP clients; web use not yet guaranteed". CORS allowlist: possible only as a partner feature.
- Token custody by a third-party backend: likely "acceptable if the user's grant and revoke controls are respected"; a requirement to be a registered partner is plausible.
- Logo: likely "ask for written permission" (the user agreement and hackathon terms both point there). Plain-text naming: likely fine.
- Rate limits: likely undocumented per-IP and per-user soft limits.
- Prediction markets: likely "evaluated case by case"; the CLI geo-list suggests regulatory sensitivity.
- Browser signing: the existence of the `browser` signing-surface header suggests a planned path, but I have no evidence of a third-party-facing one.

---

## 8. Decisions the user needs to make

1. **Contact PayBox or not.** If yes, which questions (7.1 ranks them; 2, 4, 5 and 8 decide architecture and brand wording). Reading the standing rule "nobody contacts the XO team": this is PayBox/MoonPay, a different party; it is still the user's call.
2. **If not contacting**, proceed on the documented surface only: open DCR, one client per user session, tokens never persisted by the author (or at most an encrypted session cookie), plain-text "PayBox" only, no logos, no partner or "official" language, an explicit not-affiliated notice, no first-party routes or headers, and a user-visible link to the PayBox Clients screen for revocation. This is my recommendation as a floor, not an approval of risk.
3. **Whether to run the live tests** in section 6 on a throwaway PayBox account.
4. **Whether the dApp should avoid any PayBox logo** until written permission exists. My recommendation: yes.

---

## 9. Verification (what I re-checked)

- Re-fetched on 2026-10-20 as raw text (curl, pinned User-Agent) and read in full or by targeted section: the Launchpad user agreement (S1: §1, §3, §4, §5, §6, §6A, §6B, §6C, §7, §8, §13, §14, §18, §19, §22, §23), the Launchpad privacy notice (S2: scope, disclosures, third-party sections), the hackathon terms (S4, in full), the PayBox docs bundle `llms-full.txt` (S3: intro, OAuth, api-reference, requests/signing window, SDK page), `developer.paybox.sh/llms.txt` and `requirements.md` (S5: rate-limit and terms passages), the three Help Center articles (S6), `paybox.sh` footer links, robots and sitemap (S7), the MoonPay legal index (S8), npm registry JSON for both packages and their README and LICENSE (S9).
- Quotes were copied from those files; where a sentence is long I used a fragment. Section numbers come from the document's own numbering; the user agreement text refers to "Section 5A" inside the 6C DeFi block (an internal mislabel in the source), which I did not use.
- Probes in section 5 were run today with GET/OPTIONS only; statuses and header names are exactly as returned. The earlier repo note's 2026-10-19 CORS result (`[24 §3.3]`) is confirmed unchanged for `app.paybox.sh`, `example.org`, and now also for the dApp origin.
- 404s listed in section 1 were each requested once; "NOT FOUND" claims cite the sources searched. I did not search registries for the PayBox trademark and say so.
- Negative checks: no PayBox MCP tool call, no POST/PUT/DELETE, no account or client creation. The only tool-adjacent action was a single web search for MoonPay brand guidelines.
- Privacy scan target (done before finishing): this file contains no email address, personal name, username, GitHub login or home-directory path; contact mailboxes in source documents are not reproduced; only repo-relative paths are used.
- Not verified: whether the consent screen shows client names or warnings; whether DCR accepts the dApp origin; the "PayBox" mark status; any behaviour that needs a signature, account or POST; terms of any venue or of Vercel (Vercel's own acceptable-use terms for a function that proxies a wallet API are a separate check not made here).
- Not legal advice. A lawyer should review the user agreement §6B, §22 and the BVI arbitration clause before any commercial or branded launch.
