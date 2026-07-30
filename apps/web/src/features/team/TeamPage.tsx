/**
 * Team administration: the company's people and the roles that decide what they
 * may do.
 *
 * People and roles are two different registers with two different jobs, so they
 * are switched between rather than shown side by side. Presenting them as equal
 * halves implied they carry equal weight; in practice a company reads the people
 * list constantly and edits roles a handful of times.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Rows3, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useOptionalAuth } from "@/shared/auth";
import {
  Avatar, Badge, Button, CardGrid, Checkbox, ConfirmDialog, DataTable, EmptyState,
  ErrorState, Field, FormDialog, Input, LoadingState, PageToolbar, StatCard, StatRow,
  Select,
  ViewToggle,
} from "@/shared/ui";
import { searchRecords } from "@/shared/search/match";
import { PermissionPicker } from "./PermissionPicker";
import { adminApi, type AdminUserRecord, type UserTypeRecord } from "./admin-api";
import "./TeamPage.css";

const userTypeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  key: z.string().trim().toLowerCase().min(2).max(64).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/u),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string()).min(1),
});

/** Editing a role cannot change its key: assignments and audit entries reference it. */
const editUserTypeSchema = userTypeSchema.omit({ key: true });

const userFields = z.object({
  displayName: z.string().trim().min(2).max(160),
  email: z.email().max(254),
  /**
   * Absent when the person is invited to choose their own, which is the better
   * path: a password an administrator picks is known to two people from the
   * moment it exists. Setting one stays available for companies without email.
   */
  password: z.string().max(256).optional(),
  invite: z.boolean(),
  /** Company standing. One value, never a set. */
  standing: z.enum(["owner", "admin", "member", "guest"]),
  /*
   * Not `min(1)`. An owner or administrator holds every permission by standing,
   * so requiring a user type of them demanded a choice that changed nothing —
   * the redundancy the owner reported. The rule that a *member* needs at least
   * one is expressed below, where the standing is in scope.
   */
  userTypeIds: z.array(z.string()),
});

/**
 * The password rule applies only when a password is actually being collected.
 * It lives on a separate schema because a refined object cannot be narrowed,
 * and the edit form needs to narrow this one.
 */
/** Everyone whose access comes from user types must be given at least one. */
function requireTypesUnlessAdministering(
  value: { standing: string; userTypeIds: string[] },
  context: z.RefinementCtx,
): void {
  if (value.standing === "owner" || value.standing === "admin") return;
  if (value.userTypeIds.length === 0) {
    context.addIssue({ code: "custom", path: ["userTypeIds"], message: "required" });
  }
}

const userSchema = userFields.superRefine((value, context) => {
  requireTypesUnlessAdministering(value, context);
  if (value.invite) return;
  const password = value.password ?? "";
  const strong =
    password.length >= 12 &&
    /[a-z]/u.test(password) &&
    /[A-Z]/u.test(password) &&
    /[0-9]/u.test(password);
  if (!strong) {
    context.addIssue({ code: "custom", path: ["password"], message: "weak" });
  }
});

/** Email is the sign-in identity; a password is not reset by editing a profile. */
const editUserSchema = userFields
  .omit({ email: true, password: true, invite: true })
  .superRefine(requireTypesUnlessAdministering);

type UserTypeForm = z.infer<typeof userTypeSchema>;
type EditUserTypeForm = z.infer<typeof editUserTypeSchema>;
type UserForm = z.infer<typeof userSchema>;
type EditUserForm = z.infer<typeof editUserSchema>;

type Segment = "users" | "types";
type ViewMode = "cards" | "table";

const VIEW_STORAGE_KEY = "rectangle.team.view";

function readStoredView(): ViewMode {
  if (typeof window === "undefined") return "cards";
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

function storeView(value: ViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, value);
  } catch {
    /* Private browsing must not break the toggle. */
  }
}

/**
 * The permissions a set of user types would actually grant, together.
 *
 * Shown live while the boxes are ticked. Without it an administrator sees the
 * types they chose but never the combination those types produce, which is how
 * somebody quietly ends up with `settings.manage` from two innocuous-looking
 * roles.
 */
function effectivePermissions(
  selectedIds: string[],
  types: UserTypeRecord[],
): Array<{ key: string; from: string[] }> {
  const byPermission = new Map<string, string[]>();

  for (const type of types.filter((candidate) => selectedIds.includes(candidate.id))) {
    for (const permission of type.permissions) {
      const sources = byPermission.get(permission) ?? [];
      sources.push(type.name);
      byPermission.set(permission, sources);
    }
  }

  return [...byPermission.entries()]
    .map(([key, from]) => ({ key, from }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Owners and admins hold everything by standing, whatever their types say. */
function standingGrantsEverything(standing: string): boolean {
  return standing === "owner" || standing === "admin";
}

/** A built-in role keeps its translated name; a company's own role keeps its own. */
function roleName(type: { name: string; key: string; systemType?: boolean }, t: TFunction): string {
  return type.systemType ? t(`enums.systemUserType.${type.key}`, { defaultValue: type.name }) : type.name;
}

export default function TeamPage() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  /*
   * One flag per action. The API gates each of these separately now, so the
   * interface has to as well — a button whose request the server would refuse
   * is worse than no button, because the person cannot tell which of the two
   * is broken.
   */
  const isOwner = auth?.user?.roles.includes("owner") ?? false;
  const isTenantAdmin =
    auth?.user?.roles.some((role) => ["owner", "admin"].includes(role)) ?? false;
  const held = (permission: string) =>
    isTenantAdmin || (auth?.user?.permissions.includes(permission) ?? false);
  const canAddUsers = held("users.create");
  const canEditUsers = held("users.edit");
  const canDisableUsers = held("users.disable");
  const canAddRoles = held("user_types.create");
  const canEditRoles = held("user_types.edit");

  const [segment, setSegment] = useState<Segment>("users");
  const [view, setView] = useState<ViewMode>(() => readStoredView());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  /**
   * Roles keep their own search and filter, rather than sharing the people
   * ones. Sharing would carry a name typed against people over to a register
   * it means nothing in, and silently narrow it.
   */
  const [roleSearch, setRoleSearch] = useState("");
  const [roleOriginFilter, setRoleOriginFilter] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserRecord | null>(null);
  const [editingType, setEditingType] = useState<UserTypeRecord | null>(null);
  const [pendingDisable, setPendingDisable] = useState<AdminUserRecord | null>(null);

  const queryClient = useQueryClient();
  const permissions = useQuery({ queryKey: ["admin", "permissions"], queryFn: adminApi.permissions });
  const userTypes = useQuery({ queryKey: ["admin", "user-types"], queryFn: adminApi.userTypes });
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users });

  const typeForm = useForm<UserTypeForm>({ resolver: zodResolver(userTypeSchema), defaultValues: { name: "", key: "", description: "", permissions: [] } });
  const userForm = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { displayName: "", email: "", password: "", invite: true, standing: "member", userTypeIds: [] },
  });
  const editUserForm = useForm<EditUserForm>({ resolver: zodResolver(editUserSchema), defaultValues: { displayName: "", standing: "member", userTypeIds: [] } });
  const editTypeForm = useForm<EditUserTypeForm>({ resolver: zodResolver(editUserTypeSchema), defaultValues: { name: "", description: "", permissions: [] } });

  // The edit forms are filled from the record being edited rather than from the
  // last submission, so reopening never shows a previous person's details.
  useEffect(() => {
    if (editingUser) {
      editUserForm.reset({
        displayName: editingUser.displayName,
        standing: editingUser.standing,
        userTypeIds: editingUser.userTypes.map((type) => type.id),
      });
    }
  }, [editingUser, editUserForm]);

  useEffect(() => {
    if (editingType) {
      editTypeForm.reset({
        name: editingType.name,
        description: editingType.description ?? "",
        permissions: [...editingType.permissions],
      });
    }
  }, [editingType, editTypeForm]);

  const invalidate = (key: string) => queryClient.invalidateQueries({ queryKey: ["admin", key] });

  const createType = useMutation({
    mutationFn: adminApi.createUserType,
    onSuccess: async () => { await invalidate("user-types"); typeForm.reset(); setTypeOpen(false); },
  });
  const createUser = useMutation({
    mutationFn: (values: UserForm) =>
      adminApi.createUser({
        displayName: values.displayName,
        email: values.email,
        userTypeIds: values.userTypeIds,
        standing: values.standing,
        ...(values.invite ? {} : { password: values.password ?? "" }),
      }),
    onSuccess: async () => { await invalidate("users"); userForm.reset(); setUserOpen(false); },
  });
  const saveUser = useMutation({
    mutationFn: ({ userId, values }: { userId: string; values: EditUserForm }) => adminApi.updateUser(userId, values),
    onSuccess: async () => { await invalidate("users"); setEditingUser(null); },
  });
  const saveType = useMutation({
    mutationFn: ({ userTypeId, values }: { userTypeId: string; values: EditUserTypeForm }) => adminApi.updateUserType(userTypeId, values),
    onSuccess: async () => { await invalidate("user-types"); setEditingType(null); },
  });
  const setStatus = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: "active" | "disabled" }) => adminApi.updateUser(userId, { status }),
    onSuccess: async () => { await invalidate("users"); setPendingDisable(null); },
  });

  const messageFor = (error: unknown, fallback: string) =>
    error instanceof ApiClientError ? error.message : error ? fallback : null;

  const typeRows = useMemo(() => userTypes.data?.userTypes ?? [], [userTypes.data]);
  const allUsers = useMemo(() => users.data?.users ?? [], [users.data]);

  /*
   * Filtered here rather than through the API, and searched with the shared
   * rules rather than `includes`.
   *
   * In the browser because this page already downloads every person with no
   * limit, so there is nothing a round trip would find that is not already
   * here — unlike projects or tasks, which arrive a page at a time and must be
   * searched where the whole set lives. What must not differ is the behaviour,
   * so the matching itself comes from the module the SQL engine is checked
   * against: same Arabic folding, same typo tolerance, same operators.
   */
  const filteredUsers = useMemo(() => {
    const narrowed = allUsers.filter((user) => {
      if (statusFilter && user.status !== statusFilter) return false;
      if (typeFilter && !user.userTypes.some((type) => type.id === typeFilter)) return false;
      return true;
    });
    return searchRecords(narrowed, search, (user) => [user.displayName, user.email]);
  }, [allUsers, search, statusFilter, typeFilter]);

  /**
   * Roles are searched in the browser for the same reason people are: the whole
   * set is already loaded and a company has a handful of them. The rules are
   * the shared ones, so a role is found the same way a project is.
   */
  const filteredTypes = useMemo(() => {
    const narrowed = typeRows.filter((type) => {
      if (roleOriginFilter === "system" && !type.systemType) return false;
      if (roleOriginFilter === "custom" && type.systemType) return false;
      return true;
    });
    return searchRecords(narrowed, roleSearch, (type) => [
      roleName(type, t),
      type.key,
      type.description ?? "",
    ]);
  }, [typeRows, roleSearch, roleOriginFilter, t]);

  const activeCount = allUsers.filter((user) => user.status === "active").length;
  const disabledCount = allUsers.filter((user) => user.status === "disabled").length;
  const withoutRole = allUsers.filter((user) => user.userTypes.length === 0).length;

  if (userTypes.isLoading || users.isLoading) {
    return <LoadingState title={t("team.loadingTitle")} message={t("team.loadingMessage")} />;
  }

  if (userTypes.isError || users.isError) {
    return (
      <ErrorState
        title={t("team.errorTitle")}
        message={t("team.errorMessage")}
        action={
          <Button variant="secondary" onClick={() => { void userTypes.refetch(); void users.refetch(); }}>
            {t("team.tryAgain")}
          </Button>
        }
      />
    );
  }

  const permissionOptions = permissions.data?.permissions ?? [];
  const showingUsers = segment === "users";

  return (
    <section className="rect-team-page" aria-label={t("team.pageLabel")}>
      <PageToolbar<ViewMode>
        /*
         * The register picker sits beside the view toggle rather than leading
         * the row. Both answer "how am I looking at this page"; search and
         * filters answer "which records", which is a different question.
         *
         * The toolbar keeps the same shape on both registers. Withdrawing the
         * search and the view toggle on Roles rebuilt the row on every switch,
         * and left people's filters applied but invisible — a list narrowed by
         * a control the user can no longer see reads as missing data.
         */
        register={
          <ViewToggle<Segment>
            label={t("team.segmentLabel")}
            value={segment}
            onChange={setSegment}
            showLabels
            options={[
              { value: "users", label: t("team.segmentUsers"), icon: <Users size={16} strokeWidth={2} aria-hidden /> },
              { value: "types", label: t("team.segmentTypes"), icon: <ShieldCheck size={16} strokeWidth={2} aria-hidden /> },
            ]}
          />
        }
        search={
          showingUsers
            ? {
                value: search,
                onChange: setSearch,
                label: t("team.searchLabel"),
                placeholder: t("team.searchPlaceholder"),
              }
            : {
                value: roleSearch,
                onChange: setRoleSearch,
                label: t("team.searchRolesLabel"),
                placeholder: t("team.searchRolesPlaceholder"),
              }
        }
        filters={
          showingUsers
            ? [
                {
                  id: "type",
                  type: "select" as const,
                  label: t("team.filterType"),
                  anyLabel: t("team.allTypes"),
                  value: typeFilter,
                  options: typeRows.map((type) => ({ value: type.id, label: roleName(type, t) })),
                  onChange: setTypeFilter,
                },
                {
                  id: "status",
                  type: "select" as const,
                  label: t("team.filterStatus"),
                  anyLabel: t("team.allStatuses"),
                  value: statusFilter,
                  options: [
                    { value: "active", label: t("enums.userStatus.active") },
                    { value: "disabled", label: t("enums.userStatus.disabled") },
                  ],
                  onChange: setStatusFilter,
                },
              ]
            : [
                {
                  id: "origin",
                  type: "select" as const,
                  label: t("team.filterOrigin"),
                  anyLabel: t("team.allOrigins"),
                  value: roleOriginFilter,
                  options: [
                    { value: "system", label: t("team.originSystem") },
                    { value: "custom", label: t("team.originCustom") },
                  ],
                  onChange: setRoleOriginFilter,
                },
              ]
        }
        onClearFilters={
          showingUsers
            ? () => { setSearch(""); setTypeFilter(""); setStatusFilter(""); }
            : () => { setRoleSearch(""); setRoleOriginFilter(""); }
        }
        view={{
          value: view,
          label: t("team.cardView"),
          onChange: (next: ViewMode) => { setView(next); storeView(next); },
          options: [
            { value: "cards" as const, label: t("team.cardView"), icon: <LayoutGrid size={16} strokeWidth={2} aria-hidden /> },
            { value: "table" as const, label: t("team.tableView"), icon: <Rows3 size={16} strokeWidth={2} aria-hidden /> },
          ],
        }}
        actions={
          (showingUsers ? canAddUsers : canAddRoles) ? (
            showingUsers ? (
              <Button
                variant="primary"
                onClick={() => setUserOpen(true)}
                disabled={typeRows.length === 0}
                {...(typeRows.length === 0 ? { title: t("team.needTypeFirst") } : {})}
              >
                {t("team.createUser")}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setTypeOpen(true)}>{t("team.createUserType")}</Button>
            )
          ) : null
        }
      />

      {allUsers.length > 0 ? (
        <StatRow label={t("team.pageLabel")}>
          <StatCard
            label={t("team.kpiPeople")}
            value={allUsers.length}
            {...(withoutRole > 0 ? { hint: t("team.kpiNoRole", { count: withoutRole }) } : {})}
          />
          <StatCard label={t("team.kpiActive")} value={activeCount} emphasis />
          <StatCard label={t("team.kpiDisabled")} value={disabledCount} />
          <StatCard label={t("team.kpiRoles")} value={typeRows.length} />
        </StatRow>
      ) : null}

      {showingUsers ? (
        allUsers.length === 0 ? (
          <EmptyState
            title={t("team.noUsersTitle")}
            message={canAddUsers ? t("team.noUsersMessage") : t("team.readOnlyMessage")}
            {...(canAddUsers && typeRows.length > 0
              ? { action: <Button variant="primary" onClick={() => setUserOpen(true)}>{t("team.createUser")}</Button> }
              : {})}
          />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title={t("team.noMatchTitle")}
            message={t("team.noMatchMessage")}
            action={
              <Button variant="secondary" onClick={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); }}>
                {t("team.clearFilters")}
              </Button>
            }
          />
        ) : view === "cards" ? (
          <CardGrid label={t("team.usersTitle")}>
            {filteredUsers.map((user) => (
              <article key={user.id} className="rect-person" role="listitem">
                <header className="rect-person__head">
                  <Avatar name={user.displayName} colorKey={user.id} />
                  <span className="rect-person__identity">
                    <span className="rect-person__name">{user.displayName}</span>
                    <span className="rect-person__email">{user.email}</span>
                  </span>
                  {/* Standing is a different kind of thing from a user type,
                      so it reads differently. It was previously invisible. */}
                  {user.standing !== "member" ? (
                    <Badge tone={user.standing === "owner" ? "warning" : "info"}>
                      {t(`team.standing_${user.standing}`)}
                    </Badge>
                  ) : null}
                  <Badge tone={user.status === "active" ? "success" : "neutral"}>
                    {t(`enums.userStatus.${user.status}`)}
                  </Badge>
                </header>

                <div className="rect-person__roles">
                  {user.userTypes.length === 0 ? (
                    <span className="rect-person__norole">{t("team.noRole")}</span>
                  ) : (
                    user.userTypes.map((type) => (
                      <Badge key={type.id} tone="info">{roleName(type, t)}</Badge>
                    ))
                  )}
                </div>

                <footer className="rect-person__foot">
                  <span className="rect-person__meta">
                    {t("team.userProjectCount", { count: user.projectCount })}
                  </span>
                  {canEditUsers || canDisableUsers ? (
                    <span className="rect-person__actions">
                      {canEditUsers ? (
                        <Button size="sm" variant="secondary" onClick={() => setEditingUser(user)}>{t("team.edit")}</Button>
                      ) : null}
                      {canDisableUsers ? (
                        user.status === "active" ? (
                          <Button size="sm" variant="secondary" onClick={() => setPendingDisable(user)}>{t("team.disable")}</Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ userId: user.id, status: "active" })}>
                            {t("team.enableAction")}
                          </Button>
                        )
                      ) : null}
                    </span>
                  ) : null}
                </footer>
              </article>
            ))}
          </CardGrid>
        ) : (
          <DataTable
            caption={t("team.usersTitle")}
            rows={filteredUsers}
            getRowKey={(row) => row.id}
            columns={[
              {
                id: "name",
                header: t("team.userName"),
                accessor: (row) => (
                  <span className="rect-person__cell">
                    <Avatar name={row.displayName} colorKey={row.id} size="sm" />
                    <span>{row.displayName}</span>
                  </span>
                ),
              },
              { id: "email", header: t("team.userEmail"), accessor: (row) => row.email },
              {
                id: "standing",
                header: t("team.fieldStanding"),
                accessor: (row) => t(`team.standing_${row.standing}`),
              },
              {
                id: "types",
                header: t("team.userTypes"),
                accessor: (row) =>
                  row.userTypes.length === 0
                    ? t("team.noRole")
                    : row.userTypes.map((type) => roleName(type, t)).join(t("common.listSeparator")),
              },
              { id: "projects", header: t("team.userProjects"), accessor: (row) => row.projectCount },
              {
                id: "status",
                header: t("team.userStatus"),
                accessor: (row) => (
                  <Badge tone={row.status === "active" ? "success" : "neutral"}>
                    {t(`enums.userStatus.${row.status}`)}
                  </Badge>
                ),
              },
              ...(canEditUsers || canDisableUsers
                ? [{
                    id: "action",
                    header: t("team.userAction"),
                    accessor: (row: AdminUserRecord) => (
                      <span className="rect-person__actions">
                        {canEditUsers ? (
                          <Button size="sm" variant="secondary" onClick={() => setEditingUser(row)}>{t("team.edit")}</Button>
                        ) : null}
                        {canDisableUsers ? (
                          row.status === "active" ? (
                            <Button size="sm" variant="secondary" onClick={() => setPendingDisable(row)}>{t("team.disable")}</Button>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ userId: row.id, status: "active" })}>
                              {t("team.enableAction")}
                            </Button>
                          )
                        ) : null}
                      </span>
                    ),
                  }]
                : []),
            ]}
            emptyMessage={t("team.noUsers")}
          />
        )
      ) : typeRows.length === 0 ? (
        <EmptyState
          title={t("team.noUserTypesTitle")}
          message={canAddRoles ? t("team.noUserTypesMessage") : t("team.readOnlyMessage")}
          {...(canAddRoles
            ? { action: <Button variant="primary" onClick={() => setTypeOpen(true)}>{t("team.createUserType")}</Button> }
            : {})}
        />
      ) : filteredTypes.length === 0 ? (
        <EmptyState
          title={t("team.noRoleMatchTitle")}
          message={t("team.noRoleMatchMessage")}
          action={
            <Button variant="secondary" onClick={() => { setRoleSearch(""); setRoleOriginFilter(""); }}>
              {t("team.clearFilters")}
            </Button>
          }
        />
      ) : view === "table" ? (
        <DataTable
          caption={t("team.userTypesTitle")}
          rows={filteredTypes}
          getRowKey={(row) => row.id}
          columns={[
            { id: "name", header: t("team.userTypeName"), accessor: (row) => roleName(row, t) },
            { id: "key", header: t("team.userTypeKey"), accessor: (row) => row.key },
            {
              id: "permissions",
              header: t("team.userTypePermissions"),
              accessor: (row) =>
                row.permissions
                  .map((permission) => permissionOptions.find((option) => option.key === permission)?.label ?? permission)
                  .join(t("common.listSeparator")),
            },
            {
              id: "origin",
              header: t("team.filterOrigin"),
              accessor: (row) => (
                <Badge tone="neutral">{row.systemType ? t("team.originSystem") : t("team.originCustom")}</Badge>
              ),
            },
            ...(canEditRoles
              ? [{
                  id: "action",
                  header: t("team.userAction"),
                  accessor: (row: UserTypeRecord) => (
                    <Button size="sm" variant="secondary" onClick={() => setEditingType(row)}>{t("team.edit")}</Button>
                  ),
                }]
              : []),
          ]}
          emptyMessage={t("team.noUserTypes")}
        />
      ) : (
        <CardGrid label={t("team.userTypesTitle")}>
          {filteredTypes.map((type) => (
            <article key={type.id} className="rect-role" role="listitem">
              <header className="rect-role__head">
                <span className="rect-role__name">{roleName(type, t)}</span>
                {type.systemType ? <Badge tone="neutral">{t("team.systemRole")}</Badge> : null}
              </header>
              {type.description ? <p className="rect-role__description">{type.description}</p> : null}
              <div className="rect-role__permissions">
                {/* Naming the permissions is the point; a bare count says nothing. */}
                {type.permissions.map((permission) => (
                  <span key={permission} className="rect-role__permission">
                    {permissionOptions.find((option) => option.key === permission)?.label ?? permission}
                  </span>
                ))}
              </div>
              <footer className="rect-role__foot">
                <span className="rect-role__meta">{t("team.permissionCount", { count: type.permissions.length })}</span>
                {canEditRoles ? (
                  <Button size="sm" variant="secondary" onClick={() => setEditingType(type)}>{t("team.edit")}</Button>
                ) : null}
              </footer>
            </article>
          ))}
        </CardGrid>
      )}

      <FormDialog
        open={typeOpen}
        title={t("team.createUserType")}
        description={t("team.createUserTypeDescription")}
        onClose={() => setTypeOpen(false)}
        onSubmit={typeForm.handleSubmit((values) => createType.mutate(values))}
        submitLabel={t("team.createUserType")}
        pending={createType.isPending}
        error={messageFor(createType.error, t("team.createUserTypeFailed"))}
      >
        <Field label={t("team.fieldName")} error={typeForm.formState.errors.name?.message} required><Input data-autofocus="true" {...typeForm.register("name")} /></Field>
        <Field label={t("team.fieldKey")} error={typeForm.formState.errors.key?.message} required><Input {...typeForm.register("key")} /></Field>
        <Field label={t("team.fieldDescription")} error={typeForm.formState.errors.description?.message}><Input {...typeForm.register("description")} /></Field>
        <Field label={t("team.fieldPermissions")} hint={t("team.permissionsHint")} error={typeForm.formState.errors.permissions?.message} required>
          <PermissionPicker
            options={permissionOptions}
            value={typeForm.watch("permissions") ?? []}
            onChange={(next) => typeForm.setValue("permissions", next, { shouldValidate: true })}
          />
        </Field>
      </FormDialog>

      <FormDialog
        open={editingType !== null}
        title={t("team.editUserType")}
        description={t("team.editUserTypeDescription")}
        onClose={() => setEditingType(null)}
        onSubmit={editTypeForm.handleSubmit((values) => {
          if (editingType) saveType.mutate({ userTypeId: editingType.id, values });
        })}
        submitLabel={t("team.saveChanges")}
        pending={saveType.isPending}
        error={messageFor(saveType.error, t("team.updateUserTypeFailed"))}
      >
        <Field label={t("team.fieldName")} error={editTypeForm.formState.errors.name?.message} required><Input data-autofocus="true" {...editTypeForm.register("name")} /></Field>
        <Field label={t("team.fieldDescription")} error={editTypeForm.formState.errors.description?.message}><Input {...editTypeForm.register("description")} /></Field>
        <Field label={t("team.fieldPermissions")} hint={t("team.permissionsHint")} error={editTypeForm.formState.errors.permissions?.message} required>
          <PermissionPicker
            options={permissionOptions}
            value={editTypeForm.watch("permissions") ?? []}
            onChange={(next) => editTypeForm.setValue("permissions", next, { shouldValidate: true })}
          />
        </Field>
      </FormDialog>

      <FormDialog
        open={userOpen}
        title={t("team.createUser")}
        description={t("team.createUserDescription")}
        onClose={() => setUserOpen(false)}
        onSubmit={userForm.handleSubmit((values) => createUser.mutate(values))}
        submitLabel={t("team.createUser")}
        pending={createUser.isPending}
        error={messageFor(createUser.error, t("team.createUserFailed"))}
      >
        <Field label={t("team.fieldName")} error={userForm.formState.errors.displayName?.message} required><Input data-autofocus="true" {...userForm.register("displayName")} /></Field>
        <Field label={t("team.fieldEmail")} error={userForm.formState.errors.email?.message} required><Input type="email" {...userForm.register("email")} /></Field>
        <Field label={t("team.inviteLabel")} hint={t("team.inviteHint")}>
          <Checkbox label={t("team.inviteOption")} {...userForm.register("invite")} />
        </Field>
        {!userForm.watch("invite") ? (
          <Field
            label={t("team.fieldTemporaryPassword")}
            hint={t("team.passwordRule")}
            error={userForm.formState.errors.password ? t("team.passwordWeak") : undefined}
            required
          >
            <Input type="password" autoComplete="new-password" {...userForm.register("password")} />
          </Field>
        ) : null}
        <Field
          label={t("team.fieldStanding")}
          hint={t("team.standingHint")}
          error={userForm.formState.errors.standing?.message}
          required
        >
          <Select {...userForm.register("standing")}>
            {/* Only an owner may mint another owner; the API refuses it too. */}
            {(isOwner ? ["owner", "admin", "member", "guest"] : ["admin", "member", "guest"]).map((value) => (
              <option key={value} value={value}>{t(`team.standing_${value}`)}</option>
            ))}
          </Select>
        </Field>
        {/*
          * Hidden for owners and administrators, and this is the confusion the
          * owner reported. Their standing already carries every permission, so
          * the form was demanding a second choice that changed nothing and then
          * reporting, truthfully, that the choice had changed nothing. The
          * question is only asked of the people whose access actually depends
          * on the answer.
          */}
        {standingGrantsEverything(userForm.watch("standing")) ? null : (
          <Field label={t("team.userTypes")} hint={t("team.userTypesHint")} error={userForm.formState.errors.userTypeIds?.message} required>
            <div className="rect-team-permissions">
              {typeRows.map((type) => (
                <Checkbox key={type.id} label={roleName(type, t)} {...(type.description ? { description: type.description } : {})} value={type.id} {...userForm.register("userTypeIds")} />
              ))}
            </div>
          </Field>
        )}
        <Field label={t("team.effectiveTitle")} hint={t("team.effectiveHint")}>
          <div className="rect-team-effective">
            {standingGrantsEverything(userForm.watch("standing")) ? (
              <p className="rect-panel-note">{t("team.effectiveEverything")}</p>
            ) : effectivePermissions(userForm.watch("userTypeIds") ?? [], typeRows).length === 0 ? (
              <p className="rect-panel-note">{t("team.effectiveNone")}</p>
            ) : (
              <ul className="rect-team-effective__list">
                {effectivePermissions(userForm.watch("userTypeIds") ?? [], typeRows).map((entry) => (
                  <li key={entry.key} className="rect-team-effective__item">
                    <span className="rect-team-effective__name">
                      {permissionOptions.find((option) => option.key === entry.key)?.label ?? entry.key}
                    </span>
                    {/* Naming the source is what makes an unexpected grant traceable. */}
                    <span className="rect-team-effective__source">{entry.from.join(t("common.listSeparator"))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>
      </FormDialog>

      <FormDialog
        open={editingUser !== null}
        title={t("team.editUser")}
        description={t("team.editUserDescription")}
        onClose={() => setEditingUser(null)}
        onSubmit={editUserForm.handleSubmit((values) => {
          if (editingUser) saveUser.mutate({ userId: editingUser.id, values });
        })}
        submitLabel={t("team.saveChanges")}
        pending={saveUser.isPending}
        error={messageFor(saveUser.error, t("team.updateUserFailed"))}
      >
        <Field label={t("team.fieldName")} error={editUserForm.formState.errors.displayName?.message} required><Input data-autofocus="true" {...editUserForm.register("displayName")} /></Field>
        <Field
          label={t("team.fieldStanding")}
          hint={t("team.standingHint")}
          error={editUserForm.formState.errors.standing?.message}
          required
        >
          <Select {...editUserForm.register("standing")}>
            {/* Only an owner may mint another owner; the API refuses it too. */}
            {(isOwner ? ["owner", "admin", "member", "guest"] : ["admin", "member", "guest"]).map((value) => (
              <option key={value} value={value}>{t(`team.standing_${value}`)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("team.userTypes")} error={editUserForm.formState.errors.userTypeIds?.message} required>
          <div className="rect-team-permissions">
            {typeRows.map((type) => (
              <Checkbox key={type.id} label={roleName(type, t)} {...(type.description ? { description: type.description } : {})} value={type.id} {...editUserForm.register("userTypeIds")} />
            ))}
          </div>
        </Field>
        <Field label={t("team.effectiveTitle")} hint={t("team.effectiveHint")}>
          <div className="rect-team-effective">
            {standingGrantsEverything(editUserForm.watch("standing")) ? (
              <p className="rect-panel-note">{t("team.effectiveEverything")}</p>
            ) : effectivePermissions(editUserForm.watch("userTypeIds") ?? [], typeRows).length === 0 ? (
              <p className="rect-panel-note">{t("team.effectiveNone")}</p>
            ) : (
              <ul className="rect-team-effective__list">
                {effectivePermissions(editUserForm.watch("userTypeIds") ?? [], typeRows).map((entry) => (
                  <li key={entry.key} className="rect-team-effective__item">
                    <span className="rect-team-effective__name">
                      {permissionOptions.find((option) => option.key === entry.key)?.label ?? entry.key}
                    </span>
                    {/* Naming the source is what makes an unexpected grant traceable. */}
                    <span className="rect-team-effective__source">{entry.from.join(t("common.listSeparator"))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>
      </FormDialog>

      {/* Disabling locks someone out, so it is confirmed; enabling is one click. */}
      <ConfirmDialog
        open={pendingDisable !== null}
        title={t("team.disableTitle")}
        description={t("team.disableMessage", { name: pendingDisable?.displayName ?? "" })}
        confirmLabel={t("team.disableConfirm")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        pending={setStatus.isPending}
        onClose={() => setPendingDisable(null)}
        onConfirm={() => {
          if (pendingDisable) setStatus.mutate({ userId: pendingDisable.id, status: "disabled" });
        }}
      />
    </section>
  );
}
