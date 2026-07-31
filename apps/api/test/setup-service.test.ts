/**
 * The guard on first-run setup.
 *
 * `/v1/setup/` is deliberately public — nobody has a session before the first
 * account exists, so it cannot be behind authentication. That makes the check
 * inside the service the only thing standing between a stranger and a second
 * owner account on a live company, and an audit found it had no test at all.
 *
 * It is one `if`, which is exactly the kind of line that survives a refactor by
 * being deleted. These make that deletion loud.
 */
import { describe, expect, it } from "vitest";
import { SetupService, type SetupRepository } from "../src/application/setup-service.js";
import { DomainError } from "../src/domain/errors.js";

const jwtSecret = "rectangle-test-secret-must-be-at-least-32-chars";

const VALID = {
  companyName: "Nile Contracting",
  companySlug: "nile",
  adminName: "Ahmed Sleem",
  adminEmail: "ahmed@example.com",
  password: "CorrectHorse123",
};

/** Records what was asked of it, so an attempt that got through is visible. */
class MemorySetupRepository {
  setupRequired: boolean;
  created = 0;

  constructor(setupRequired: boolean) {
    this.setupRequired = setupRequired;
  }

  async getSetupStatus() {
    return { setupRequired: this.setupRequired };
  }

  async createFirstAdmin() {
    this.created += 1;
    this.setupRequired = false;
    return {
      tenantId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      sessionId: "33333333-3333-4333-8333-333333333333",
      email: VALID.adminEmail,
      displayName: VALID.adminName,
      roles: ["owner"] as never,
      permissions: [] as string[],
    };
  }
}

function createService(setupRequired: boolean) {
  const repository = new MemorySetupRepository(setupRequired);
  const audit = { events: [] as Array<Record<string, unknown>>, async append(event: Record<string, unknown>) { this.events.push(event); } };
  const service = new SetupService(
    repository as unknown as SetupRepository,
    { async hash() { return "hashed"; }, async verify() { return true; } },
    audit as never,
    jwtSecret,
  );
  return { service, repository, audit };
}

describe("first-run setup", () => {
  it("creates the first company and signs the owner in", async () => {
    const { service, repository } = createService(true);
    const result = await service.createFirstAdmin(VALID);
    expect(result.accessToken).toBeTruthy();
    expect(repository.created).toBe(1);
  });

  it("refuses once a company already exists", async () => {
    /*
     * The whole reason this file exists. The endpoint is public because nobody
     * has a session before the first account, so this check is the only thing
     * between a stranger and an owner account on somebody's live company.
     */
    const { service, repository } = createService(false);
    await expect(service.createFirstAdmin(VALID)).rejects.toThrow(/already been completed/iu);
    expect(repository.created).toBe(0);
  });

  it("refuses a second attempt immediately after the first succeeds", async () => {
    // The race a single-shot test cannot see: the guard has to read the status
    // that the first call just changed, not one captured beforehand.
    const { service, repository } = createService(true);
    await service.createFirstAdmin(VALID);
    await expect(
      service.createFirstAdmin({ ...VALID, adminEmail: "someone.else@example.com" }),
    ).rejects.toThrow(DomainError);
    expect(repository.created).toBe(1);
  });

  it("checks the guard before validating the input", async () => {
    /*
     * Order matters here. Validating first would let a stranger probe a live
     * company's setup endpoint and tell a validation error from a refusal —
     * which reveals whether the instance has been claimed.
     */
    const { service, repository } = createService(false);
    await expect(service.createFirstAdmin({ garbage: true })).rejects.toThrow(
      /already been completed/iu,
    );
    expect(repository.created).toBe(0);
  });

  it("reports whether setup is still required without creating anything", async () => {
    const { service, repository } = createService(true);
    expect(await service.getStatus()).toEqual({ setupRequired: true });
    expect(repository.created).toBe(0);
  });
});
