import type { CspViolation } from "./world";

// Defects the e2e suites found in code they do not own. Each is matched by a narrow signature and pinned by a test that
// FAILS the day the defect is fixed, so an entry cannot outlive its cause. A violation that does not match a signature
// still fails the clean-load assertions.

export interface KnownIssue {
  readonly id: string;
  readonly owner: string;
  readonly summary: string;
  matches(violation: CspViolation): boolean;
}

// Empty: the one defect this register held (K1, zod's `new Function("")` probe running before the jitless setting) was fixed by
// putting zod and that setting in one chunk (app/scripts/vite-base.ts), and the clean-load tests now hold the build to zero. Add an
// entry here only with a narrow signature and a test that fails the day it is fixed.
export const KNOWN_ISSUES: readonly KnownIssue[] = [];

export function unknownViolations(violations: readonly CspViolation[]): readonly CspViolation[] {
  return violations.filter((violation) => !KNOWN_ISSUES.some((issue) => issue.matches(violation)));
}

export function knownViolations(violations: readonly CspViolation[], id: string): readonly CspViolation[] {
  const issue = KNOWN_ISSUES.find((entry) => entry.id === id);
  return issue === undefined ? [] : violations.filter((violation) => issue.matches(violation));
}
