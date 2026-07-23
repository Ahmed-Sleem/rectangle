/**
 * Project domain schemas enforce the first construction-grade project data
 * contract before data reaches repositories or external integrations.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";

export const projectStatusSchema = z.enum([
  "planned",
  "active",
  "on_hold",
  "completed",
  "archived",
]);

export const projectSectorSchema = z.enum([
  "residential",
  "commercial",
  "infrastructure",
  "industrial",
  "healthcare",
  "education",
  "hospitality",
  "mixed_use",
  "other",
]);

export const deliveryMethodSchema = z.enum([
  "design_bid_build",
  "design_build",
  "construction_management",
  "epc",
  "other",
]);

const projectCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Z0-9][A-Z0-9._-]*$/u, "Use uppercase letters, numbers, dot, underscore, or dash.");

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Use YYYY-MM-DD format.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Use a valid date.");

const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/u, "Use a positive amount with up to 2 decimals.");

const projectInputObjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: projectCodeSchema.transform((value) => value.toUpperCase()),
  description: z.string().trim().max(2000).optional(),
  status: projectStatusSchema.default("planned"),
  plannedStartDate: dateStringSchema.optional(),
  plannedFinishDate: dateStringSchema.optional(),
  budgetAmount: decimalStringSchema.optional(),
  budgetCurrency: z.string().trim().length(3).regex(/^[A-Z]{3}$/u).optional(),
  sector: projectSectorSchema.optional(),
  deliveryMethod: deliveryMethodSchema.optional(),
  locationName: z.string().trim().min(2).max(160).optional(),
});

export const createProjectInputSchema = projectInputObjectSchema.superRefine((value, context) => {
    if (value.plannedStartDate && value.plannedFinishDate && value.plannedFinishDate < value.plannedStartDate) {
      context.addIssue({
        code: "custom",
        path: ["plannedFinishDate"],
        message: "Finish date cannot be before start date.",
      });
    }
    if (value.budgetAmount && !value.budgetCurrency) {
      context.addIssue({
        code: "custom",
        path: ["budgetCurrency"],
        message: "Currency is required when budget amount is provided.",
      });
    }
  });

export const updateProjectInputSchema = projectInputObjectSchema.partial().superRefine((value, context) => {
  if (Object.keys(value).length === 0) {
    context.addIssue({ code: "custom", message: "At least one project field must be provided." });
  }
  if (value.plannedStartDate && value.plannedFinishDate && value.plannedFinishDate < value.plannedStartDate) {
    context.addIssue({
      code: "custom",
      path: ["plannedFinishDate"],
      message: "Finish date cannot be before start date.",
    });
  }
  if (value.budgetAmount && !value.budgetCurrency) {
    context.addIssue({
      code: "custom",
      path: ["budgetCurrency"],
      message: "Currency is required when budget amount is provided.",
    });
  }
});

export const projectIdSchema = z.uuid();

export const projectListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  status: projectStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});

export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export interface ProjectRecord {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description?: string;
  status: ProjectStatus;
  plannedStartDate?: string;
  plannedFinishDate?: string;
  budgetAmount?: string;
  budgetCurrency?: string;
  sector?: z.infer<typeof projectSectorSchema>;
  deliveryMethod?: z.infer<typeof deliveryMethodSchema>;
  locationName?: string;
  createdAt: string;
  updatedAt: string;
}

export function parseCreateProjectInput(input: unknown): CreateProjectInput {
  const parsed = createProjectInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_FAILED", "Project input is invalid.", z.treeifyError(parsed.error));
  }
  return parsed.data;
}

export function parseUpdateProjectInput(input: unknown): UpdateProjectInput {
  const parsed = updateProjectInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_FAILED", "Project update is invalid.", z.treeifyError(parsed.error));
  }
  return parsed.data;
}

export function parseProjectId(input: unknown): string {
  const parsed = projectIdSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_FAILED", "Project id is invalid.", z.treeifyError(parsed.error));
  }
  return parsed.data;
}

export function parseProjectListQuery(input: unknown): ProjectListQuery {
  const parsed = projectListQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_FAILED", "Project query is invalid.", z.treeifyError(parsed.error));
  }
  return parsed.data;
}
