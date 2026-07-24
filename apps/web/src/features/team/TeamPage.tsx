/** Team administration manages real user types, permissions, and users. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Card, Checkbox, DataTable, Field, Input, Modal, PageGrid, Toolbar } from "@/shared/ui";
import { ApiClientError } from "@/shared/api/client";
import { adminApi } from "./admin-api";
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

  const typeError = createType.error instanceof ApiClientError ? createType.error.message : createType.error ? "User type could not be created." : null;
  const userError = createUser.error instanceof ApiClientError ? createUser.error.message : createUser.error ? "User could not be created." : null;

  return (
    <section className="rect-team-page" aria-label="Team administration">
      <Toolbar className="rect-team-toolbar">
        <Button variant="secondary" onClick={() => setTypeOpen(true)}>Create user type</Button>
        <Button variant="primary" onClick={() => setUserOpen(true)} disabled={(userTypes.data?.userTypes.length ?? 0) === 0}>Create user</Button>
      </Toolbar>

      <PageGrid columns={12}>
        <Card className="rect-team-card rect-team-card--wide">
          <h2>User types</h2>
          <DataTable
            caption="User types"
            rows={userTypes.data?.userTypes ?? []}
            getRowKey={(row) => row.id}
            columns={[
              { id: "name", header: "Type", accessor: (row) => row.name },
              { id: "key", header: "Key", accessor: (row) => row.key },
              { id: "permissions", header: "Permissions", accessor: (row) => row.permissions.length },
            ]}
            emptyMessage="No user types yet."
          />
        </Card>
        <Card className="rect-team-card rect-team-card--wide">
          <h2>Users</h2>
          <DataTable
            caption="Users"
            rows={users.data?.users ?? []}
            getRowKey={(row) => row.id}
            columns={[
              { id: "name", header: "Name", accessor: (row) => row.displayName },
              { id: "email", header: "Email", accessor: (row) => row.email },
              { id: "types", header: "User types", accessor: (row) => row.userTypes.map((type) => type.name).join(", ") || "—" },
            ]}
            emptyMessage="No users yet."
          />
        </Card>
      </PageGrid>

      <Modal open={typeOpen} title="Create user type" onClose={() => setTypeOpen(false)}>
        <form className="rect-team-form" onSubmit={typeForm.handleSubmit((values) => createType.mutate(values))}>
          <Field label="Name" error={typeForm.formState.errors.name?.message} required><Input aria-label="Name" {...typeForm.register("name")} /></Field>
          <Field label="Key" error={typeForm.formState.errors.key?.message} required><Input aria-label="Key" {...typeForm.register("key")} /></Field>
          <Field label="Description" error={typeForm.formState.errors.description?.message}><Input aria-label="Description" {...typeForm.register("description")} /></Field>
          <div className="rect-team-permissions">
            {(permissions.data?.permissions ?? []).map((permission) => (
              <Checkbox key={permission.key} label={permission.label} description={permission.description} value={permission.key} {...typeForm.register("permissions")} />
            ))}
          </div>
          {typeError ? <p className="rect-team-form__error" role="alert">{typeError}</p> : null}
          <Toolbar className="rect-team-form__actions"><Button variant="ghost" onClick={() => setTypeOpen(false)}>Cancel</Button><Button variant="primary" type="submit" disabled={createType.isPending}>Create</Button></Toolbar>
        </form>
      </Modal>

      <Modal open={userOpen} title="Create user" onClose={() => setUserOpen(false)}>
        <form className="rect-team-form" onSubmit={userForm.handleSubmit((values) => createUser.mutate(values))}>
          <Field label="Name" error={userForm.formState.errors.displayName?.message} required><Input aria-label="Name" {...userForm.register("displayName")} /></Field>
          <Field label="Email" error={userForm.formState.errors.email?.message} required><Input aria-label="Email" type="email" {...userForm.register("email")} /></Field>
          <Field label="Temporary password" error={userForm.formState.errors.password?.message} required><Input aria-label="Temporary password" type="password" {...userForm.register("password")} /></Field>
          <div className="rect-team-permissions">
            {(userTypes.data?.userTypes ?? []).map((type) => (
              <Checkbox key={type.id} label={type.name} description={type.description} value={type.id} {...userForm.register("userTypeIds")} />
            ))}
          </div>
          {userError ? <p className="rect-team-form__error" role="alert">{userError}</p> : null}
          <Toolbar className="rect-team-form__actions"><Button variant="ghost" onClick={() => setUserOpen(false)}>Cancel</Button><Button variant="primary" type="submit" disabled={createUser.isPending}>Create</Button></Toolbar>
        </form>
      </Modal>
    </section>
  );
}
