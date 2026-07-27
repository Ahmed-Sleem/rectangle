/**
 * Guards audit retention.
 *
 * The first attempt at this put the delete in a migration. Migrations record
 * themselves in `schema_migrations` and run exactly once, so it would have
 * purged the backlog on its deploy day and never run again — retention that
 * lapses silently, which is worse than none because it looks handled. These
 * tests pin the behaviour that replaced it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetentionService, type RetentionRepository } from "../src/application/retention-service.js";
import { ACTIVITY_RETENTION_DAYS } from "../src/domain/activity.js";

class RecordingRepository implements RetentionRepository {
  calls: number[] = [];
  removed = 0;
  failWith?: Error;

  async purgeAuditEvents(days: number): Promise<number> {
    this.calls.push(days);
    if (this.failWith) throw this.failWith;
    return this.removed;
  }
}

function silentLogger() {
  return { info: vi.fn(), error: vi.fn() };
}

describe("audit retention", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("purges using the documented window", async () => {
    const repository = new RecordingRepository();
    await new RetentionService(repository, silentLogger()).purgeOnce();

    expect(repository.calls).toEqual([ACTIVITY_RETENTION_DAYS]);
    expect(ACTIVITY_RETENTION_DAYS).toBe(400);
  });

  it("runs immediately rather than waiting a day for the first purge", () => {
    const repository = new RecordingRepository();
    const stop = new RetentionService(repository, silentLogger()).start();

    expect(repository.calls).toHaveLength(1);
    stop();
  });

  it("keeps running, so retention does not lapse after the first day", async () => {
    const repository = new RecordingRepository();
    const stop = new RetentionService(repository, silentLogger()).start();

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(repository.calls).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(repository.calls).toHaveLength(3);

    stop();
  });

  it("stops when asked, so shutdown is not held open by the timer", async () => {
    const repository = new RecordingRepository();
    const stop = new RetentionService(repository, silentLogger()).start();

    stop();
    await vi.advanceTimersByTimeAsync(3 * 24 * 60 * 60 * 1000);

    expect(repository.calls).toHaveLength(1);
  });

  it("survives a failed purge instead of taking the API down", async () => {
    const repository = new RecordingRepository();
    repository.failWith = new Error("connection lost");
    const logger = silentLogger();

    const stop = new RetentionService(repository, logger).start();
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.error).toHaveBeenCalled();

    // And the schedule survives the failure: the next day still runs.
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(repository.calls).toHaveLength(2);

    stop();
  });

  it("reports only when something was actually removed", async () => {
    const quiet = silentLogger();
    const repository = new RecordingRepository();
    await new RetentionService(repository, quiet).purgeOnce();
    // Nothing to purge is the normal case; logging it every day is noise.
    expect(quiet.info).not.toHaveBeenCalled();

    const loud = silentLogger();
    repository.removed = 12;
    await new RetentionService(repository, loud).purgeOnce();
    expect(loud.info).toHaveBeenCalled();
  });
});
