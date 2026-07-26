/** Choosing a new password from an emailed reset link. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { Button, buttonClassName, Card, Field, Input } from "@/shared/ui";
import { confirmPasswordReset } from "./lifecycle-api";
import "../setup/setup-page.css";

const schema = z
  .object({
    newPassword: z
      .string()
      .min(12)
      .max(256)
      .regex(/[a-z]/u)
      .regex(/[A-Z]/u)
      .regex(/[0-9]/u),
    confirmPassword: z.string().min(1),
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({ code: "custom", path: ["confirmPassword"], message: "mismatch" });
    }
  });

type ConfirmForm = z.infer<typeof schema>;

export default function PasswordResetConfirmPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const form = useForm<ConfirmForm>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const confirm = useMutation({
    mutationFn: (values: ConfirmForm) =>
      confirmPasswordReset({ token, newPassword: values.newPassword }),
    onSuccess: () => navigate("/login", { replace: true }),
  });

  if (!token) {
    return (
      <Card className="rect-setup-card">
        <div className="rect-setup-card__header">
          <p>Rectangle</p>
          <h1>Link incomplete</h1>
          <span>This reset link is missing its token. Request a new one.</span>
        </div>
        <Link className={buttonClassName("secondary")} to="/reset">
          Request a new link
        </Link>
      </Card>
    );
  }

  const errorMessage =
    confirm.error instanceof ApiClientError
      ? confirm.error.message
      : confirm.error
        ? "Your password could not be changed."
        : null;

  return (
    <Card className="rect-setup-card">
      <div className="rect-setup-card__header">
        <p>Rectangle</p>
        <h1>Choose a new password</h1>
        {/* Said plainly, because being signed out everywhere is surprising
            if it happens without warning. */}
        <span>Signing in again will be required on every device.</span>
      </div>

      <form className="rect-setup-form" onSubmit={form.handleSubmit((values) => confirm.mutate(values))}>
        <Field
          label="New password"
          hint="At least 12 characters, with an uppercase letter, a lowercase letter, and a digit."
          error={form.formState.errors.newPassword?.message}
          required
        >
          <Input data-autofocus="true" type="password" autoComplete="new-password" {...form.register("newPassword")} />
        </Field>
        <Field
          label="Confirm new password"
          error={form.formState.errors.confirmPassword ? "Both passwords must match." : undefined}
          required
        >
          <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
        </Field>

        {errorMessage ? <p className="rect-setup-form__error" role="alert">{errorMessage}</p> : null}

        <Button variant="primary" type="submit" disabled={confirm.isPending}>
          {confirm.isPending ? "Saving…" : "Set new password"}
        </Button>
      </form>
    </Card>
  );
}
