// Pinned protocol constants. Callers never pass these in: a value that arrives from the agent or
// from a relayed payload must not be able to change what gets signed. Sources are the verified
// notes: docs/research/01-xo-auth-signing.md (c, e) and 07-xo-bot-reference.md (2.1, 5).

export const XO_CHAIN_ID = 3223;

// CTF Exchange, the verifyingContract of the order domain.
export const CTF_EXCHANGE_ADDRESS = "0x4bC5E872256D12E6017dfe466E04c867DC761B77" as const;

// ZeroDev ECDSA validator that XO smart accounts use as validator in the wire signature.
export const KERNEL_ECDSA_VALIDATOR_ADDRESS = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57" as const;

export const ORDER_DOMAIN_NAME = "XO Market CLOB";
export const ORDER_DOMAIN_VERSION = "1";

export const KERNEL_DOMAIN_NAME = "Kernel";
export const KERNEL_DOMAIN_VERSION = "0.3.1";

export const CLOB_AUTH_DOMAIN_NAME = "ClobAuthDomain";
export const CLOB_AUTH_DOMAIN_VERSION = "1";
// Literal "by SDK convention" in the XO docs; it is part of the signed struct.
export const CLOB_AUTH_MESSAGE = "This message attests that I control the given wallet";

// signatureType 3 is the only accepted value (XO smart account, OpenAPI name XO_ZERODEV).
export const SIGNATURE_TYPE_XO_SMART_ACCOUNT = 3;

export const SIDE_BUY = 0;
export const SIDE_SELL = 1;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_BYTES16 = "0x00000000000000000000000000000000" as const;
export const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

// Collateral and outcome shares both use 6 decimals; price is an integer tick over 1000.
export const MICRO = 1_000_000n;
export const TICK_DENOMINATOR = 1000n;
export const MIN_TICK = 1;
export const MAX_TICK = 999;

// secp256k1 group order and its half, for the low-s rule.
export const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
export const SECP256K1_HALF_N = SECP256K1_N / 2n;

// Exact type strings (no spaces after commas: the docs print spaced forms, the typehash uses
// the canonical form). Used by the independent hand-rolled check in the vector tests.
export const ORDER_TYPE_STRING =
  "Order(uint256 salt,address maker,address signer,address beneficiary,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint128 nonce,bytes16 identifier,bytes32 metadata,uint8 side,uint8 signatureType)";
export const KERNEL_TYPE_STRING = "Kernel(bytes32 hash)";
export const CLOB_AUTH_TYPE_STRING = "ClobAuth(address address,string timestamp,uint256 nonce,string message)";
