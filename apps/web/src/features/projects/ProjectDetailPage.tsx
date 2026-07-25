/**
 * Project workspace: overview, team, stakeholders, and activity for one real
 * project record. Every panel reads and writes the backend directly, and any
 * action the current user cannot perform is hidden rather than shown failing.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
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
} from "@/shared/ui";
import { adminApi } from "@/features/team/admin-api";
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
  updateProject,
  updateProjectMember,
  type ProjectMemberRole,
  type ProjectStakeholder,
  type StakeholderCategory,
} from "./project-api";
import "./ProjectsPage.css";

const MEMBER_ROLES: ReadonlyArray<{ value: ProjectMemberRole; label: string }> = [
  { value: "project_admin", label: "Project admin" },
  { value: "project_manager", label: "Project manager" },
  { value: "controls_manager", label: "Controls manager" },
  { value: "viewer", label: "Viewer" },
  { value: "external_collaborator", label: "External collaborator" },
];

const STAKEHOLDER_CATEGORIES: ReadonlyArray<{ value: StakeholderCategory; label: string }> = [
  { value: "client", label: "Client" },
  { value: "consultant", label: "Consultant" },
  { value: "contractor", label: "Contractor" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "supplier", label: "Supplier" },
  { value: "authority", label: "Authority" },
  { value: "community", label: "Community" },
  { value: "internal", label: "Internal" },
  { value: "other", label: "Other" },
];

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

function roleLabel(role: ProjectMemberRole): string {
  return MEMBER_ROLES.find((option) => option.value === role)?.label ?? role;
}

function categoryLabel(category: StakeholderCategory): string {
  return STAKEHOLDER_CATEGORIES.find((option) => option.value === category)?.label ?? category;
}

/** Turns an audit action key into a sentence a site manager can read. */
function activityLabel(action: string): string {
  const labels: Record<string, string> = {
    "project.create": "Created the project",
    "project.update": "Updated project details",
    "project.member.add": "Added a team member",
    "project.member.update": "Changed a team member's role",
    "project.member.remove": "Removed a team member",
    "project.stakeholder.create": "Added a stakeholder",
    "project.stakeholder.update": "Updated a stakeholder",
    "project.stakeholder.delete": "Removed a stakeholder",
  };
  return labels[action] ?? action;
}

function messageFor(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiClientError ? error.message : fallback;
}

export default function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [stakeholderOpen, setStakeholderOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ userId: string; name: string } | null>(null);
  const [pendingStakeholder, setPendingStakeholder] = useState<ProjectStakeholder | null>(null);

  const enabled = Boolean(projectId);
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => getProject(projectId), enabled });
  const access = useQuery({ queryKey: ["project", projectId, "access"], queryFn: () => getProjectAccess(projectId), enabled });
  const members = useQuery({ queryKey: ["project", projectId, "members"], queryFn: () => listProjectMembers(projectId), enabled });
  const stakeholders = useQuery({ queryKey: ["project", projectId, "stakeholders"], queryFn: () => listStakeholders(projectId), enabled });
  const activity = useQuery({ queryKey: ["project", projectId, "activity"], queryFn: () => listProjectActivity(projectId), enabled });

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

  const removeStakeholder = useMutation({
    mutationFn: (stakeholderId: string) => deleteStakeholder(projectId, stakeholderId),
    onSuccess: async () => { await refresh("stakeholders", "activity"); setPendingStakeholder(null); },
  });

  if (project.isLoading) return <LoadingState title="Loading project" message="Preparing the project workspace…" />;

  if (project.isError) {
    const notFound = project.error instanceof ApiClientError && project.error.status === 404;
    return (
      <ErrorState
        title={notFound ? "Project not available" : "Project could not be opened"}
        message={notFound
          ? "This project either does not exist or you do not have access to it."
          : "Something went wrong while loading this project. Please try again."}
        action={<Button variant="secondary" onClick={() => void project.refetch()}>Try again</Button>}
      />
    );
  }

  if (!record) return <EmptyState title="Project not available" message="This project could not be opened." />;

  const memberRows = members.data?.members ?? [];
  const stakeholderRows = stakeholders.data?.stakeholders ?? [];
  const activityRows = activity.data?.activity ?? [];
  const alreadyMembers = new Set(memberRows.map((member) => member.userId));
  const assignable = (directory.data?.users ?? []).filter((user) => !alreadyMembers.has(user.id));

  return (
    <section className="rect-project-detail" aria-label={record.name}>
      <Link className="rect-projects-link" to="/projects">← Projects</Link>

      <div className="rect-project-detail__header">
        <div>
          <h2>{record.name}</h2>
          <p>{record.code}</p>
        </div>
        <Toolbar>
          <Badge tone={record.status === "active" ? "success" : "neutral"}>
            {record.status.replace("_", " ")}
          </Badge>
          {canManage ? <Button variant="secondary" onClick={() => setEditOpen(true)}>Edit project</Button> : null}
          {canManage ? (
            <Link className="rect-ui-button rect-ui-button--secondary rect-ui-button--md" to={`/projects/${projectId}/settings`}>
              Project settings
            </Link>
          ) : null}
        </Toolbar>
      </div>

      <PageGrid columns={12}>
        <Card className="rect-project-detail__card"><h3>Location</h3><p>{record.locationName ?? "Not set"}</p></Card>
        <Card className="rect-project-detail__card">
          <h3>Planned dates</h3>
          <p>{record.plannedStartDate && record.plannedFinishDate ? `${record.plannedStartDate} → ${record.plannedFinishDate}` : "Not set"}</p>
        </Card>
        <Card className="rect-project-detail__card">
          <h3>Budget</h3>
          <p>{record.budgetAmount && record.budgetCurrency ? `${record.budgetAmount} ${record.budgetCurrency}` : "Not set"}</p>
        </Card>
      </PageGrid>

      <Card className="rect-project-detail__summary">
        <h3>Description</h3>
        <p>{record.description || "No description added yet."}</p>
      </Card>

      <Card className="rect-project-detail__panel">
        <div className="rect-project-detail__panel-head">
          <h3>Team</h3>
          {canManage ? <Button size="sm" variant="secondary" onClick={() => setMemberOpen(true)}>Add member</Button> : null}
        </div>
        {members.isLoading ? (
          <LoadingState title="Loading team" message="Fetching project members…" />
        ) : memberRows.length === 0 ? (
          <EmptyState
            title="No team members yet"
            message={canManage ? "Add people so they can reach this project." : "Team members will appear here once they are added."}
          />
        ) : (
          <DataTable
            caption="Project team"
            rows={memberRows}
            getRowKey={(member) => member.userId}
            columns={[
              { id: "name", header: "Name", accessor: (member) => member.displayName },
              { id: "email", header: "Email", accessor: (member) => member.email },
              {
                id: "role",
                header: "Role",
                accessor: (member) => canManage ? (
                  <Select
                    aria-label={`Role for ${member.displayName}`}
                    value={member.role}
                    disabled={changeRole.isPending}
                    onChange={(event) => changeRole.mutate({ userId: member.userId, role: event.target.value as ProjectMemberRole })}
                  >
                    {MEMBER_ROLES.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                ) : roleLabel(member.role),
              },
              ...(canManage ? [{
                id: "action",
                header: "Action",
                accessor: (member: (typeof memberRows)[number]) => (
                  <Button size="sm" variant="ghost" onClick={() => setPendingRemoval({ userId: member.userId, name: member.displayName })}>
                    Remove
                  </Button>
                ),
              }] : []),
            ]}
          />
        )}
        {changeRole.error ? <p className="rect-projects-form__error" role="alert">{messageFor(changeRole.error, "That role could not be changed.")}</p> : null}
      </Card>

      <Card className="rect-project-detail__panel">
        <div className="rect-project-detail__panel-head">
          <h3>Stakeholders</h3>
          {canManage ? <Button size="sm" variant="secondary" onClick={() => setStakeholderOpen(true)}>Add stakeholder</Button> : null}
        </div>
        {stakeholders.isLoading ? (
          <LoadingState title="Loading stakeholders" message="Fetching the stakeholder register…" />
        ) : stakeholderRows.length === 0 ? (
          <EmptyState
            title="No stakeholders yet"
            message={canManage ? "Record the clients, consultants, and authorities involved in this project." : "Stakeholders will appear here once they are added."}
          />
        ) : (
          <DataTable
            caption="Stakeholder register"
            rows={stakeholderRows}
            getRowKey={(item) => item.id}
            columns={[
              { id: "name", header: "Name", accessor: (item) => item.name },
              { id: "organization", header: "Organization", accessor: (item) => item.organization ?? "—" },
              { id: "category", header: "Category", accessor: (item) => categoryLabel(item.category) },
              { id: "influence", header: "Influence", accessor: (item) => item.influence },
              { id: "interest", header: "Interest", accessor: (item) => item.interest },
              ...(canManage ? [{
                id: "action",
                header: "Action",
                accessor: (item: ProjectStakeholder) => (
                  <Button size="sm" variant="ghost" onClick={() => setPendingStakeholder(item)}>Remove</Button>
                ),
              }] : []),
            ]}
          />
        )}
      </Card>

      <Card className="rect-project-detail__panel">
        <h3>Activity</h3>
        {activity.isLoading ? (
          <LoadingState title="Loading activity" message="Fetching the project history…" />
        ) : activityRows.length === 0 ? (
          <EmptyState title="No activity yet" message="Changes to this project will be recorded here." />
        ) : (
          <ul className="rect-project-activity">
            {activityRows.map((entry) => (
              <li key={entry.id} className="rect-project-activity__item">
                <span className="rect-project-activity__label">{activityLabel(entry.action)}</span>
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
        title="Edit project"
        description="Update the details shown across this project workspace."
        size="lg"
        onClose={() => setEditOpen(false)}
        onSubmit={editForm.handleSubmit((values) => saveProject.mutate(values))}
        submitLabel="Save changes"
        pending={saveProject.isPending}
        error={messageFor(saveProject.error, "This project could not be saved.")}
      >
        <Field label="Project name" error={editForm.formState.errors.name?.message} required>
          <Input aria-label="Project name" data-autofocus="true" {...editForm.register("name")} />
        </Field>
        <Field label="Status" error={editForm.formState.errors.status?.message} required>
          <Select {...editForm.register("status")}>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
        <Field label="Location" error={editForm.formState.errors.locationName?.message}>
          <Input {...editForm.register("locationName")} />
        </Field>
        <div className="rect-projects-form__split">
          <Field label="Start date" error={editForm.formState.errors.plannedStartDate?.message}>
            <Input type="date" {...editForm.register("plannedStartDate")} />
          </Field>
          <Field label="Finish date" error={editForm.formState.errors.plannedFinishDate?.message}>
            <Input type="date" {...editForm.register("plannedFinishDate")} />
          </Field>
        </div>
        <Field label="Description" error={editForm.formState.errors.description?.message}>
          <Textarea rows={3} {...editForm.register("description")} />
        </Field>
      </FormDialog>

      <FormDialog
        open={memberOpen}
        title="Add team member"
        description="Give someone in your company access to this project."
        onClose={() => setMemberOpen(false)}
        onSubmit={memberForm.handleSubmit((values) => addMember.mutate(values))}
        submitLabel="Add member"
        pending={addMember.isPending}
        submitDisabled={assignable.length === 0}
        error={messageFor(addMember.error, "That person could not be added.")}
      >
        {directory.isLoading ? (
          <LoadingState title="Loading people" message="Fetching your company directory…" />
        ) : assignable.length === 0 ? (
          <EmptyState
            title="Everyone is already on this project"
            message="Add more people to your company from the Team page before assigning them here."
          />
        ) : (
          <>
            <Field label="Person" error={memberForm.formState.errors.userId?.message} required>
              <Select aria-label="Person" data-autofocus="true" {...memberForm.register("userId")}>
                <option value="">Select a person</option>
                {assignable.map((user) => (
                  <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>
                ))}
              </Select>
            </Field>
            <Field label="Role" error={memberForm.formState.errors.role?.message} required>
              <Select {...memberForm.register("role")}>
                {MEMBER_ROLES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </FormDialog>

      <FormDialog
        open={stakeholderOpen}
        title="Add stakeholder"
        description="Record a party with an interest in this project."
        size="lg"
        onClose={() => setStakeholderOpen(false)}
        onSubmit={stakeholderForm.handleSubmit((values) => addStakeholder.mutate(values))}
        submitLabel="Add stakeholder"
        pending={addStakeholder.isPending}
        error={messageFor(addStakeholder.error, "That stakeholder could not be added.")}
      >
        <Field label="Name" error={stakeholderForm.formState.errors.name?.message} required>
          <Input aria-label="Name" data-autofocus="true" {...stakeholderForm.register("name")} />
        </Field>
        <Field label="Organization" error={stakeholderForm.formState.errors.organization?.message}>
          <Input {...stakeholderForm.register("organization")} />
        </Field>
        <Field label="Category" error={stakeholderForm.formState.errors.category?.message} required>
          <Select {...stakeholderForm.register("category")}>
            {STAKEHOLDER_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>
        <div className="rect-projects-form__split">
          <Field label="Influence" error={stakeholderForm.formState.errors.influence?.message}>
            <Select {...stakeholderForm.register("influence")}>
              {LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </Select>
          </Field>
          <Field label="Interest" error={stakeholderForm.formState.errors.interest?.message}>
            <Select {...stakeholderForm.register("interest")}>
              {LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </Select>
          </Field>
        </div>
        <div className="rect-projects-form__split">
          <Field label="Email" error={stakeholderForm.formState.errors.email?.message}>
            <Input type="email" {...stakeholderForm.register("email")} />
          </Field>
          <Field label="Phone" error={stakeholderForm.formState.errors.phone?.message}>
            <Input {...stakeholderForm.register("phone")} />
          </Field>
        </div>
        <Field label="Notes" error={stakeholderForm.formState.errors.notes?.message}>
          <Textarea rows={3} {...stakeholderForm.register("notes")} />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove team member"
        onClose={() => setPendingRemoval(null)}
        onConfirm={() => pendingRemoval && removeMember.mutate(pendingRemoval.userId)}
        confirmLabel="Remove"
        tone="danger"
        pending={removeMember.isPending}
      >
        <p>{pendingRemoval?.name} will lose access to this project.</p>
        {removeMember.error ? (
          <p className="rect-projects-form__error" role="alert">
            {messageFor(removeMember.error, "That person could not be removed.")}
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingStakeholder !== null}
        title="Remove stakeholder"
        onClose={() => setPendingStakeholder(null)}
        onConfirm={() => pendingStakeholder && removeStakeholder.mutate(pendingStakeholder.id)}
        confirmLabel="Remove"
        tone="danger"
        pending={removeStakeholder.isPending}
      >
        <p>{pendingStakeholder?.name} will be removed from the stakeholder register.</p>
        {removeStakeholder.error ? (
          <p className="rect-projects-form__error" role="alert">
            {messageFor(removeStakeholder.error, "That stakeholder could not be removed.")}
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
