/**
 * The people register, answered from the viewer's position rather than the
 * company's.
 *
 * The Team page previously listed every person in the tenant, with no project
 * context, to anybody holding `users.read` — and nothing at all to anybody
 * else. Both halves were wrong. A site engineer needs to know who is on their
 * job and how to reach them, which is not an administrative privilege; and an
 * administrator reading a flat list of names cannot tell who is doing what.
 *
 * So there are two registers, which is what Procore settled on and for the same
 * stated reason — company-wide directory access is withheld from most people on
 * purpose, while the people you share work with are never hidden from you:
 *
 *   - the **company directory**, gated on `users.read`;
 *   - **colleagues**, everyone who shares at least one project with the caller,
 *     open to every signed-in person including guests.
 *
 * Everything each row carries — which projects, which role, how much open work —
 * is computed against **the viewer's** reach, never the subject's. Listing the
 * projects a person belongs to is the obvious way to reintroduce the leak that
 * C45 just closed: a member who cannot open a project must not learn its name by
 * opening a colleague's profile.
 */
import {
  canReachAllProjects,
  hasPermission,
  requirePermission,
  type CompanyStanding,
  type UserPrincipal,
} from "../domain/auth.js";

/** A project the viewer may see, and what the subject does on it. */
export interface DirectoryProject {
  id: string;
  name: string;
  code: string;
  role: string;
  /** Whether the viewer is also on this project. Drives the "with you" mark. */
  sharedWithViewer: boolean;
}

export interface DirectoryPerson {
  id: string;
  displayName: string;
  email: string;
  status: "active" | "invited" | "disabled";
  standing: CompanyStanding;
  /**
   * Only the projects the VIEWER can reach. A person may well be on more; that
   * is not the viewer's business and the count below does not hint at it.
   */
  projects: DirectoryProject[];
  /** How many of those projects the viewer is also on. */
  sharedProjectCount: number;
  /** Open tasks assigned to this person, on projects the viewer can reach. */
  openTaskCount: number;
  /**
   * The user types this person holds.
   *
   * Carried here so the Team page has one people register rather than two. It
   * previously ran a directory list and an administrative list side by side,
   * showing the same people twice under two headings a reader could not tell
   * apart — the owner said so directly. The administrative columns are only
   * *rendered* for somebody who may administer people; they are only *sent* to
   * a caller holding `users.read`, since the colleague register is open to
   * everyone.
   */
  userTypes: Array<{ id: string; name: string; key: string }>;
}

export interface DirectoryReach {
  all: boolean;
  userId: string;
}

export interface DirectoryRepository {
  listCompanyDirectory(tenantId: string, reach: DirectoryReach): Promise<DirectoryPerson[]>;
  listColleagues(tenantId: string, reach: DirectoryReach): Promise<DirectoryPerson[]>;
}

export class DirectoryService {
  constructor(private readonly repository: DirectoryRepository) {}

  private reachOf(actor: UserPrincipal): DirectoryReach {
    // The same helper the project register uses. A second answer to "what may
    // this person reach" is how the two would drift apart.
    return { all: canReachAllProjects(actor), userId: actor.userId };
  }

  /** Everyone in the company. An administrative view, and gated as one. */
  async listCompanyDirectory(actor: UserPrincipal): Promise<{ people: DirectoryPerson[] }> {
    requirePermission(actor, "users.read");
    return { people: await this.repository.listCompanyDirectory(actor.tenantId, this.reachOf(actor)) };
  }

  /**
   * The people the caller shares a project with.
   *
   * Deliberately requires no permission. Membership of a project already
   * discloses who else is on it — the workspace lists them — so withholding it
   * here would protect nothing and would leave a person unable to name the
   * colleague they are working beside. A guest gets this and nothing else.
   */
  async listColleagues(actor: UserPrincipal): Promise<{ people: DirectoryPerson[] }> {
    return { people: await this.repository.listColleagues(actor.tenantId, this.reachOf(actor)) };
  }

  /**
   * Which registers this caller may open, so the page offers only those rather
   * than rendering a tab that answers with a refusal.
   */
  availableRegisters(actor: UserPrincipal): Array<"company" | "colleagues"> {
    const registers: Array<"company" | "colleagues"> = ["colleagues"];
    /*
     * `hasPermission`, not `permissions.includes`. An owner or administrator
     * holds everything by standing and carries an empty permission list, so
     * reading the array directly would hide the company register from exactly
     * the people it exists for. `hasPermission` also short-circuits guests,
     * which is the other half of the rule.
     */
    if (hasPermission(actor, "users.read")) registers.unshift("company");
    return registers;
  }
}
