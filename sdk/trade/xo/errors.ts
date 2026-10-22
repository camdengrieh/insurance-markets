// One error type with a stable code, so guardrail tests assert the reason and not message text.
export type SigningErrorCode =
  | "invalid_address"
  | "invalid_hex"
  | "invalid_integer"
  | "invalid_order"
  | "invalid_signature_length"
  | "invalid_signature_prefix"
  | "invalid_signature_validator"
  | "invalid_signature_v"
  | "invalid_signature_value"
  | "high_s_signature"
  | "invalid_price"
  | "invalid_size"
  | "inexact_amount"
  | "below_minimum"
  | "invalid_expiration"
  | "never_expiring_order"
  | "invalid_timestamp"
  | "invalid_http_method"
  | "invalid_request_path"
  | "invalid_body"
  | "invalid_secret"
  | "invalid_credential"
  | "invalid_canonical_mode"
  // A typed, failing-closed case this build does not implement. No builder raises it today (the Polymarket Deposit
  // Wallet order it was added for is built since 2026-10-21); kept so a future unbuilt case has a stable code.
  | "not_implemented";

export class SigningError extends Error {
  readonly code: SigningErrorCode;

  constructor(code: SigningErrorCode, message: string) {
    super(message);
    this.name = "SigningError";
    this.code = code;
  }
}
