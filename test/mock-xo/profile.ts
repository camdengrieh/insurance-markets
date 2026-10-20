// The switch store: the live values of the mock's "unknown on the real service" switches
// (docs/phase1-gap-closing.md 5.5 category B; the names, values and the two profile columns are in
// switches.ts and are frozen).
//
//   new SwitchStore()                       pessimistic profile (decision D9: the default)
//   new SwitchStore("optimistic")           every switch at its optimistic value
//   store.set("rpc.access", "open")         flip one switch (typed: the value must be one of its values)
//   store.setByName(name, value)            the same for untyped input (the control endpoint); validated
//   store.setProfile("optimistic")          replace all values
//
// An unknown name or a value that is not in the switch's list throws a MockSwitchError. The store holds
// values only; behaviour lives where a switch is read. SWITCH_IMPLEMENTATION says which switches have
// behaviour yet, so a switch that is stored but does nothing is never mistaken for one that works.

import {
  MOCK_SWITCHES,
  MOCK_SWITCH_NAMES,
  OPTIMISTIC_PROFILE,
  PESSIMISTIC_PROFILE,
  type MockProfile,
  type MockProfileName,
  type MockSwitchName,
  type MockSwitchValue,
} from "./switches.js";

export class MockSwitchError extends Error {
  readonly code: "unknown_switch" | "invalid_value" | "unknown_profile";
  constructor(code: MockSwitchError["code"], message: string) {
    super(message);
    this.name = "MockSwitchError";
    this.code = code;
  }
}

export type SwitchChange = (name: MockSwitchName, value: string, previous: string) => void;

// Where a switch has its behaviour: the read surfaces ("mock-read": rpc.access, registry.trigger, faults) or the
// write surfaces ("mock-write": the other 27). A switch that is stored but does nothing would be reported as
// "mock-write-pending"; none is, and a test fails if one ever is.
export type SwitchImplementation = "mock-read" | "mock-write" | "mock-write-pending";

const IMPLEMENTED_IN_READ_MOCK: ReadonlySet<MockSwitchName> = new Set<MockSwitchName>(["rpc.access", "registry.trigger", "faults"]);
const PENDING: ReadonlySet<MockSwitchName> = new Set<MockSwitchName>();

export const SWITCH_IMPLEMENTATION: Readonly<Record<MockSwitchName, SwitchImplementation>> = Object.freeze(
  Object.fromEntries(
    MOCK_SWITCH_NAMES.map((name) => [name, PENDING.has(name) ? "mock-write-pending" : IMPLEMENTED_IN_READ_MOCK.has(name) ? "mock-read" : "mock-write"]),
  ) as Record<MockSwitchName, SwitchImplementation>,
);

// Every switch with behaviour (read or write).
export function implementedSwitches(): readonly MockSwitchName[] {
  return MOCK_SWITCH_NAMES.filter((name) => SWITCH_IMPLEMENTATION[name] !== "mock-write-pending");
}

export function readSwitches(): readonly MockSwitchName[] {
  return MOCK_SWITCH_NAMES.filter((name) => SWITCH_IMPLEMENTATION[name] === "mock-read");
}

export function writeSwitches(): readonly MockSwitchName[] {
  return MOCK_SWITCH_NAMES.filter((name) => SWITCH_IMPLEMENTATION[name] === "mock-write");
}

export function isMockSwitchName(name: string): name is MockSwitchName {
  return (MOCK_SWITCH_NAMES as readonly string[]).includes(name);
}

export function switchValues(name: MockSwitchName): readonly string[] {
  const definition = MOCK_SWITCHES.find((entry) => entry.name === name);
  if (definition === undefined) throw new MockSwitchError("unknown_switch", `unknown switch ${name}`);
  return definition.values;
}

function profileValues(profile: MockProfileName): MockProfile {
  if (profile === "pessimistic") return PESSIMISTIC_PROFILE;
  if (profile === "optimistic") return OPTIMISTIC_PROFILE;
  throw new MockSwitchError("unknown_profile", "profile must be pessimistic or optimistic");
}

export class SwitchStore {
  private values: Record<string, string>;
  private readonly listeners = new Set<SwitchChange>();
  private profileName: MockProfileName | "custom";

  // `initial` is a profile name, or a partial set of values applied on top of the pessimistic profile.
  constructor(initial: MockProfileName | Partial<MockProfile> = "pessimistic") {
    if (typeof initial === "string") {
      this.values = { ...profileValues(initial) };
      this.profileName = initial;
    } else {
      this.values = { ...PESSIMISTIC_PROFILE };
      this.profileName = "pessimistic";
      for (const [name, value] of Object.entries(initial)) {
        if (value !== undefined) this.assign(name, value);
      }
      this.profileName = this.matchProfile();
    }
  }

  // The profile the values came from, or "custom" after any single flip that moved them off both columns.
  get profile(): MockProfileName | "custom" {
    return this.profileName;
  }

  get<N extends MockSwitchName>(name: N): MockSwitchValue<N> {
    const value = this.values[name];
    if (value === undefined) throw new MockSwitchError("unknown_switch", `unknown switch ${name}`);
    return value as MockSwitchValue<N>;
  }

  set<N extends MockSwitchName>(name: N, value: MockSwitchValue<N>): void {
    this.assign(name, value);
    this.profileName = this.matchProfile();
  }

  // For input that arrives untyped (the control endpoint, a CLI flag). Throws a MockSwitchError.
  setByName(name: string, value: string): void {
    this.assign(name, value);
    this.profileName = this.matchProfile();
  }

  setProfile(profile: MockProfileName): void {
    const target = profileValues(profile);
    for (const name of MOCK_SWITCH_NAMES) this.assign(name, target[name]);
    this.profileName = profile;
  }

  snapshot(): MockProfile {
    return { ...this.values } as MockProfile;
  }

  // Names whose value differs from the given profile (for reporting).
  differences(profile: MockProfileName): readonly MockSwitchName[] {
    const target = profileValues(profile);
    return MOCK_SWITCH_NAMES.filter((name) => this.values[name] !== target[name]);
  }

  onChange(listener: SwitchChange): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Runs `body` with some switches temporarily changed, then restores them (also when it throws).
  async withSwitches<T>(overrides: Partial<MockProfile>, body: () => Promise<T>): Promise<T> {
    const before = this.snapshot();
    const profileBefore = this.profileName;
    for (const [name, value] of Object.entries(overrides)) {
      if (value !== undefined) this.assign(name, value);
    }
    this.profileName = this.matchProfile();
    try {
      return await body();
    } finally {
      for (const name of MOCK_SWITCH_NAMES) this.assign(name, before[name]);
      this.profileName = profileBefore;
    }
  }

  private assign(name: string, value: string): void {
    if (!isMockSwitchName(name)) throw new MockSwitchError("unknown_switch", `unknown switch ${name}`);
    if (typeof value !== "string" || !switchValues(name).includes(value)) {
      throw new MockSwitchError("invalid_value", `${name} accepts ${switchValues(name).join(" | ")}`);
    }
    const previous = this.values[name] ?? value;
    this.values[name] = value;
    if (previous !== value) for (const listener of this.listeners) listener(name, value, previous);
  }

  private matchProfile(): MockProfileName | "custom" {
    if (MOCK_SWITCH_NAMES.every((name) => this.values[name] === PESSIMISTIC_PROFILE[name])) return "pessimistic";
    if (MOCK_SWITCH_NAMES.every((name) => this.values[name] === OPTIMISTIC_PROFILE[name])) return "optimistic";
    return "custom";
  }
}
