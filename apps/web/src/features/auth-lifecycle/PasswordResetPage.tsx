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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          <p>{t("app.name")}</p>
          <h1>{t("auth.resetSentTitle")}</h1>
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
        ? t("auth.resetRequestFailed")
        : null;

  return (
    <Card className="rect-setup-card">
      <div className="rect-setup-card__header">
        <p>{t("app.name")}</p>
        <h1>{t("auth.resetTitle")}</h1>
        <span>{t("auth.resetIntroShort")}</span>
      </div>

      <form className="rect-setup-form" onSubmit={form.handleSubmit((values) => request.mutate(values))}>
        <Field label={t("auth.company")} hint={t("auth.companyHint")} error={form.formState.errors.tenantSlug?.message} required>
          <Input data-autofocus="true" autoComplete="organization" {...form.register("tenantSlug")} />
        </Field>
        <Field label={t("auth.email")} error={form.formState.errors.email?.message} required>
          <Input type="email" autoComplete="username" {...form.register("email")} />
        </Field>

        {errorMessage ? <p className="rect-setup-form__error" role="alert">{errorMessage}</p> : null}

        <Button variant="primary" type="submit" disabled={request.isPending}>
          {request.isPending ? t("auth.resetPending") : t("auth.resetSendLink")}
        </Button>
        <Link className={buttonClassName("ghost")} to="/login">
          Back to sign in
        </Link>
      </form>
    </Card>
  );
}
