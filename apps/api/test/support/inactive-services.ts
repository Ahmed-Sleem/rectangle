/**
 * Stand-ins for services a given route test does not exercise.
 *
 * They throw rather than return empty results, so a test that accidentally
 * reaches an unrelated service fails loudly instead of asserting against a
 * quietly fabricated response.
 */
import type { OverviewService } from "../../src/application/overview-service.js";

export const inactiveActivityService = {
  list(): never { throw new Error("not used"); },
  listActions(): never { throw new Error("not used"); },
};

export const inactiveOverviewService: Pick<OverviewService, "getSummary"> = {
  getSummary(): never {
    throw new Error("not used");
  },
};

export const inactiveTaskService = {
  createTask(): never { throw new Error("not used"); },
  listTasks(): never { throw new Error("not used"); },
  getTask(): never { throw new Error("not used"); },
  updateTask(): never { throw new Error("not used"); },
  deleteTask(): never { throw new Error("not used"); },
  listComments(): never { throw new Error("not used"); },
  addComment(): never { throw new Error("not used"); },
};

export const inactiveSearchService = {
  search(): never { throw new Error("not used"); },
};

export const inactiveDirectoryService = {
  listCompanyDirectory(): never { throw new Error("not used"); },
  listColleagues(): never { throw new Error("not used"); },
  availableRegisters(): never { throw new Error("not used"); },
};

export const inactiveProfileService = {
  getProfile(): never { throw new Error("not used"); },
  updateProfile(): never { throw new Error("not used"); },
  changePassword(): never { throw new Error("not used"); },
};

export const inactiveAuthLifecycleService = {
  requestPasswordReset(): never { throw new Error("not used"); },
  confirmPasswordReset(): never { throw new Error("not used"); },
  sendInvitation(): never { throw new Error("not used"); },
  describeInvitation(): never { throw new Error("not used"); },
  acceptInvitation(): never { throw new Error("not used"); },
  requestEmailChange(): never { throw new Error("not used"); },
  confirmEmailChange(): never { throw new Error("not used"); },
  revertEmailChange(): never { throw new Error("not used"); },
} as unknown as import("../../src/application/auth-lifecycle-service.js").AuthLifecycleService;

export const inactiveRiskService = {
  createRisk(): never { throw new Error("not used"); },
  listRisks(): never { throw new Error("not used"); },
  getRisk(): never { throw new Error("not used"); },
  updateRisk(): never { throw new Error("not used"); },
  deleteRisk(): never { throw new Error("not used"); },
  summarise(): never { throw new Error("not used"); },
};

/*
 * The assistant, for suites that are not testing it. Every method throws
 * rather than returning a benign value: a test that reaches one of these has
 * wandered somewhere it did not mean to, and should say so loudly instead of
 * quietly passing against a stub.
 */
export const inactiveAiService = {
  chat(): never { throw new Error("not used"); },
  confirm(): never { throw new Error("not used"); },
  listConversations(): never { throw new Error("not used"); },
  branchConversation(): never { throw new Error("not used"); },
  readConversation(): never { throw new Error("not used"); },
  renameConversation(): never { throw new Error("not used"); },
  deleteConversation(): never { throw new Error("not used"); },
  deleteAllConversations(): never { throw new Error("not used"); },
  listAutoApprovals(): never { throw new Error("not used"); },
  grantAutoApproval(): never { throw new Error("not used"); },
  revokeAutoApproval(): never { throw new Error("not used"); },
};

export const inactiveAiSettingsService = {
  getSettings(): never { throw new Error("not used"); },
  saveSettings(): never { throw new Error("not used"); },
  saveMyProvider(): never { throw new Error("not used"); },
  deleteMyProvider(): never { throw new Error("not used"); },
  chooseProvider(): never { throw new Error("not used"); },
};
