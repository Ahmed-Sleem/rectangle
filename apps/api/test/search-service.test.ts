/** Tests that global search never returns records the caller cannot open. */
import { describe, expect, it } from "vitest";
import { SearchService, type SearchRepository, type SearchResult } from "../src/application/search-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const admin: UserPrincipal = { tenantId, userId, roles: ["admin"], permissions: [] };
/*
 * A member who may read the project register. Standing alone grants nothing
 * now — only owners and admins gain permissions from standing — so the
 * permission is carried by a user type, which is how a real member gets it.
 */
const viewer: UserPrincipal = { tenantId, userId, roles: ["member"], permissions: ["projects.read"] };
const outsider: UserPrincipal = { tenantId, userId, roles: ["guest"], permissions: [] };

class RecordingRepository implements SearchRepository {
  projectsCalled = false;
  tasksCalled = false;
  peopleCalled = false;
  lastScope: "all" | "member" | null = null;
  lastLimit = 0;

  async searchProjects(): Promise<SearchResult[]> {
    this.projectsCalled = true;
    return [{ kind: "project", id: "p1", title: "New Cairo Tower", href: "/projects/p1" }];
  }

  async searchTasks(
    _tenantId: string,
    _userId: string,
    _term: string,
    limit: number,
    scope: "all" | "member",
  ): Promise<SearchResult[]> {
    this.tasksCalled = true;
    this.lastScope = scope;
    this.lastLimit = limit;
    return [{ kind: "task", id: "t1", title: "Pour raft", href: "/tasks?projectId=p1" }];
  }

  risksCalled = false;

  async searchRisks(
    _tenantId: string,
    _userId: string,
    _term: string,
    _limit: number,
    scope: "all" | "member",
  ): Promise<SearchResult[]> {
    this.risksCalled = true;
    this.lastScope = scope;
    return [{ kind: "risk", id: "r1", title: "Rebar delay", href: "/risks?projectId=p1" }];
  }

  async searchPeople(): Promise<SearchResult[]> {
    this.peopleCalled = true;
    return [{ kind: "person", id: "u1", title: "Mona Adel", href: "/team" }];
  }
}

describe("SearchService", () => {
  it("returns every kind of record for an administrator", async () => {
    const repository = new RecordingRepository();
    const results = await new SearchService(repository).search(admin, { q: "cairo" });
    expect(results.map((result) => result.kind)).toEqual(["project", "task", "risk", "person"]);
  });

  it("omits people for someone who may not read the user register", async () => {
    const repository = new RecordingRepository();
    const results = await new SearchService(repository).search(viewer, { q: "cairo" });
    expect(repository.peopleCalled).toBe(false);
    expect(results.some((result) => result.kind === "person")).toBe(false);
  });

  it("returns nothing at all to someone who can read no register", async () => {
    const repository = new RecordingRepository();
    const results = await new SearchService(repository).search(outsider, { q: "cairo" });
    // Refusing the whole request would be worse: this user can legitimately
    // search, they simply have nothing they are allowed to find.
    expect(results).toEqual([]);
    expect(repository.projectsCalled).toBe(false);
  });

  it("scopes task results the same way the task list does", async () => {
    const repository = new RecordingRepository();
    await new SearchService(repository).search(viewer, { q: "cairo" });
    expect(repository.lastScope).toBe("member");

    const forAdmin = new RecordingRepository();
    await new SearchService(forAdmin).search(admin, { q: "cairo" });
    expect(forAdmin.lastScope).toBe("all");
  });

  it("rejects a term too short to be meaningful", async () => {
    const service = new SearchService(new RecordingRepository());
    await expect(service.search(admin, { q: "a" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("caps how many results one register can return", async () => {
    const repository = new RecordingRepository();
    await new SearchService(repository).search(admin, { q: "cairo" });
    expect(repository.lastLimit).toBe(5);

    await expect(
      new SearchService(repository).search(admin, { q: "cairo", limit: 500 }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
