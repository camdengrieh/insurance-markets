// The local account name the privacy scans look for, or null when there is nothing personal to find:
// a short name, or a generic system account (a container's "root", a CI runner's "runner") whose name
// is an ordinary word in this code ("root event", "node").
import { userInfo } from "node:os";

const GENERIC_ACCOUNTS: ReadonlySet<string> = new Set(["root", "user", "runner", "node", "ubuntu", "admin", "ec2-user", "nobody", "builder", "app"]);

export function personalAccountName(): string | null {
  const name = userInfo().username.toLowerCase();
  return name.length >= 4 && !GENERIC_ACCOUNTS.has(name) ? name : null;
}
