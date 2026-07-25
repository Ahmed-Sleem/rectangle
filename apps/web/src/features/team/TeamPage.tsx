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
import { LayoutGrid, Rows3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useOptionalAuth } from "@/shared/auth";
import {
  Badge, Button, CardGrid, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState,
  Field, FilterBar, FilterBarSpacer, FilterSelect, FormDialog, Input, LoadingState,
  SearchField, StatCard, StatRow, ViewToggle,
} from "@/shared/ui";
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

const userSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  email: z.email().max(254),
  password: z.string().min(12).max(256).regex(/[a-z]/u).regex(/[A-Z]/u).regex(/[0-9]/u),
  userTypeIds: z.array(z.string()).min(1),
});

/** Email is the sign-in identity and a password is not reset by editing a profile. */
const editUserSchema = userSchema.omit({ email: true, password: true });

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

/** Initials for the avatar, handling Arabic and Latin names alike. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return [...parts[0]!].slice(0, 1).join("");
  return [...parts[0]!].slice(0, 1).join("") + [...parts[parts.length - 1]!].slice(0, 1).join("");
}

/** A built-in role keeps its translated name; a company's own role keeps its own. */
function roleName(type: { name: string; key: string; systemType?: boolean }, t: TFunction): string {
  return type.systemType ? t(`enums.systemUserType.${type.key}`, { defaultValue: type.name }) : type.name;
}

export default function TeamPage() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const canManage =
    auth?.user?.roles.some((role) => ["tenant_owner", "tenant_admin"].includes(role)) ||
    auth?.user?.permissions.includes("users.manage") ||
    false;

  const [segment, setSegment] = useState<Segment>("users");
  const [view, setView] = useState<ViewMode>(() => readStoredView());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
  const userForm = useForm<UserForm>({ resolver: zodResolver(userSchema), defaultValues: { displayName: "", email: "", password: "", userTypeIds: [] } });
  const editUserForm = useForm<EditUserForm>({ resolver: zodResolver(editUserSchema), defaultValues: { displayName: "", userTypeIds: [] } });
  const editTypeForm = useForm<EditUserTypeForm>({ resolver: zodResolver(editUserTypeSchema), defaultValues: { name: "", description: "", permissions: [] } });

  // The edit forms are filled from the record being edited rather than from the
  // last submission, so reopening never shows a previous person's details.
  useEffect(() => {
    if (editingUser) {
      editUserForm.reset({
        displayName: editingUser.displayName,
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
    mutationFn: adminApi.createUser,
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

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return allUsers.filter((user) => {
      if (statusFilter && user.status !== statusFilter) return false;
      if (typeFilter && !user.userTypes.some((type) => type.id === typeFilter)) return false;
      if (!term) return true;
      return (
        user.displayName.toLocaleLowerCase().includes(term) ||
        user.email.toLocaleLowerCase().includes(term)
      );
    });
  }, [allUsers, search, statusFilter, typeFilter]);

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
      <FilterBar>
        <ViewToggle<Segment>
          label={t("team.segmentLabel")}
          value={segment}
          onChange={setSegment}
          options={[
            { value: "users", label: t("team.segmentUsers") },
            { value: "types", label: t("team.segmentTypes") },
          ]}
        />

        {showingUsers ? (
          <>
            <SearchField
              label={t("team.searchLabel")}
              placeholder={t("team.searchPlaceholder")}
              value={search}
              onChange={setSearch}
              submitLabel={t("common.search")}
            />
            <FilterSelect
              label={t("team.filterType")}
              width="md"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">{t("team.allTypes")}</option>
              {typeRows.map((type) => (
                <option key={type.id} value={type.id}>{roleName(type, t)}</option>
              ))}
            </FilterSelect>
            <FilterSelect
              label={t("team.filterStatus")}
              width="sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">{t("team.allStatuses")}</option>
              <option value="active">{t("enums.userStatus.active")}</option>
              <option value="disabled">{t("enums.userStatus.disabled")}</option>
            </FilterSelect>
          </>
        ) : null}

        <FilterBarSpacer />

        {showingUsers ? (
          <ViewToggle<ViewMode>
            label={t("team.cardView")}
            value={view}
            onChange={(next) => { setView(next); storeView(next); }}
            options={[
              { value: "cards", label: t("team.cardView"), icon: <LayoutGrid size={16} strokeWidth={2} aria-hidden /> },
              { value: "table", label: t("team.tableView"), icon: <Rows3 size={16} strokeWidth={2} aria-hidden /> },
            ]}
          />
        ) : null}

        {canManage ? (
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
        ) : null}
      </FilterBar>

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
            message={canManage ? t("team.noUsersMessage") : t("team.readOnlyMessage")}
            {...(canManage && typeRows.length > 0
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
                  <span className="rect-person__avatar" aria-hidden>{initialsOf(user.displayName)}</span>
                  <span className="rect-person__identity">
                    <span className="rect-person__name">{user.displayName}</span>
                    <span className="rect-person__email">{user.email}</span>
                  </span>
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
                  {canManage ? (
                    <span className="rect-person__actions">
                      <Button size="sm" variant="secondary" onClick={() => setEditingUser(user)}>{t("team.edit")}</Button>
                      {user.status === "active" ? (
                        <Button size="sm" variant="secondary" onClick={() => setPendingDisable(user)}>{t("team.disable")}</Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ userId: user.id, status: "active" })}>
                          {t("team.enableAction")}
                        </Button>
                      )}
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
                    <span className="rect-person__avatar rect-person__avatar--sm" aria-hidden>{initialsOf(row.displayName)}</span>
                    <span>{row.displayName}</span>
                  </span>
                ),
              },
              { id: "email", header: t("team.userEmail"), accessor: (row) => row.email },
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
              ...(canManage
                ? [{
                    id: "action",
                    header: t("team.userAction"),
                    accessor: (row: AdminUserRecord) => (
                      <span className="rect-person__actions">
                        <Button size="sm" variant="secondary" onClick={() => setEditingUser(row)}>{t("team.edit")}</Button>
                        {row.status === "active" ? (
                          <Button size="sm" variant="secondary" onClick={() => setPendingDisable(row)}>{t("team.disable")}</Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ userId: row.id, status: "active" })}>
                            {t("team.enableAction")}
                          </Button>
                        )}
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
          message={canManage ? t("team.noUserTypesMessage") : t("team.readOnlyMessage")}
          {...(canManage
            ? { action: <Button variant="primary" onClick={() => setTypeOpen(true)}>{t("team.createUserType")}</Button> }
            : {})}
        />
      ) : (
        <CardGrid label={t("team.userTypesTitle")}>
          {typeRows.map((type) => (
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
                {canManage ? (
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
        <Field label={t("team.fieldPermissions")} error={typeForm.formState.errors.permissions?.message} required>
          <div className="rect-team-permissions">
            {permissionOptions.map((permission) => (
              <Checkbox key={permission.key} label={permission.label} description={permission.description} value={permission.key} {...typeForm.register("permissions")} />
            ))}
          </div>
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
        <Field label={t("team.fieldPermissions")} error={editTypeForm.formState.errors.permissions?.message} required>
          <div className="rect-team-permissions">
            {permissionOptions.map((permission) => (
              <Checkbox key={permission.key} label={permission.label} description={permission.description} value={permission.key} {...editTypeForm.register("permissions")} />
            ))}
          </div>
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
        <Field label={t("team.fieldTemporaryPassword")} error={userForm.formState.errors.password?.message} required><Input type="password" {...userForm.register("password")} /></Field>
        <Field label={t("team.userTypes")} error={userForm.formState.errors.userTypeIds?.message} required>
          <div className="rect-team-permissions">
            {typeRows.map((type) => (
              <Checkbox key={type.id} label={roleName(type, t)} {...(type.description ? { description: type.description } : {})} value={type.id} {...userForm.register("userTypeIds")} />
            ))}
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
        <Field label={t("team.userTypes")} error={editUserForm.formState.errors.userTypeIds?.message} required>
          <div className="rect-team-permissions">
            {typeRows.map((type) => (
              <Checkbox key={type.id} label={roleName(type, t)} {...(type.description ? { description: type.description } : {})} value={type.id} {...editUserForm.register("userTypeIds")} />
            ))}
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
