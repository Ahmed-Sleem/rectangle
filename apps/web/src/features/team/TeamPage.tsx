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
import { useForm, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useOptionalAuth } from "@/shared/auth";
import {
  Button, CardGrid, Checkbox, ConfirmDialog, DataTable, EmptyState,
  ErrorState, Field, FormDialog, Input, LoadingState, PageToolbar, StatCard, StatRow,
  ViewToggle,
} from "@/shared/ui";
import { searchRecords } from "@/shared/search/match";
import { AccessFields, type AccessFormValues } from "./AccessFields";
import { PeopleDirectory } from "./PeopleDirectory";
import { PermissionPicker } from "./PermissionPicker";
import { adminApi, type UserTypeRecord } from "./admin-api";
import { directoryApi, type DirectoryPerson } from "./directory-api";
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
  standing: z.enum(["owner", "none"]),
  /*
   * Deliberately not `min(1)`. Somebody added so they can be put on a project
   * holds nothing company-wide, and their membership is what gives them their
   * work — demanding a tick here would grant access nobody asked for.
   */
  permissions: z.array(z.string()),
});

/**
 * The password rule applies only when a password is actually being collected.
 * It lives on a separate schema because a refined object cannot be narrowed,
 * and the edit form needs to narrow this one.
 */
const userSchema = userFields.superRefine((value, context) => {
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
const editUserSchema = userFields.omit({ email: true, password: true, invite: true });

type UserTypeForm = z.infer<typeof userTypeSchema>;
type EditUserTypeForm = z.infer<typeof editUserTypeSchema>;
type UserForm = z.infer<typeof userSchema>;
type EditUserForm = z.infer<typeof editUserSchema>;

/**
 * Two registers.
 *
 * People is open to everyone — it shows the whole company to somebody holding
 * `users.read` and the caller's colleagues to everybody else, which membership
 * already discloses. Roles administers user types and needs
 * `user_types.read`. There was briefly a third, a "Directory" that listed the
 * same people again; it is gone.
 */
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
 * A bundle's name.
 *
 * Every bundle is now a company's own, so there is nothing to translate: the
 * product no longer ships any. Kept as a function because the name is read in
 * several places and a company later importing a standard set would want one
 * place to change.
 */
function roleName(type: { name: string }): string {
  return type.name;
}

/** Owners hold every permission by standing, so the list alone is not the answer. */
function holds(person: DirectoryPerson, permission: string): boolean {
  return person.standing === "owner" || person.permissions.includes(permission);
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
  const held = (permission: string) =>
    isOwner || (auth?.user?.permissions.includes(permission) ?? false);
  const canAddUsers = held("users.create");
  const canEditUsers = held("users.edit");
  const canDisableUsers = held("users.disable");
  const canAddRoles = held("user_types.create");
  const canEditRoles = held("user_types.edit");

  const canReadTypes = held("user_types.read");

  /*
   * Opens on the register the viewer can actually use. Defaulting to `users`
   * showed a permission refusal as the first thing a site engineer saw on the
   * page, which is both useless and wrong: the directory below it was theirs
   * all along.
   */
  const [segment, setSegment] = useState<Segment>("users");
  const [view, setView] = useState<ViewMode>(() => readStoredView());
  const [search, setSearch] = useState("");
  const [permissionFilter, setPermissionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  /**
   * Roles keep their own search and filter, rather than sharing the people
   * ones. Sharing would carry a name typed against people over to a register
   * it means nothing in, and silently narrow it.
   */
  const [roleSearch, setRoleSearch] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<DirectoryPerson | null>(null);
  const [editingType, setEditingType] = useState<UserTypeRecord | null>(null);
  const [pendingDisable, setPendingDisable] = useState<DirectoryPerson | null>(null);

  const queryClient = useQueryClient();
  const permissions = useQuery({ queryKey: ["admin", "permissions"], queryFn: adminApi.permissions });
  const userTypes = useQuery({ queryKey: ["admin", "user-types"], queryFn: adminApi.userTypes });
  /*
   * One source for the people register.
   *
   * This page used to run two: an administrative list of accounts and a
   * separate directory of the same people with their projects. For anybody
   * holding `users.read` the two showed identical rows under two headings —
   * the duplication the owner reported. The directory answers both questions
   * now: it returns the whole company to somebody who may read users and the
   * caller's colleagues to everybody else, and each row carries the
   * administrative fields the actions need.
   */
  const registers = useQuery({
    queryKey: ["directory", "registers"],
    queryFn: directoryApi.registers,
  });
  const showingWholeCompany = registers.data?.registers.includes("company") ?? false;
  const users = useQuery({
    queryKey: ["directory", showingWholeCompany ? "company" : "colleagues"],
    queryFn: () => (showingWholeCompany ? directoryApi.company() : directoryApi.colleagues()),
    enabled: registers.isSuccess,
  });

  const typeForm = useForm<UserTypeForm>({ resolver: zodResolver(userTypeSchema), defaultValues: { name: "", key: "", description: "", permissions: [] } });
  const userForm = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { displayName: "", email: "", password: "", invite: true, standing: "none", permissions: [] },
  });
  const editUserForm = useForm<EditUserForm>({ resolver: zodResolver(editUserSchema), defaultValues: { displayName: "", standing: "none", permissions: [] } });
  const editTypeForm = useForm<EditUserTypeForm>({ resolver: zodResolver(editUserTypeSchema), defaultValues: { name: "", description: "", permissions: [] } });

  // The edit forms are filled from the record being edited rather than from the
  // last submission, so reopening never shows a previous person's details.
  useEffect(() => {
    if (editingUser) {
      editUserForm.reset({
        displayName: editingUser.displayName,
        standing: editingUser.standing,
        permissions: [...editingUser.permissions],
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
        permissions: values.permissions,
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
  const allUsers = useMemo(() => users.data?.people ?? [], [users.data]);

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
      /*
       * By permission, not by bundle. "Who can delete a project" is the
       * question an access review actually arrives with, and a bundle filter
       * could not answer it once bundles stopped granting anything.
       */
      if (permissionFilter && !holds(user, permissionFilter)) return false;
      return true;
    });
    // Projects are searchable too: "who is on Nile Tower" is the question a
    // site manager actually arrives with.
    return searchRecords(narrowed, search, (user) => [
      user.displayName,
      user.email,
      ...user.projects.flatMap((project) => [project.name, project.code]),
    ]);
  }, [allUsers, search, statusFilter, permissionFilter]);

  /**
   * Roles are searched in the browser for the same reason people are: the whole
   * set is already loaded and a company has a handful of them. The rules are
   * the shared ones, so a role is found the same way a project is.
   */
  const filteredTypes = useMemo(() => {
    /*
     * No origin filter any more. Every saved list belongs to the company that
     * made it — the product seeds none — so a "built in / created here" choice
     * had exactly one possible answer, which is a control that cannot do
     * anything.
     */
    return searchRecords(typeRows, roleSearch, (type) => [
      roleName(type),
      type.key,
      type.description ?? "",
    ]);
  }, [typeRows, roleSearch]);

  const activeCount = allUsers.filter((user) => user.status === "active").length;
  const disabledCount = allUsers.filter((user) => user.status === "disabled").length;
  /*
   * An account nobody has granted anything to and who is on no project can
   * sign in and reach nothing. That is a real state — somebody was added and
   * the second half of the job was forgotten — and it is worth surfacing.
   */
  const withoutRole = allUsers.filter(
    (user) =>
      user.standing !== "owner" && user.permissions.length === 0 && user.projects.length === 0,
  ).length;

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

  /*
   * What this administrator may pass on. The server refuses a grant the
   * granter does not hold themselves, so offering more would be offering a
   * choice that always ends in a refusal. An owner holds everything.
   */
  const grantable = isOwner
    ? permissionOptions.map((option) => option.key)
    : permissionOptions
        .map((option) => option.key)
        .filter((key) => auth?.user?.permissions.includes(key) ?? false);
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
              { value: "users" as const, label: t("team.segmentUsers"), icon: <Users size={16} strokeWidth={2} aria-hidden /> },
              ...(canReadTypes
                ? [{ value: "types" as const, label: t("team.segmentTypes"), icon: <ShieldCheck size={16} strokeWidth={2} aria-hidden /> }]
                : []),
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
                  id: "permission",
                  type: "select" as const,
                  label: t("team.filterPermission"),
                  anyLabel: t("team.allPermissions"),
                  value: permissionFilter,
                  options: permissionOptions.map((option) => ({
                    value: option.key,
                    label: option.label,
                  })),
                  onChange: setPermissionFilter,
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
            : []
        }
        onClearFilters={
          showingUsers
            ? () => { setSearch(""); setPermissionFilter(""); setStatusFilter(""); }
            : () => setRoleSearch("")
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

      {/*
        * The directory answers for itself from here: it has its own search,
        * its own two registers and its own states. The KPI row below is about
        * administering accounts, which is not what this register is for.
        */}
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
              <Button variant="secondary" onClick={() => { setSearch(""); setPermissionFilter(""); setStatusFilter(""); }}>
                {t("team.clearFilters")}
              </Button>
            }
          />
        ) : (
          /*
           * One component draws both views. The page owns search, filters and
           * the card/table switch — the same toolbar Projects, Tasks and Risks
           * use — so this is handed rows and told which shape to draw them in.
           */
          <PeopleDirectory
            people={filteredUsers}
            view={view}
            canEdit={canEditUsers}
            canDisable={canDisableUsers}
            onEdit={(person) => setEditingUser(person)}
            onDisable={(person) => setPendingDisable(person)}
            onEnable={(person) => setStatus.mutate({ userId: person.id, status: "active" })}
            permissionLabel={(key) =>
              permissionOptions.find((option) => option.key === key)?.label ?? key
            }
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
            <Button variant="secondary" onClick={() => setRoleSearch("")}>
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
            { id: "name", header: t("team.userTypeName"), accessor: (row) => roleName(row) },
            { id: "key", header: t("team.userTypeKey"), accessor: (row) => row.key },
            {
              id: "permissions",
              header: t("team.userTypePermissions"),
              accessor: (row) =>
                row.permissions
                  .map((permission) => permissionOptions.find((option) => option.key === permission)?.label ?? permission)
                  .join(t("common.listSeparator")),
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
                <span className="rect-role__name">{roleName(type)}</span>
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

      {/*
        * One dialog for creating and editing a role.
        *
        * They were two, differing only in which form object they read, whether
        * the key field appeared, and the wording of the button. Kept apart they
        * had already drifted — the same permission picker, described twice, is
        * two places to forget. The key is create-only because assignments and
        * audit entries point at it, so it cannot change once anything refers
        * to it.
        */}
      <FormDialog
        open={typeOpen || editingType !== null}
        title={editingType ? t("team.editUserType") : t("team.createUserType")}
        description={editingType ? t("team.editUserTypeDescription") : t("team.createUserTypeDescription")}
        onClose={() => { setTypeOpen(false); setEditingType(null); }}
        onSubmit={
          editingType
            ? editTypeForm.handleSubmit((values) =>
                saveType.mutate({ userTypeId: editingType.id, values }),
              )
            : typeForm.handleSubmit((values) => createType.mutate(values))
        }
        submitLabel={editingType ? t("team.saveChanges") : t("team.createUserType")}
        pending={editingType ? saveType.isPending : createType.isPending}
        error={
          editingType
            ? messageFor(saveType.error, t("team.updateUserTypeFailed"))
            : messageFor(createType.error, t("team.createUserTypeFailed"))
        }
      >
        {editingType ? (
          <>
            <Field label={t("team.fieldName")} error={editTypeForm.formState.errors.name?.message} required><Input data-autofocus="true" {...editTypeForm.register("name")} /></Field>
            <Field label={t("team.fieldDescription")} error={editTypeForm.formState.errors.description?.message}><Input {...editTypeForm.register("description")} /></Field>
            <Field label={t("team.fieldPermissions")} hint={t("team.permissionsHint")} error={editTypeForm.formState.errors.permissions?.message} required>
              <PermissionPicker
                options={permissionOptions}
                value={editTypeForm.watch("permissions") ?? []}
                onChange={(next) => editTypeForm.setValue("permissions", next, { shouldValidate: true })}
              />
            </Field>
          </>
        ) : (
          <>
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
          </>
        )}
      </FormDialog>

      {/*
        * One dialog for adding a person and for changing one.
        *
        * Email and how they get access are asked only when creating, because
        * neither can change afterwards through this form — an address change
        * is a verified flow of its own, and a password nobody has yet cannot
        * be reset here. Everything below that is identical for both, and was
        * previously written out twice; the copies had already drifted, with
        * the edit form missing the hint that explains why owners are not asked
        * for a user type.
        */}
      <FormDialog
        open={userOpen || editingUser !== null}
        title={editingUser ? t("team.editUser") : t("team.createUser")}
        description={editingUser ? t("team.editUserDescription") : t("team.createUserDescription")}
        onClose={() => { setUserOpen(false); setEditingUser(null); }}
        onSubmit={
          editingUser
            ? editUserForm.handleSubmit((values) =>
                saveUser.mutate({ userId: editingUser.id, values }),
              )
            : userForm.handleSubmit((values) => createUser.mutate(values))
        }
        submitLabel={editingUser ? t("team.saveChanges") : t("team.createUser")}
        pending={editingUser ? saveUser.isPending : createUser.isPending}
        error={
          editingUser
            ? messageFor(saveUser.error, t("team.updateUserFailed"))
            : messageFor(createUser.error, t("team.createUserFailed"))
        }
      >
        {editingUser ? (
          <Field label={t("team.fieldName")} error={editUserForm.formState.errors.displayName?.message} required><Input data-autofocus="true" {...editUserForm.register("displayName")} /></Field>
        ) : (
          <>
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
          </>
        )}
        <AccessFields
          /*
           * The two forms differ — creating asks for an email and a password —
           * so the union is narrowed to the fields AccessFields actually reads.
           * Those names stay checked; see AccessFieldsProps.
           */
          form={(editingUser ? editUserForm : userForm) as unknown as UseFormReturn<AccessFormValues>}
          bundles={typeRows}
          permissionOptions={permissionOptions}
          isOwner={isOwner}
          grantable={grantable}
        />
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
