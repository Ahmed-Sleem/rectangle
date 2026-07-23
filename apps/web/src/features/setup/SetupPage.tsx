/** First-run company setup creates the real first tenant/admin. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/shared/auth";
import { apiRequest, ApiClientError } from "@/shared/api/client";
import { Button, Card, Field, Input } from "@/shared/ui";
import "./setup-page.css";

const setupSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  companySlug: z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u),
  adminName: z.string().trim().min(2).max(160),
  adminEmail: z.email().max(254),
  password: z.string().min(12).max(256).regex(/[a-z]/u).regex(/[A-Z]/u).regex(/[0-9]/u),
});

type SetupForm = z.infer<typeof setupSchema>;

export default function SetupPage() {
  const auth = useAuth();
  const form = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      companyName: "",
      companySlug: "",
      adminName: "",
      adminEmail: "",
      password: "",
    },
  });

  const setup = useMutation({
    mutationFn: (values: SetupForm) => apiRequest("/v1/setup/first-admin", {
      method: "POST",
      body: JSON.stringify(values),
    }),
    onSuccess: () => auth.refresh(),
  });

  const errorMessage = setup.error instanceof ApiClientError ? setup.error.message : setup.error ? "Setup failed." : null;

  return (
    <Card className="rect-setup-card">
      <div className="rect-setup-card__header">
        <p>Rectangle</p>
        <h1>Set up your company</h1>
        <span>Create the first company workspace and owner account.</span>
      </div>
      <form className="rect-setup-form" onSubmit={form.handleSubmit((values) => setup.mutate(values))}>
        <Field label="Company name" error={form.formState.errors.companyName?.message} required>
          <Input aria-label="Company name" autoComplete="organization" {...form.register("companyName")} />
        </Field>
        <Field label="Company slug" hint="Lowercase letters, numbers, and dashes." error={form.formState.errors.companySlug?.message} required>
          <Input aria-label="Company slug" autoComplete="off" {...form.register("companySlug")} />
        </Field>
        <Field label="Your name" error={form.formState.errors.adminName?.message} required>
          <Input aria-label="Your name" autoComplete="name" {...form.register("adminName")} />
        </Field>
        <Field label="Email" error={form.formState.errors.adminEmail?.message} required>
          <Input aria-label="Email" autoComplete="email" type="email" {...form.register("adminEmail")} />
        </Field>
        <Field label="Password" hint="At least 12 characters with uppercase, lowercase, and number." error={form.formState.errors.password?.message} required>
          <Input aria-label="Password" autoComplete="new-password" type="password" {...form.register("password")} />
        </Field>
        {errorMessage ? <p className="rect-setup-form__error" role="alert">{errorMessage}</p> : null}
        <Button variant="primary" type="submit" disabled={setup.isPending}>{setup.isPending ? "Creating…" : "Create company"}</Button>
      </form>
    </Card>
  );
}
