/** Team administration manages real user types, permissions, and users. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button, Card, Checkbox, DataTable, EmptyState, ErrorState, Field, Input, FormDialog, LoadingState, PageGrid, Toolbar } from "@/shared/ui";
import { useOptionalAuth } from "@/shared/auth";
import { ApiClientError } from "@/shared/api/client";
import { adminApi, type AdminUserRecord } from "./admin-api";
import "./TeamPage.css";

const userTypeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  key: z.string().trim().toLowerCase().min(2).max(64).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/u),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string()).min(1),
});

const userSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  email: z.email().max(254),
  password: z.string().min(12).max(256).regex(/[a-z]/u).regex(/[A-Z]/u).regex(/[0-9]/u),
  userTypeIds: z.array(z.string()).min(1),
});

type UserTypeForm = z.infer<typeof userTypeSchema>;
type UserForm = z.infer<typeof userSchema>;

export default function TeamPage() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  // Only offer administration to people whose request would actually succeed.
  const canManage =
    auth?.user?.roles.some((role) => ["tenant_owner", "tenant_admin"].includes(role)) ||
    auth?.user?.permissions.includes("users.manage") ||
    false;
  const [typeOpen, setTypeOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const queryClient = useQueryClient();
  const permissions = useQuery({ queryKey: ["admin", "permissions"], queryFn: adminApi.permissions });
  const userTypes = useQuery({ queryKey: ["admin", "user-types"], queryFn: adminApi.userTypes });
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users });

  const typeForm = useForm<UserTypeForm>({ resolver: zodResolver(userTypeSchema), defaultValues: { name: "", key: "", description: "", permissions: [] } });
  const userForm = useForm<UserForm>({ resolver: zodResolver(userSchema), defaultValues: { displayName: "", email: "", password: "", userTypeIds: [] } });

  const createType = useMutation({
    mutationFn: adminApi.createUserType,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["admin", "user-types"] }); typeForm.reset(); setTypeOpen(false); },
  });
  const createUser = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); userForm.reset(); setUserOpen(false); },
  });
  const updateUser = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: "active" | "disabled" }) => adminApi.updateUser(userId, { status }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); },
  });

  const typeError = createType.error instanceof ApiClientError ? createType.error.message : createType.error ? t("team.createUserTypeFailed") : null;
  const userError = createUser.error instanceof ApiClientError ? createUser.error.message : createUser.error ? t("team.createUserFailed") : null;

  const isLoading = userTypes.isLoading || users.isLoading;
  const isError = userTypes.isError || users.isError;

  if (isLoading) {
    return <LoadingState title={t("team.loadingTitle")} message={t("team.loadingMessage")} />;
  }

  if (isError) {
    return (
      <ErrorState
        title={t("team.errorTitle")}
        message={t("team.errorMessage")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void userTypes.refetch();
              void users.refetch();
            }}
          >
            {t("team.tryAgain")}
          </Button>
        }
      />
    );
  }

  const typeRows = userTypes.data?.userTypes ?? [];
  const userRows = users.data?.users ?? [];

  return (
    <section className="rect-team-page" aria-label={t("team.pageLabel")}>
      <Toolbar className="rect-team-toolbar">
        {canManage ? (
          <>
            <Button variant="secondary" onClick={() => setTypeOpen(true)}>{t("team.createUserType")}</Button>
            <Button variant="primary" onClick={() => setUserOpen(true)} disabled={typeRows.length === 0} title={typeRows.length === 0 ? t("team.needTypeFirst") : undefined}>{t("team.createUser")}</Button>
          </>
        ) : null}
      </Toolbar>

      <PageGrid columns={12}>
        <Card className="rect-team-card rect-team-card--wide">
          <h2>{t("team.userTypesTitle")}</h2>
          {typeRows.length === 0 ? (
            <EmptyState
              title={t("team.noUserTypesTitle")}
              message={canManage ? t("team.noUserTypesMessage") : t("team.readOnlyMessage")}
              {...(canManage
                ? { action: <Button variant="primary" onClick={() => setTypeOpen(true)}>{t("team.createUserType")}</Button> }
                : {})}
            />
          ) : (
          <DataTable
            caption={t("team.userTypesTitle")}
            rows={typeRows}
            getRowKey={(row) => row.id}
            columns={[
              { id: "name", header: t("team.userTypeName"), accessor: (row) => (row.systemType ? t(`enums.systemUserType.${row.key}`, { defaultValue: row.name }) : row.name) },
              { id: "key", header: t("team.userTypeKey"), accessor: (row) => row.key },
              { id: "permissions", header: t("team.userTypePermissions"), accessor: (row) => row.permissions.length },
            ]}
            emptyMessage={t("team.noUserTypes")}
          />
          )}
        </Card>
        <Card className="rect-team-card rect-team-card--wide">
          <h2>{t("team.usersTitle")}</h2>
          {userRows.length === 0 ? (
            <EmptyState
              title={t("team.noUsersTitle")}
              message={canManage ? t("team.noUsersMessage") : t("team.readOnlyMessage")}
            />
          ) : (
          <DataTable
            caption={t("team.usersTitle")}
            rows={userRows}
            getRowKey={(row) => row.id}
            columns={[
              { id: "name", header: t("team.userName"), accessor: (row) => row.displayName },
              { id: "email", header: t("team.userEmail"), accessor: (row) => row.email },
              { id: "types", header: t("team.userTypes"), accessor: (row) => row.userTypes.map((type) => type.name).join(t("common.listSeparator")) || t("common.notAvailable") },
              { id: "status", header: t("team.userStatus"), accessor: (row) => t(`enums.userStatus.${row.status}`) },
              ...(canManage ? [{ id: "action", header: t("team.userAction"), accessor: (row: AdminUserRecord) => <Button size="sm" variant="secondary" onClick={() => updateUser.mutate({ userId: row.id, status: row.status === "active" ? "disabled" : "active" })}>{row.status === "active" ? t("team.disable") : t("team.activate")}</Button> }] : []),
            ]}
            emptyMessage={t("team.noUsers")}
          />
          )}
        </Card>
      </PageGrid>

      <FormDialog
        open={typeOpen}
        title={t("team.createUserType")}
        description={t("team.createUserTypeDescription")}
        onClose={() => setTypeOpen(false)}
        onSubmit={typeForm.handleSubmit((values) => createType.mutate(values))}
        submitLabel={t("team.createUserType")}
        pending={createType.isPending}
        error={typeError}
      >
        <Field label={t("team.fieldName")} error={typeForm.formState.errors.name?.message} required><Input aria-label={t("team.fieldName")} data-autofocus="true" {...typeForm.register("name")} /></Field>
        <Field label={t("team.fieldKey")} error={typeForm.formState.errors.key?.message} required><Input aria-label={t("team.fieldKey")} {...typeForm.register("key")} /></Field>
        <Field label={t("team.fieldDescription")} error={typeForm.formState.errors.description?.message}><Input aria-label={t("team.fieldDescription")} {...typeForm.register("description")} /></Field>
        <Field label={t("team.fieldPermissions")}>
          <div className="rect-team-permissions">
            {(permissions.data?.permissions ?? []).map((permission) => (
              <Checkbox key={permission.key} label={permission.label} description={permission.description} value={permission.key} {...typeForm.register("permissions")} />
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
        error={userError}
      >
        <Field label={t("team.fieldName")} error={userForm.formState.errors.displayName?.message} required><Input aria-label={t("team.fieldName")} data-autofocus="true" {...userForm.register("displayName")} /></Field>
        <Field label={t("team.fieldEmail")} error={userForm.formState.errors.email?.message} required><Input aria-label={t("team.fieldEmail")} type="email" {...userForm.register("email")} /></Field>
        <Field label={t("team.fieldTemporaryPassword")} error={userForm.formState.errors.password?.message} required><Input aria-label={t("team.fieldTemporaryPassword")} type="password" {...userForm.register("password")} /></Field>
        <Field label={t("team.userTypes")}>
          <div className="rect-team-permissions">
            {(userTypes.data?.userTypes ?? []).map((type) => (
              <Checkbox key={type.id} label={type.name} description={type.description} value={type.id} {...userForm.register("userTypeIds")} />
            ))}
          </div>
        </Field>
      </FormDialog>
    </section>
  );
}
