/**
 * Risk and issue domain rules.
 *
 * A risk is something that might happen; an issue is one that has. They share
 * a table and a lifecycle because the second is the first after the event, and
 * treating them as unrelated records would lose that connection exactly when
 * it matters most.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";

export const riskKindSchema = z.enum(["risk", "issue"]);

export const riskCategorySchema = z.enum([
  "safety",
  "quality",
  "schedule",
  "cost",
  "design",
  "procurement",
  "environmental",
  "regulatory",
  "other",
]);

export const riskStatusSchema = z.enum([
  "open",
  "assessing",
  "mitigating",
  "accepted",
  "closed",
  "occurred",
]);

export type RiskKind = z.infer<typeof riskKindSchema>;
export type RiskCategory = z.infer<typeof riskCategorySchema>;
export type RiskStatus = z.infer<typeof riskStatusSchema>;

export type RiskSeverity = "low" | "medium" | "high" | "critical";

/** Both axes of the matrix. Exported so the UI cannot invent a sixth row. */
export const RISK_SCALE = [1, 2, 3, 4, 5] as const;

/**
 * Severity from score, derived rather than stored.
 *
 * Keeping a severity column beside the numbers that produce it invites the two
 * to drift, and then a register sorted by one disagrees with a matrix coloured
 * by the other.
 */
export function severityOf(score: number): RiskSeverity {
  if (score >= 15) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

/** Entries no longer demanding attention, excluded from live counts. */
const settledStatuses = new Set<RiskStatus>(["closed", "accepted"]);

export function isSettledRiskStatus(status: RiskStatus): boolean {
  return settledStatuses.has(status);
}

/**
 * Permitted status moves.
 *
 * `occurred` is reachable from any live state because reality does not wait
 * for an assessment to finish. Reopening from closed is allowed for the same
 * reason it is allowed on tasks: things get closed in error, and forbidding it
 * pushes people to create a duplicate and lose the history.
 */
const allowedTransitions: Record<RiskStatus, readonly RiskStatus[]> = {
  open: ["assessing", "mitigating", "accepted", "closed", "occurred"],
  assessing: ["open", "mitigating", "accepted", "closed", "occurred"],
  mitigating: ["assessing", "accepted", "closed", "occurred"],
  accepted: ["open", "assessing", "mitigating", "occurred"],
  closed: ["open", "assessing"],
  occurred: ["mitigating", "closed"],
};

export function canTransitionRisk(from: RiskStatus, to: RiskStatus): boolean {
  if (from === to) return true;
  return allowedTransitions[from].includes(to);
}

export function assertRiskTransition(from: RiskStatus, to: RiskStatus): void {
  if (!canTransitionRisk(from, to)) {
    throw new DomainError("VALIDATION_FAILED", "That status change is not allowed for this entry.", {
      from,
      to,
      allowed: allowedTransitions[from],
    });
  }
}

const scale = z.coerce.number().int().min(1).max(5);
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Use the YYYY-MM-DD date format.")
  .optional();

export const createRiskInputSchema = z
  .object({
    kind: riskKindSchema.default("risk"),
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(4000).optional(),
    category: riskCategorySchema.default("other"),
    probability: scale.default(3),
    impact: scale.default(3),
    status: riskStatusSchema.default("open"),
    mitigation: z.string().trim().max(4000).optional(),
    ownerUserId: z.uuid().optional(),
    mitigationTaskId: z.uuid().optional(),
    dueDate: optionalDate,
    residualProbability: scale.optional(),
    residualImpact: scale.optional(),
  })
  .superRefine(checkResidual);

/**
 * Residual exposure only means something once there is a treatment to reduce
 * it, and a residual worse than the original is a data-entry error rather than
 * a finding.
 */
function checkResidual(
  value: {
    probability?: number | undefined;
    impact?: number | undefined;
    residualProbability?: number | undefined;
    residualImpact?: number | undefined;
    mitigation?: string | null | undefined;
    mitigationTaskId?: string | null | undefined;
  },
  context: z.RefinementCtx,
): void {
  const hasResidual = value.residualProbability !== undefined || value.residualImpact !== undefined;
  if (!hasResidual) return;

  if (!value.mitigation && !value.mitigationTaskId) {
    context.addIssue({
      code: "custom",
      path: ["residualProbability"],
      message: "Record the mitigation before its residual exposure.",
    });
    return;
  }

  const original = (value.probability ?? 0) * (value.impact ?? 0);
  const residual = (value.residualProbability ?? 0) * (value.residualImpact ?? 0);
  if (original > 0 && residual > original) {
    context.addIssue({
      code: "custom",
      path: ["residualImpact"],
      message: "Residual exposure cannot exceed the original.",
    });
  }
}

export const updateRiskInputSchema = z
  .object({
    kind: riskKindSchema.optional(),
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    category: riskCategorySchema.optional(),
    probability: scale.optional(),
    impact: scale.optional(),
    status: riskStatusSchema.optional(),
    mitigation: z.string().trim().max(4000).nullable().optional(),
    ownerUserId: z.uuid().nullable().optional(),
    mitigationTaskId: z.uuid().nullable().optional(),
    dueDate: optionalDate.nullable(),
    residualProbability: scale.nullable().optional(),
    residualImpact: scale.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({ code: "custom", message: "No changes were provided." });
    }
  });

export const riskListQuerySchema = z.object({
  projectId: z.uuid().optional(),
  kind: riskKindSchema.optional(),
  status: riskStatusSchema.optional(),
  category: riskCategorySchema.optional(),
  ownerUserId: z.uuid().optional(),
  mine: z.coerce.boolean().optional(),
  /** Excludes closed and accepted, which is what a working register wants. */
  openOnly: z.coerce.boolean().optional(),
  /** Narrows to one matrix cell, so the grid can be clicked through. */
  probability: scale.optional(),
  impact: scale.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type CreateRiskInput = z.infer<typeof createRiskInputSchema>;
export type UpdateRiskInput = z.infer<typeof updateRiskInputSchema>;
export type RiskListQuery = z.infer<typeof riskListQuerySchema>;

export interface RiskRecord {
  id: string;
  tenantId: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  kind: RiskKind;
  title: string;
  description?: string;
  category: RiskCategory;
  probability: number;
  impact: number;
  score: number;
  severity: RiskSeverity;
  residualProbability?: number;
  residualImpact?: number;
  residualScore?: number;
  status: RiskStatus;
  mitigation?: string;
  mitigationTaskId?: string;
  mitigationTaskTitle?: string;
  ownerUserId?: string;
  ownerName?: string;
  dueDate?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** One intersection of the 5×5 grid. */
export interface RiskMatrixCell {
  probability: number;
  impact: number;
  count: number;
}

export interface RiskSummary {
  total: number;
  criticalOrHigh: number;
  underReview: number;
  closed: number;
  occurred: number;
  matrix: RiskMatrixCell[];
  /** Live entries per severity band, for the breakdown beside the matrix. */
  bySeverity: Array<{ severity: RiskSeverity; count: number }>;
  /** Live entries per category, highest first. */
  byCategory: Array<{ category: RiskCategory; count: number }>;
}

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError("VALIDATION_FAILED", message, z.treeifyError(result.error));
  }
  return result.data;
}

export const riskIdSchema = z.uuid();

export function parseRiskId(input: unknown): string {
  return parse(riskIdSchema, input, "Risk id is invalid.");
}

export function parseCreateRiskInput(input: unknown): CreateRiskInput {
  return parse(createRiskInputSchema, input, "Risk details are invalid.");
}

export function parseUpdateRiskInput(input: unknown): UpdateRiskInput {
  return parse(updateRiskInputSchema, input, "Risk changes are invalid.");
}

export function parseRiskListQuery(input: unknown): RiskListQuery {
  return parse(riskListQuerySchema, input ?? {}, "Risk filters are invalid.");
}
