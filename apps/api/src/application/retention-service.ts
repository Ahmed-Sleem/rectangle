/**
 * Audit retention.
 *
 * The trail previously grew without limit. That is both a cost and a liability:
 * holding a record of employees' activity indefinitely, with no stated policy,
 * is its own compliance problem regardless of who may read it.
 *
 * This deliberately is not a migration. Migrations record themselves in
 * `schema_migrations` and run exactly once, so a delete written there would
 * purge the backlog on the day it deployed and never run again — retention that
 * lapses silently is worse than none, because it looks handled.
 */
import { ACTIVITY_RETENTION_DAYS } from "../domain/activity.js";

export interface RetentionRepository {
  /** Removes entries older than the window across all tenants. */
  purgeAuditEvents(days: number): Promise<number>;
}

export interface RetentionLogger {
  info(details: Record<string, unknown>, message: string): void;
  error(details: Record<string, unknown>, message: string): void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class RetentionService {
  constructor(
    private readonly repository: RetentionRepository,
    private readonly logger: RetentionLogger,
    private readonly retentionDays: number = ACTIVITY_RETENTION_DAYS,
  ) {}

  async purgeOnce(): Promise<number> {
    const removed = await this.repository.purgeAuditEvents(this.retentionDays);
    if (removed > 0) {
      this.logger.info(
        { removed, retentionDays: this.retentionDays },
        "Purged audit events past the retention window",
      );
    }
    return removed;
  }

  /**
   * Runs now and then daily.
   *
   * Returns a stop function so tests and a graceful shutdown can end the timer
   * rather than leaving the process held open by it. A failure is logged and
   * swallowed: retention must never take the API down with it, and the next
   * run is only a day away.
   */
  start(): () => void {
    const run = () => {
      this.purgeOnce().catch((error: unknown) => {
        this.logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          "Audit retention purge failed",
        );
      });
    };

    run();

    const timer = setInterval(run, DAY_MS);
    // Node must be free to exit on shutdown without waiting for this timer.
    timer.unref?.();

    return () => clearInterval(timer);
  }
}
