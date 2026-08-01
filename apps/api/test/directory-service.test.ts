/**
 * Who appears in the people register, and what each row is allowed to say.
 *
 * Two things are being guarded, and the second is the one that would be quietly
 * got wrong. The first is which register a caller may open. The second is that
 * every figure on a row — the projects, the shared count, the open work — is
 * bounded by what the *viewer* may reach, not by what is true of the subject.
 * Listing a person's projects is the natural way to reintroduce the leak C45
 * closed: a member who cannot open a job must not learn its name by reading a
 * colleague's profile.
 */
import { describe, expect, it } from "vitest";
import {
  DirectoryService,
  type DirectoryPerson,
  type DirectoryReach,
  type DirectoryRepository,
} from "../src/application/directory-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const owner: UserPrincipal = { tenantId, userId, roles: ["owner"], permissions: [] };
const admin: UserPrincipal = { tenantId, userId, roles: ["admin"], permissions: [] };
const reader: UserPrincipal = { tenantId, userId, roles: ["member"], permissions: ["users.read"] };
const member: UserPrincipal = { tenantId, userId, roles: ["member"], permissions: ["projects.read"] };
const guest: UserPrincipal = { tenantId, userId, roles: ["guest"], permissions: ["users.read"] };

class RecordingRepository implements DirectoryRepository {
  companyCalled = false;
  colleaguesCalled = false;
  lastReach: DirectoryReach | null = null;

  async listCompanyDirectory(_tenantId: string, reach: DirectoryReach): Promise<DirectoryPerson[]> {
    this.companyCalled = true;
    this.lastReach = reach;
    return [];
  }

  async listColleagues(_tenantId: string, reach: DirectoryReach): Promise<DirectoryPerson[]> {
    this.colleaguesCalled = true;
    this.lastReach = reach;
    return [];
  }
}

describe("which register a caller may open", () => {
  it("offers the company register to somebody who may read users", () => {
    const service = new DirectoryService(new RecordingRepository());
    expect(service.availableRegisters(reader)).toEqual(["company", "colleagues"]);
  });

  it("offers the company register to an owner, who holds it by standing", () => {
    /*
     * Owners and administrators carry an empty permission list and hold
     * everything through their standing. Reading `permissions` directly would
     * hide the company register from exactly the people it exists for — which
     * is what the first draft of this did.
     */
    const service = new DirectoryService(new RecordingRepository());
    expect(service.availableRegisters(owner)).toEqual(["company", "colleagues"]);
    expect(service.availableRegisters(admin)).toEqual(["company", "colleagues"]);
  });

  it("offers only colleagues to a member without users.read", () => {
    const service = new DirectoryService(new RecordingRepository());
    expect(service.availableRegisters(member)).toEqual(["colleagues"]);
  });

  it("offers only colleagues to a guest, whatever their user types grant", () => {
    // The guest above is deliberately given `users.read`. Standing overrides
    // it at the server, and this is the assertion that says so.
    const service = new DirectoryService(new RecordingRepository());
    expect(service.availableRegisters(guest)).toEqual(["colleagues"]);
  });
});

describe("the company register is an administrative view", () => {
  it("refuses somebody without users.read", async () => {
    const service = new DirectoryService(new RecordingRepository());
    await expect(service.listCompanyDirectory(member)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a guest holding users.read", async () => {
    const repository = new RecordingRepository();
    await expect(new DirectoryService(repository).listCompanyDirectory(guest)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // Refused before the query, not after: a repository that ran and had its
    // answer discarded has already read the rows.
    expect(repository.companyCalled).toBe(false);
  });

  it("allows somebody who may read users", async () => {
    const repository = new RecordingRepository();
    await new DirectoryService(repository).listCompanyDirectory(reader);
    expect(repository.companyCalled).toBe(true);
  });
});

describe("the colleague register is open to everyone", () => {
  it("does not require users.read", async () => {
    const repository = new RecordingRepository();
    await new DirectoryService(repository).listColleagues(member);
    expect(repository.colleaguesCalled).toBe(true);
  });

  it("is available to a guest", async () => {
    /*
     * Membership already discloses who else is on a project — the workspace
     * lists them — so withholding this would protect nothing while leaving a
     * person unable to name the colleague they are working beside.
     */
    const repository = new RecordingRepository();
    await new DirectoryService(repository).listColleagues(guest);
    expect(repository.colleaguesCalled).toBe(true);
  });
});

describe("rows are bounded by the viewer's reach", () => {
  it("passes narrow reach for somebody who cannot reach every project", async () => {
    const repository = new RecordingRepository();
    await new DirectoryService(repository).listColleagues(member);
    expect(repository.lastReach).toEqual({ all: false, userId });
  });

  it("passes full reach for somebody holding projects.manage_all", async () => {
    const repository = new RecordingRepository();
    await new DirectoryService(repository).listCompanyDirectory({
      tenantId,
      userId,
      roles: ["member"],
      permissions: ["users.read", "projects.manage_all"],
    });
    expect(repository.lastReach).toEqual({ all: true, userId });
  });

  it("passes full reach for a company administrator", async () => {
    const repository = new RecordingRepository();
    await new DirectoryService(repository).listCompanyDirectory(admin);
    expect(repository.lastReach).toEqual({ all: true, userId });
  });

  it("never gives a guest full reach", async () => {
    const repository = new RecordingRepository();
    await new DirectoryService(repository).listColleagues({
      tenantId,
      userId,
      roles: ["guest"],
      permissions: ["projects.manage_all"],
    });
    expect(repository.lastReach).toEqual({ all: false, userId });
  });
});
