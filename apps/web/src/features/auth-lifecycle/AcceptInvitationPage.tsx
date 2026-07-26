/**
 * Accepting an invitation.
 *
 * Reached from a link in email by somebody with no session, so it sits
 * outside the shell alongside login and setup. The invitation is described
 * before it is accepted, so the page can name the company and confirm the
 * address rather than asking a stranger to trust an unlabelled form.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { Button, buttonClassName, Card, Field, Input, LoadingState } from "@/shared/ui";
import { acceptInvitation, describeInvitation } from "./lifecycle-api";
import "../setup/setup-page.css";

const schema = z
  .object({
    displayName: z.string().trim().min(2).max(160),
    password: z
      .string()
      .min(12)
      .max(256)
      .regex(/[a-z]/u)
      .regex(/[A-Z]/u)
      .regex(/[0-9]/u),
    confirmPassword: z.string().min(1),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({ code: "custom", path: ["confirmPassword"], message: "mismatch" });
    }
  });

type AcceptForm = z.infer<typeof schema>;

export default function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const invitation = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => describeInvitation(token),
    enabled: token.length > 0,
    retry: false,
  });

  const form = useForm<AcceptForm>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", password: "", confirmPassword: "" },
  });

  const accept = useMutation({
    mutationFn: (values: AcceptForm) =>
      acceptInvitation({ token, password: values.password, displayName: values.displayName }),
    // Straight to sign-in rather than signing them in automatically: they have
    // just chosen a password and should confirm it works.
    onSuccess: () => navigate("/login", { replace: true }),
  });

  if (!token || invitation.isError) {
    const message =
      invitation.error instanceof ApiClientError
        ? invitation.error.message
        : "This invitation link is no longer valid. Ask an administrator to send a new one.";
    return (
      <Card className="rect-setup-card">
        <div className="rect-setup-card__header">
          <p>Rectangle</p>
          <h1>Invitation unavailable</h1>
          <span>{message}</span>
        </div>
        <Link className={buttonClassName("secondary")} to="/login">
          Go to sign in
        </Link>
      </Card>
    );
  }

  if (invitation.isLoading || !invitation.data) {
    return (
      <Card className="rect-setup-card">
        <LoadingState title="Checking your invitation" message="One moment…" />
      </Card>
    );
  }

  const summary = invitation.data.invitation;
  const errorMessage =
    accept.error instanceof ApiClientError
      ? accept.error.message
      : accept.error
        ? "Your account could not be set up."
        : null;

  return (
    <Card className="rect-setup-card">
      <div className="rect-setup-card__header">
        <p>{summary.companyName}</p>
        <h1>Set up your account</h1>
        {/* Naming the address proves the link belongs to the recipient. */}
        <span>Choose a password for {summary.email}.</span>
      </div>

      <form
        className="rect-setup-form"
        onSubmit={form.handleSubmit((values) => accept.mutate(values))}
      >
        <Field label="Your name" error={form.formState.errors.displayName?.message} required>
          <Input
            data-autofocus="true"
            defaultValue={summary.displayName}
            autoComplete="name"
            {...form.register("displayName")}
          />
        </Field>
        <Field
          label="Password"
          hint="At least 12 characters, with an uppercase letter, a lowercase letter, and a digit."
          error={form.formState.errors.password?.message}
          required
        >
          <Input type="password" autoComplete="new-password" {...form.register("password")} />
        </Field>
        <Field
          label="Confirm password"
          error={form.formState.errors.confirmPassword ? "Both passwords must match." : undefined}
          required
        >
          <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
        </Field>

        {errorMessage ? (
          <p className="rect-setup-form__error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <Button variant="primary" type="submit" disabled={accept.isPending}>
          {accept.isPending ? "Setting up…" : "Activate account"}
        </Button>
      </form>
    </Card>
  );
}
