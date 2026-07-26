/**
 * Requesting a password reset.
 *
 * The confirmation is the same whether or not the address is known, matching
 * the API: telling a stranger that an address has no account turns this page
 * into a way to enumerate a company's staff.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { Button, buttonClassName, Card, Field, Input } from "@/shared/ui";
import { requestPasswordReset } from "./lifecycle-api";
import "../setup/setup-page.css";

const schema = z.object({
  tenantSlug: z.string().trim().min(1).max(63),
  email: z.email().max(254),
});

type ResetForm = z.infer<typeof schema>;

export default function PasswordResetPage() {
  const form = useForm<ResetForm>({
    resolver: zodResolver(schema),
    defaultValues: { tenantSlug: "", email: "" },
  });

  const request = useMutation({
    mutationFn: (values: ResetForm) => requestPasswordReset(values),
  });

  if (request.isSuccess) {
    return (
      <Card className="rect-setup-card">
        <div className="rect-setup-card__header">
          <p>Rectangle</p>
          <h1>Check your email</h1>
          <span>
            If that address belongs to an active account, a reset link is on its way. The link
            expires in an hour and can be used once.
          </span>
        </div>
        <Link className={buttonClassName("secondary")} to="/login">
          Back to sign in
        </Link>
      </Card>
    );
  }

  const errorMessage =
    request.error instanceof ApiClientError
      ? request.error.message
      : request.error
        ? "That request could not be sent."
        : null;

  return (
    <Card className="rect-setup-card">
      <div className="rect-setup-card__header">
        <p>Rectangle</p>
        <h1>Reset your password</h1>
        <span>We will email you a link to choose a new one.</span>
      </div>

      <form className="rect-setup-form" onSubmit={form.handleSubmit((values) => request.mutate(values))}>
        <Field label="Company" hint="The short name in your Rectangle address." error={form.formState.errors.tenantSlug?.message} required>
          <Input data-autofocus="true" autoComplete="organization" {...form.register("tenantSlug")} />
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message} required>
          <Input type="email" autoComplete="username" {...form.register("email")} />
        </Field>

        {errorMessage ? <p className="rect-setup-form__error" role="alert">{errorMessage}</p> : null}

        <Button variant="primary" type="submit" disabled={request.isPending}>
          {request.isPending ? "Sending…" : "Send reset link"}
        </Button>
        <Link className={buttonClassName("ghost")} to="/login">
          Back to sign in
        </Link>
      </form>
    </Card>
  );
}
