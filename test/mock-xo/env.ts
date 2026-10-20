// What every surface of the mock can see. The surfaces are built from this and nothing else, so a later
// stream adds a surface by registering routes against the same env. The write mock adds the scheduler (things
// that happen later in mock time) and the services that own write state: the order engine, the bundler's
// UserOp pool, the paymaster control, the Hyperlane emulation, the creation flow and the virtual contracts.

import type { MockChains } from "./chains.js";
import type { MockClock } from "./clock.js";
import type { CreationFlow } from "./creation.js";
import type { Engine } from "./engine.js";
import type { ExplorerState } from "./explorer.js";
import type { Hyperlane } from "./hyperlane.js";
import type { PaymasterControl } from "./paymaster.js";
import type { SwitchStore } from "./profile.js";
import type { Scheduler } from "./scheduler.js";
import type { MockState } from "./state.js";
import type { UserOpPool } from "./userops.js";
import type { VirtualContracts } from "./virtual.js";
import type { WriteState } from "./write-state.js";

export interface MockEnv {
  readonly clock: MockClock;
  readonly switches: SwitchStore;
  readonly state: MockState;
  readonly chains: MockChains;
  readonly scheduler: Scheduler;
  readonly explorer: ExplorerState;
  readonly write: WriteState;
  readonly engine: Engine;
  readonly paymaster: PaymasterControl;
  readonly userops: UserOpPool;
  readonly hyperlane: Hyperlane;
  readonly creation: CreationFlow;
  readonly virtual: VirtualContracts;
}
