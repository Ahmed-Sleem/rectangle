/**
 * Project workspace: overview, team, stakeholders, and activity for one real
 * project record. Every panel reads and writes the backend directly, and any
 * action the current user cannot perform is hidden rather than shown failing.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FormDialog,
  Input,
  LoadingState,
  PageGrid,
  Select,
  Textarea,
  Toolbar,
  buttonClassName,
  ProgressBar,
} from "@/shared/ui";
import { adminApi } from "@/features/team/admin-api";
import { listTasks } from "@/features/tasks/task-api";
import {
  addProjectMember,
  createStakeholder,
  deleteStakeholder,
  getProject,
  getProjectAccess,
  listProjectActivity,
  listProjectMembers,
  listStakeholders,
  removeProjectMember,
  deleteProject,
  updateProject,
  updateProjectMember,
  type ProjectMemberRole,
  type ProjectStakeholder,
  type ProjectStatus,
  type StakeholderCategory,
} from "./project-api";
import "./ProjectsPage.css";

const MEMBER_ROLES = [
  "project_admin",
  "project_manager",
  "controls_manager",
  "viewer",
  "external_collaborator",
] as const satisfies ReadonlyArray<ProjectMemberRole>;

const STAKEHOLDER_CATEGORIES = [
  "client", "consultant", "contractor", "subcontractor", "supplier",
  "authority", "community", "internal", "other",
] as const satisfies ReadonlyArray<StakeholderCategory>;

const LEVELS = ["low", "medium", "high"] as const;

const editSchema = z.object({
  name: z.string().trim().min(2).max(120),
  status: z.enum(["planned", "active", "on_hold", "completed", "archived"]),
  locationName: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  plannedStartDate: z.string().optional(),
  plannedFinishDate: z.string().optional(),
}).superRefine((value, context) => {
  if (value.plannedStartDate && value.plannedFinishDate && value.plannedFinishDate < value.plannedStartDate) {
    context.addIssue({ code: "custom", path: ["plannedFinishDate"], message: "Finish date cannot be before start date." });
  }
});

const memberSchema = z.object({
  userId: z.string().uuid({ message: "Choose a person to add." }),
  role: z.enum(["project_admin", "project_manager", "controls_manager", "viewer", "external_collaborator"]),
});

const stakeholderSchema = z.object({
  name: z.string().trim().min(2).max(160),
  organization: z.string().trim().max(160).optional(),
  category: z.enum([
    "client", "consultant", "contractor", "subcontractor", "supplier",
    "authority", "community", "internal", "other",
  ]),
  influence: z.enum(LEVELS),
  interest: z.enum(LEVELS),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

type EditForm = z.infer<typeof editSchema>;
type MemberForm = z.infer<typeof memberSchema>;
type StakeholderForm = z.infer<typeof stakeholderSchema>;

function messageFor(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiClientError ? error.message : fallback;
}

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [stakeholderOpen, setStakeholderOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ userId: string; name: string } | null>(null);
  const [pendingStakeholder, setPendingStakeholder] = useState<ProjectStakeholder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();

  const enabled = Boolean(projectId);
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => getProject(projectId), enabled });
  const access = useQuery({ queryKey: ["project", projectId, "access"], queryFn: () => getProjectAccess(projectId), enabled });
  const members = useQuery({ queryKey: ["project", projectId, "members"], queryFn: () => listProjectMembers(projectId), enabled });
  const stakeholders = useQuery({ queryKey: ["project", projectId, "stakeholders"], queryFn: () => listStakeholders(projectId), enabled });
  const activity = useQuery({ queryKey: ["project", projectId, "activity"], queryFn: () => listProjectActivity(projectId), enabled });
  const projectTasks = useQuery({
    queryKey: ["tasks", { projectId }],
    queryFn: () => listTasks({ projectId }),
    enabled,
  });

  const canManage = access.data?.access.canManage ?? false;
  // Only fetch the company directory when it will actually be used.
  const directory = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users, enabled: enabled && canManage && memberOpen });

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });
  const memberForm = useForm<MemberForm>({ resolver: zodResolver(memberSchema), defaultValues: { userId: "", role: "viewer" } });
  const stakeholderForm = useForm<StakeholderForm>({
    resolver: zodResolver(stakeholderSchema),
    defaultValues: { name: "", organization: "", category: "client", influence: "medium", interest: "medium", email: "", phone: "", notes: "" },
  });

  const record = project.data?.project;
  useEffect(() => {
    if (!record) return;
    editForm.reset({
      name: record.name,
      status: record.status,
      locationName: record.locationName ?? "",
      description: record.description ?? "",
      plannedStartDate: record.plannedStartDate ?? "",
      plannedFinishDate: record.plannedFinishDate ?? "",
    });
  }, [editForm, record]);

  async function refresh(...keys: string[]) {
    await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: ["project", projectId, key] })));
    await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
  }

  const saveProject = useMutation({
    mutationFn: (values: EditForm) => updateProject(projectId, {
      name: values.name,
      status: values.status,
      ...(values.locationName ? { locationName: values.locationName } : {}),
      ...(values.description ? { description: values.description } : {}),
      ...(values.plannedStartDate ? { plannedStartDate: values.plannedStartDate } : {}),
      ...(values.plannedFinishDate ? { plannedFinishDate: values.plannedFinishDate } : {}),
    }),
    onSuccess: async () => { await refresh("activity"); setEditOpen(false); },
  });

  const addMember = useMutation({
    mutationFn: (values: MemberForm) => addProjectMember(projectId, values),
    onSuccess: async () => { await refresh("members", "activity"); memberForm.reset(); setMemberOpen(false); },
  });

  const changeRole = useMutation({
    mutationFn: (input: { userId: string; role: ProjectMemberRole }) =>
      updateProjectMember(projectId, input.userId, { role: input.role }),
    onSuccess: async () => { await refresh("members", "activity"); },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId, userId),
    onSuccess: async () => { await refresh("members", "activity"); setPendingRemoval(null); },
  });

  const addStakeholder = useMutation({
    mutationFn: (values: StakeholderForm) => createStakeholder(projectId, {
      name: values.name,
      category: values.category,
      influence: values.influence,
      interest: values.interest,
      ...(values.organization ? { organization: values.organization } : {}),
      ...(values.email ? { email: values.email } : {}),
      ...(values.phone ? { phone: values.phone } : {}),
      ...(values.notes ? { notes: values.notes } : {}),
    }),
    onSuccess: async () => { await refresh("stakeholders", "activity"); stakeholderForm.reset(); setStakeholderOpen(false); },
  });

  // One mutation for every status move, so each lands in the audit trail the
  // same way and the UI never writes status directly.
  const changeStatus = useMutation({
    mutationFn: (next: ProjectStatus) => updateProject(projectId, { status: next }),
    onSuccess: async () => { await refresh("activity"); },
  });

  const removeProject = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setConfirmDelete(false);
      navigate("/projects");
    },
  });

  const removeStakeholder = useMutation({
    mutationFn: (stakeholderId: string) => deleteStakeholder(projectId, stakeholderId),
    onSuccess: async () => { await refresh("stakeholders", "activity"); setPendingStakeholder(null); },
  });

  if (project.isLoading) return <LoadingState title={t("projects.loadingWorkspaceTitle")} message={t("projects.loadingWorkspaceMessage")} />;

  if (project.isError) {
    const notFound = project.error instanceof ApiClientError && project.error.status === 404;
    return (
      <ErrorState
        title={notFound ? t("projects.unavailableTitle") : t("projects.openFailedTitle")}
        message={notFound
          ? t("projects.unavailableMessage")
          : t("projects.openFailedMessage")}
        action={<Button variant="secondary" onClick={() => void project.refetch()}>{t("projects.tryAgain")}</Button>}
      />
    );
  }

  if (!record) return <EmptyState title={t("projects.unavailableTitle")} message={t("projects.unavailableMessage")} />;

  const memberRows = members.data?.members ?? [];
  const stakeholderRows = stakeholders.data?.stakeholders ?? [];
  const activityRows = activity.data?.activity ?? [];

  // Counted from the project's own tasks, so the panel can never disagree with
  // the board it links to.
  const taskRows = projectTasks.data?.tasks ?? [];
  const openTaskCount = taskRows.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  ).length;
  const doneTaskCount = taskRows.filter((task) => task.status === "done").length;
  const today = new Date().toISOString().slice(0, 10);
  const overdueTaskCount = taskRows.filter(
    (task) =>
      task.dueDate !== undefined &&
      task.dueDate < today &&
      task.status !== "done" &&
      task.status !== "cancelled",
  ).length;
  const alreadyMembers = new Set(memberRows.map((member) => member.userId));
  const assignable = (directory.data?.users ?? []).filter((user) => !alreadyMembers.has(user.id));

  return (
    <section className="rect-project-detail" aria-label={record.name}>
      <Link className="rect-projects-link" to="/projects">← {t("projects.backToProjects")}</Link>

      <div className="rect-project-detail__header">
        <div>
          <h2>{record.name}</h2>
          <p>{record.code}</p>
        </div>
        <Toolbar>
          <Badge tone={record.status === "active" ? "success" : "neutral"}>
            {t(`enums.projectStatus.${record.status}`)}
          </Badge>
          {canManage ? <Button variant="secondary" onClick={() => setEditOpen(true)}>{t("projects.editProject")}</Button> : null}
          {canManage ? (
            <Link className={buttonClassName("secondary")} to={`/projects/${projectId}/settings`}>
              {t("projects.projectSettings")}
            </Link>
          ) : null}
          {canManage ? (
            <Select
              className="rect-project-lifecycle"
              aria-label={t("projects.lifecycle")}
              value=""
              disabled={changeStatus.isPending}
              onChange={(event) => {
                const action = event.target.value;
                event.currentTarget.value = "";
                if (action === "delete") { setConfirmDelete(true); return; }
                if (action) changeStatus.mutate(action as ProjectStatus);
              }}
            >
              <option value="">{t("projects.lifecycle")}</option>
              {record.status !== "active" ? <option value="active">{t("projects.markActive")}</option> : null}
              {record.status !== "on_hold" ? <option value="on_hold">{t("projects.putOnHold")}</option> : null}
              {record.status !== "completed" ? <option value="completed">{t("projects.markCompleted")}</option> : null}
              {record.status !== "archived"
                ? <option value="archived">{t("projects.archive")}</option>
                : <option value="planned">{t("projects.restore")}</option>}
              <option value="delete">{t("projects.deleteProject")}</option>
            </Select>
          ) : null}
        </Toolbar>
      </div>

      {record.status === "archived" ? (
        <p className="rect-project-archived" role="status">{t("projects.archivedNotice")}</p>
      ) : null}
      {changeStatus.error ? (
        <p className="rect-projects-form__error" role="alert">
          {messageFor(changeStatus.error, t("projects.statusChangeFailed"))}
        </p>
      ) : null}

      <PageGrid columns={12}>
        <Card className="rect-project-detail__card"><h3>{t("projects.fieldLocation")}</h3><p>{record.locationName ?? t("projects.notSet")}</p></Card>
        <Card className="rect-project-detail__card">
          <h3>{t("projects.plannedDates")}</h3>
          <p>{record.plannedStartDate && record.plannedFinishDate ? `${record.plannedStartDate} → ${record.plannedFinishDate}`  : t("projects.notSet")}</p>
        </Card>
        <Card className="rect-project-detail__card">
          <h3>{t("projects.fieldBudget")}</h3>
          <p>{record.budgetAmount && record.budgetCurrency ? `${record.budgetAmount} ${record.budgetCurrency}`  : t("projects.notSet")}</p>
        </Card>
      </PageGrid>

      <Card className="rect-project-detail__summary">
        <h3>{t("projects.fieldDescription")}</h3>
        <p>{record.description || t("projects.noDescription")}</p>
      </Card>

      <Card className="rect-project-detail__panel">
        <div className="rect-project-detail__panel-head">
          <h3>{t("projects.teamTitle")}</h3>
          {canManage ? <Button size="sm" variant="secondary" onClick={() => setMemberOpen(true)}>{t("projects.addMember")}</Button> : null}
        </div>
        {members.isLoading ? (
          <LoadingState title={t("projects.loadingTeam")} message={t("projects.loadingTeamMessage")} />
        ) : memberRows.length === 0 ? (
          <EmptyState
            title={t("projects.noMembersTitle")}
            message={canManage ? t("projects.noMembersManage") : t("projects.noMembersRead")}
          />
        ) : (
          <DataTable
            caption={t("projects.teamTitle")}
            rows={memberRows}
            getRowKey={(member) => member.userId}
            columns={[
              { id: "name", header: t("projects.memberName"), accessor: (member) => member.displayName },
              { id: "email", header: t("projects.memberEmail"), accessor: (member) => member.email },
              {
                id: "role",
                header: t("projects.memberRole"),
                accessor: (member) => canManage ? (
                  <Select
                    aria-label={t("projects.memberRoleFor", { name: member.displayName })}
                    value={member.role}
                    disabled={changeRole.isPending}
                    onChange={(event) => changeRole.mutate({ userId: member.userId, role: event.target.value as ProjectMemberRole })}
                  >
                    {MEMBER_ROLES.map((role) => (
                      <option key={role} value={role}>{t(`enums.memberRole.${role}`)}</option>
                    ))}
                  </Select>
                ) : t(`enums.memberRole.${member.role}`),
              },
              ...(canManage ? [{
                id: "action",
                header: t("projects.actionColumn"),
                accessor: (member: (typeof memberRows)[number]) => (
                  <Button size="sm" variant="ghost" onClick={() => setPendingRemoval({ userId: member.userId, name: member.displayName })}>
                    {t("projects.remove")}
                  </Button>
                ),
              }] : []),
            ]}
          />
        )}
        {changeRole.error ? <p className="rect-projects-form__error" role="alert">{messageFor(changeRole.error, t("projects.roleChangeFailed"))}</p> : null}
      </Card>

      <Card className="rect-project-detail__panel">
        <div className="rect-project-detail__panel-head">
          <h3>{t("projects.stakeholdersTitle")}</h3>
          {canManage ? <Button size="sm" variant="secondary" onClick={() => setStakeholderOpen(true)}>{t("projects.addStakeholder")}</Button> : null}
        </div>
        {stakeholders.isLoading ? (
          <LoadingState title={t("projects.loadingStakeholders")} message={t("projects.loadingStakeholdersMessage")} />
        ) : stakeholderRows.length === 0 ? (
          <EmptyState
            title={t("projects.noStakeholdersTitle")}
            message={canManage ? t("projects.noStakeholdersManage") : t("projects.noStakeholdersRead")}
          />
        ) : (
          <DataTable
            caption={t("projects.stakeholderRegister")}
            rows={stakeholderRows}
            getRowKey={(item) => item.id}
            columns={[
              { id: "name", header: t("projects.stakeholderName"), accessor: (item) => item.name },
              { id: "organization", header: t("projects.stakeholderOrganization"), accessor: (item) => item.organization ?? t("common.notAvailable") },
              { id: "category", header: t("projects.stakeholderCategory"), accessor: (item) => t(`enums.stakeholderCategory.${item.category}`) },
              { id: "influence", header: t("projects.stakeholderInfluence"), accessor: (item) => t(`enums.level.${item.influence}`) },
              { id: "interest", header: t("projects.stakeholderInterest"), accessor: (item) => t(`enums.level.${item.interest}`) },
              ...(canManage ? [{
                id: "action",
                header: t("projects.actionColumn"),
                accessor: (item: ProjectStakeholder) => (
                  <Button size="sm" variant="ghost" onClick={() => setPendingStakeholder(item)}>{t("projects.remove")}</Button>
                ),
              }] : []),
            ]}
          />
        )}
      </Card>

      <Card className="rect-project-detail__panel">
        <h3>{t("projects.tasksTitle")}</h3>
        {projectTasks.isLoading ? (
          <LoadingState title={t("common.loading")} message="" />
        ) : taskRows.length === 0 ? (
          <EmptyState title={t("projects.tasksEmpty")} message="" />
        ) : (
          <>
            {record.totalTasks ? (
              <ProgressBar
                done={record.doneTasks ?? 0}
                total={record.totalTasks}
                label={t("projects.progressLabel", { name: record.name })}
              />
            ) : null}
            <ul className="rect-today__figures">
              <li>
                <span className="rect-today__figure-label">{t("projects.tasksOpen")}</span>
                <span className="rect-today__figure-value">{openTaskCount}</span>
              </li>
              <li>
                <span className="rect-today__figure-label">{t("projects.tasksOverdue")}</span>
                <span
                  className={
                    overdueTaskCount > 0
                      ? "rect-today__figure-value rect-today__figure-value--alert"
                      : "rect-today__figure-value"
                  }
                >
                  {overdueTaskCount}
                </span>
              </li>
              <li>
                <span className="rect-today__figure-label">{t("projects.tasksDone")}</span>
                <span className="rect-today__figure-value">{doneTaskCount}</span>
              </li>
            </ul>
            <Link className={buttonClassName("secondary", "sm")} to={`/tasks?projectId=${projectId}`}>
              {t("projects.tasksViewAll")}
            </Link>
          </>
        )}
      </Card>

      <Card className="rect-project-detail__panel">
        <h3>{t("projects.activityTitle")}</h3>
        {activity.isLoading ? (
          <LoadingState title={t("projects.loadingActivity")} message={t("projects.loadingActivityMessage")} />
        ) : activityRows.length === 0 ? (
          <EmptyState title={t("projects.noActivityTitle")} message={t("projects.noActivityMessage")} />
        ) : (
          <ul className="rect-project-activity">
            {activityRows.map((entry) => (
              <li key={entry.id} className="rect-project-activity__item">
                <span className="rect-project-activity__label">{t(`enums.activity.${entry.action}`, { defaultValue: entry.action })}</span>
                <span className="rect-project-activity__meta">
                  {entry.actorName ? `${entry.actorName} · ` : ""}
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FormDialog
        open={editOpen}
        title={t("projects.editProject")}
        description={t("projects.editDescription")}
        size="lg"
        onClose={() => setEditOpen(false)}
        onSubmit={editForm.handleSubmit((values) => saveProject.mutate(values))}
        submitLabel={t("projects.saveChanges")}
        pending={saveProject.isPending}
        error={messageFor(saveProject.error, t("projects.saveFailed"))}
      >
        <Field label={t("projects.fieldName")} error={editForm.formState.errors.name?.message} required>
          <Input aria-label={t("projects.fieldName")} data-autofocus="true" {...editForm.register("name")} />
        </Field>
        <Field label={t("projects.fieldStatus")} error={editForm.formState.errors.status?.message} required>
          <Select {...editForm.register("status")}>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
        <Field label={t("projects.fieldLocation")} error={editForm.formState.errors.locationName?.message}>
          <Input {...editForm.register("locationName")} />
        </Field>
        <div className="rect-projects-form__split">
          <Field label={t("projects.fieldStart")} error={editForm.formState.errors.plannedStartDate?.message}>
            <Input type="date" {...editForm.register("plannedStartDate")} />
          </Field>
          <Field label={t("projects.fieldFinish")} error={editForm.formState.errors.plannedFinishDate?.message}>
            <Input type="date" {...editForm.register("plannedFinishDate")} />
          </Field>
        </div>
        <Field label={t("projects.fieldDescription")} error={editForm.formState.errors.description?.message}>
          <Textarea rows={3} {...editForm.register("description")} />
        </Field>
      </FormDialog>

      <FormDialog
        open={memberOpen}
        title={t("projects.addMemberTitle")}
        description={t("projects.addMemberDescription")}
        onClose={() => setMemberOpen(false)}
        onSubmit={memberForm.handleSubmit((values) => addMember.mutate(values))}
        submitLabel={t("projects.addMember")}
        pending={addMember.isPending}
        submitDisabled={assignable.length === 0}
        error={messageFor(addMember.error, t("projects.addMemberFailed"))}
      >
        {directory.isLoading ? (
          <LoadingState title={t("projects.loadingPeople")} message={t("projects.loadingPeopleMessage")} />
        ) : assignable.length === 0 ? (
          <EmptyState
            title={t("projects.everyoneAssignedTitle")}
            message={t("projects.everyoneAssignedMessage")}
          />
        ) : (
          <>
            <Field label={t("projects.memberPerson")} error={memberForm.formState.errors.userId?.message} required>
              <Select aria-label={t("projects.memberPerson")} data-autofocus="true" {...memberForm.register("userId")}>
                <option value="">{t("projects.memberSelectPerson")}</option>
                {assignable.map((user) => (
                  <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("projects.memberRole")} error={memberForm.formState.errors.role?.message} required>
              <Select {...memberForm.register("role")}>
                {MEMBER_ROLES.map((role) => (
                  <option key={role} value={role}>{t(`enums.memberRole.${role}`)}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </FormDialog>

      <FormDialog
        open={stakeholderOpen}
        title={t("projects.addStakeholder")}
        description={t("projects.addStakeholderDescription")}
        size="lg"
        onClose={() => setStakeholderOpen(false)}
        onSubmit={stakeholderForm.handleSubmit((values) => addStakeholder.mutate(values))}
        submitLabel={t("projects.addStakeholder")}
        pending={addStakeholder.isPending}
        error={messageFor(addStakeholder.error, t("projects.addStakeholderFailed"))}
      >
        <Field label={t("projects.stakeholderName")} error={stakeholderForm.formState.errors.name?.message} required>
          <Input aria-label={t("projects.stakeholderName")} data-autofocus="true" {...stakeholderForm.register("name")} />
        </Field>
        <Field label={t("projects.stakeholderOrganization")} error={stakeholderForm.formState.errors.organization?.message}>
          <Input {...stakeholderForm.register("organization")} />
        </Field>
        <Field label={t("projects.stakeholderCategory")} error={stakeholderForm.formState.errors.category?.message} required>
          <Select {...stakeholderForm.register("category")}>
            {STAKEHOLDER_CATEGORIES.map((category) => (
              <option key={category} value={category}>{t(`enums.stakeholderCategory.${category}`)}</option>
            ))}
          </Select>
        </Field>
        <div className="rect-projects-form__split">
          <Field label={t("projects.stakeholderInfluence")} error={stakeholderForm.formState.errors.influence?.message}>
            <Select {...stakeholderForm.register("influence")}>
              {LEVELS.map((level) => <option key={level} value={level}>{t(`enums.level.${level}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("projects.stakeholderInterest")} error={stakeholderForm.formState.errors.interest?.message}>
            <Select {...stakeholderForm.register("interest")}>
              {LEVELS.map((level) => <option key={level} value={level}>{t(`enums.level.${level}`)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="rect-projects-form__split">
          <Field label={t("projects.stakeholderEmail")} error={stakeholderForm.formState.errors.email?.message}>
            <Input type="email" {...stakeholderForm.register("email")} />
          </Field>
          <Field label={t("projects.stakeholderPhone")} error={stakeholderForm.formState.errors.phone?.message}>
            <Input {...stakeholderForm.register("phone")} />
          </Field>
        </div>
        <Field label={t("projects.stakeholderNotes")} error={stakeholderForm.formState.errors.notes?.message}>
          <Textarea rows={3} {...stakeholderForm.register("notes")} />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={t("projects.removeMember")}
        onClose={() => setPendingRemoval(null)}
        onConfirm={() => pendingRemoval && removeMember.mutate(pendingRemoval.userId)}
        confirmLabel={t("projects.remove")}
        tone="danger"
        pending={removeMember.isPending}
      >
        <p>{t("projects.removeMemberBody", { name: pendingRemoval?.name ?? "" })}</p>
        {removeMember.error ? (
          <p className="rect-projects-form__error" role="alert">
            {messageFor(removeMember.error, t("projects.removeMemberFailed"))}
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={t("projects.deleteTitle")}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => removeProject.mutate()}
        confirmLabel={t("projects.deleteProject")}
        tone="danger"
        pending={removeProject.isPending}
      >
        <p>{t("projects.deleteBody", { name: record.name })}</p>
        {removeProject.error ? (
          <p className="rect-projects-form__error" role="alert">
            {messageFor(removeProject.error, t("projects.deleteFailed"))}
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingStakeholder !== null}
        title={t("projects.removeStakeholder")}
        onClose={() => setPendingStakeholder(null)}
        onConfirm={() => pendingStakeholder && removeStakeholder.mutate(pendingStakeholder.id)}
        confirmLabel={t("projects.remove")}
        tone="danger"
        pending={removeStakeholder.isPending}
      >
        <p>{t("projects.removeStakeholderBody", { name: pendingStakeholder?.name ?? "" })}</p>
        {removeStakeholder.error ? (
          <p className="rect-projects-form__error" role="alert">
            {messageFor(removeStakeholder.error, t("projects.removeStakeholderFailed"))}
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
