/**
 * The people register, as the server answers it.
 *
 * Separate from `admin-api.ts` because the two describe different things: that
 * file administers accounts, this one reads the directory. A person appears
 * here with only what the viewer is entitled to know about them, which is a
 * server decision — nothing in this file filters or hides anything, and it must
 * stay that way, or the rule would exist in two places and eventually disagree.
 */
import { apiRequest } from "@/shared/api/client";
import type { CompanyStanding } from "./admin-api";

export type DirectoryRegister = "company" | "colleagues";

export interface DirectoryProject {
  id: string;
  name: string;
  code: string;
  /** The subject's role on that project: owner, manager, member or viewer. */
  role: string;
  /** Whether the viewer is on it too. */
  sharedWithViewer: boolean;
}

export interface DirectoryPerson {
  id: string;
  displayName: string;
  email: string;
  status: "active" | "invited" | "disabled";
  /** Exactly one company standing, never a set. */
  standing: CompanyStanding;
  /** Only the projects the viewer may see. Never the subject's full list. */
  projects: DirectoryProject[];
  sharedProjectCount: number;
  openTaskCount: number;
  /** Present for callers who may read users; empty otherwise. */
  permissions: string[];
}

export const directoryApi = {
  registers: () =>
    apiRequest<{ registers: DirectoryRegister[] }>("/v1/directory/registers"),
  company: () => apiRequest<{ people: DirectoryPerson[] }>("/v1/directory/company"),
  colleagues: () => apiRequest<{ people: DirectoryPerson[] }>("/v1/directory/colleagues"),
};
