/** Login page authenticates against the real Rectangle API session endpoint. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/shared/auth";
import { apiRequest, ApiClientError } from "@/shared/api/client";
import { Button, Card, Field, Input } from "@/shared/ui";
import "../setup/setup-page.css";

const loginSchema = z.object({
  tenantSlug: z.string().trim().toLowerCase().min(3).max(64),
  email: z.email().max(254),
  password: z.string().min(12).max(256),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const auth = useAuth();
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { tenantSlug: "", email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: (values: LoginForm) => apiRequest("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(values),
    }),
    onSuccess: () => auth.refresh(),
  });

  const errorMessage = login.error instanceof ApiClientError ? login.error.message : login.error ? "Login failed." : null;

  return (
    <Card className="rect-setup-card">
      <div className="rect-setup-card__header">
        <p>Rectangle</p>
        <h1>Sign in</h1>
        <span>Use your company workspace and account credentials.</span>
      </div>
      <form className="rect-setup-form" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
        <Field label="Company slug" error={form.formState.errors.tenantSlug?.message} required>
          <Input aria-label="Company slug" autoComplete="organization" {...form.register("tenantSlug")} />
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message} required>
          <Input aria-label="Email" autoComplete="email" type="email" {...form.register("email")} />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message} required>
          <Input aria-label="Password" autoComplete="current-password" type="password" {...form.register("password")} />
        </Field>
        {errorMessage ? <p className="rect-setup-form__error" role="alert">{errorMessage}</p> : null}
        <Button variant="primary" type="submit" disabled={login.isPending}>{login.isPending ? "Signing in…" : "Sign in"}</Button>
      </form>
    </Card>
  );
}
