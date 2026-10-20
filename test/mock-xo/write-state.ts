// The write mock's data: API credentials and orders. Plain data with a reset; behaviour lives in auth.ts,
// orders.ts and engine.ts. Keys are account keys (lower-case 40 hex, no 0x), like MockState.

import type { AccountKey } from "./state.js";

export interface Credential {
  readonly apiKey: string;
  readonly secret: string;
  readonly passphrase: string;
  readonly account: AccountKey;
  readonly createdMs: number;
}

export type OrderType = "GTC" | "GTD" | "FOK" | "FAK";
// live: resting. matched: fully filled. canceled: cancelled by the owner, by a rejection after the fact, by the
// balance-drop rule or by a market state. expired: swept after its expiration.
export type OrderStatus = "live" | "matched" | "canceled" | "expired";

export interface OrderFill {
  readonly atMs: number;
  readonly sharesMicro: bigint;
  readonly priceTick: number;
  readonly collateralMicro: bigint;
  readonly feeMicro: bigint;
  readonly role: "taker" | "maker";
}

export interface MockOrder {
  readonly id: number;
  readonly hash: string;
  readonly account: AccountKey;
  readonly tokenId: string;
  readonly conditionId: string;
  readonly side: 0 | 1;
  readonly tick: number;
  readonly sharesMicro: bigint;
  readonly collateralMicro: bigint;
  readonly orderType: OrderType;
  readonly postOnly: boolean;
  // Unix seconds; 0 = none.
  readonly expiration: number;
  readonly createdMs: number;
  // Hash of the signed payload the duplicate check uses (order.dup_key_includes_sig).
  readonly payloadKey: string;
  readonly signature: string;
  status: OrderStatus;
  remainingMicro: bigint;
  cancelReason: string | null;
  readonly fills: OrderFill[];
}

export class WriteState {
  readonly credentials: Credential[] = [];
  readonly orders = new Map<string, MockOrder>();
  nextOrderId = 100_001;
  private readonly keyCounters = new Map<AccountKey, number>();

  reset(): void {
    this.credentials.length = 0;
    this.orders.clear();
    this.nextOrderId = 100_001;
    this.keyCounters.clear();
  }

  nextKeyIndex(account: AccountKey): number {
    const next = (this.keyCounters.get(account) ?? 0) + 1;
    this.keyCounters.set(account, next);
    return next;
  }

  credentialsOf(account: AccountKey): Credential[] {
    return this.credentials.filter((entry) => entry.account === account);
  }

  credentialByKey(apiKey: string): Credential | undefined {
    return this.credentials.find((entry) => entry.apiKey === apiKey);
  }

  deleteCredential(apiKey: string): boolean {
    const index = this.credentials.findIndex((entry) => entry.apiKey === apiKey);
    if (index === -1) return false;
    this.credentials.splice(index, 1);
    return true;
  }

  orderById(id: string): MockOrder | undefined {
    for (const order of this.orders.values()) if (String(order.id) === id) return order;
    return undefined;
  }

  ordersOf(account: AccountKey): MockOrder[] {
    return [...this.orders.values()].filter((order) => order.account === account);
  }
}
