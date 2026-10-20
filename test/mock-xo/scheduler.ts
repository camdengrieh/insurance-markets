// The mock's task scheduler: things that happen LATER in mock time (a UserOp is included, a Hyperlane message
// is delivered, the oracle reviews a market, a credit lands, a GTD order is swept). Nothing runs on a real
// timer. mock.advance(seconds) walks the clock to each due task in time order, brings the chains' time up to
// that moment, runs the task, and only then goes on, so a block mined by a task carries the task's own time
// and not the end of the advance.
//
// Ordering: by due time, then by insertion order. A task may schedule further tasks; they run in the same
// advance when they are due inside it. A task that throws stops the advance and the error reaches the caller
// (a bug in the mock must be loud, never a silently skipped delivery).

import type { MockClock } from "./clock.js";

export interface ScheduledTask {
  readonly id: number;
  readonly dueMs: number;
  readonly label: string;
  readonly run: () => Promise<void> | void;
}

export class Scheduler {
  private readonly tasks: ScheduledTask[] = [];
  private nextId = 1;
  private busy: Promise<void> = Promise.resolve();

  constructor(
    private readonly clock: MockClock,
    // Called before each task with the task's due time in whole seconds (the mock syncs chain time here).
    private readonly beforeTask: (atSeconds: number) => Promise<void>,
  ) {}

  at(dueMs: number, label: string, run: () => Promise<void> | void): number {
    if (!Number.isFinite(dueMs)) throw new RangeError("a task needs a finite due time");
    const task: ScheduledTask = { id: this.nextId, dueMs: Math.max(Math.round(dueMs), this.clock.nowMs()), label, run };
    this.nextId += 1;
    this.tasks.push(task);
    return task.id;
  }

  after(delayMs: number, label: string, run: () => Promise<void> | void): number {
    return this.at(this.clock.nowMs() + delayMs, label, run);
  }

  cancel(id: number): boolean {
    const index = this.tasks.findIndex((task) => task.id === id);
    if (index === -1) return false;
    this.tasks.splice(index, 1);
    return true;
  }

  clear(): void {
    this.tasks.length = 0;
  }

  pending(): readonly ScheduledTask[] {
    return [...this.tasks].sort((a, b) => a.dueMs - b.dueMs || a.id - b.id);
  }

  private next(limitMs: number): ScheduledTask | undefined {
    let best: ScheduledTask | undefined;
    for (const task of this.tasks) {
      if (task.dueMs > limitMs) continue;
      if (best === undefined || task.dueMs < best.dueMs || (task.dueMs === best.dueMs && task.id < best.id)) best = task;
    }
    return best;
  }

  // Moves the clock forward by `seconds`, running everything that falls due on the way. Calls are queued, so
  // two concurrent advances never interleave their tasks.
  advance(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds < 0) return Promise.reject(new RangeError("the clock only moves forward"));
    const run = async (): Promise<void> => {
      const targetMs = this.clock.nowMs() + Math.round(seconds * 1000);
      for (;;) {
        const task = this.next(targetMs);
        if (task === undefined) break;
        this.tasks.splice(this.tasks.indexOf(task), 1);
        if (task.dueMs > this.clock.nowMs()) this.clock.set(task.dueMs);
        await this.beforeTask(this.clock.nowSeconds());
        await task.run();
      }
      if (targetMs > this.clock.nowMs()) this.clock.set(targetMs);
      await this.beforeTask(this.clock.nowSeconds());
    };
    const result = this.busy.then(run);
    this.busy = result.catch(() => undefined);
    return result;
  }

  // Runs what is already due without moving the clock.
  runDue(): Promise<void> {
    return this.advance(0);
  }
}
