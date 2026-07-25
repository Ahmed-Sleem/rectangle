/**
 * Stand-ins for services a given route test does not exercise.
 *
 * They throw rather than return empty results, so a test that accidentally
 * reaches an unrelated service fails loudly instead of asserting against a
 * quietly fabricated response.
 */
import type { OverviewService } from "../../src/application/overview-service.js";

export const inactiveOverviewService: Pick<OverviewService, "getSummary"> = {
  getSummary(): never {
    throw new Error("not used");
  },
};
