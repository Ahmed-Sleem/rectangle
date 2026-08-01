/** Login page authenticates against the real Rectangle API session endpoint. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/shared/auth";
import { apiRequest, ApiClientError } from "@/shared/api/client";
import { Button, buttonClassName, Card, Field, Input, Toolbar } from "@/shared/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { loginWithPasskey } from "./passkey-api";
import "../setup/setup-page.css";

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(256),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const form = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const login = useMutation({
    mutationFn: (values: LoginForm) => apiRequest("/v1/auth/login", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: () => auth.refresh(),
  });

  const passkeyLogin = useMutation({
    mutationFn: () => loginWithPasskey(form.getValues("email")),
    onSuccess: () => auth.refresh(),
  });

  const error = login.error ?? passkeyLogin.error;
  const errorMessage =
    error instanceof ApiClientError ? error.message : error ? t("auth.signInFailed") : null;

  return (
    <Card className="rect-setup-card">
      <div className="rect-setup-card__header">
        <p>{t("app.name")}</p>
        <h1>{t("auth.signInTitle")}</h1>
        <span>{t("auth.signInIntro")}</span>
      </div>
      <form className="rect-setup-form" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
        <Field label={t("auth.email")} error={form.formState.errors.email?.message} required><Input aria-label={t("auth.email")} autoComplete="username webauthn" type="email" {...form.register("email")} /></Field>
        <Field label={t("auth.password")} error={form.formState.errors.password?.message} required><Input aria-label={t("auth.password")} autoComplete="current-password" type="password" {...form.register("password")} /></Field>
        {errorMessage ? <p className="rect-setup-form__error" role="alert">{errorMessage}</p> : null}
        <Toolbar>
          <Button variant="primary" type="submit" disabled={login.isPending}>{login.isPending ? t("auth.signingIn") : t("auth.signIn")}</Button>
          <Button variant="secondary" type="button" disabled={passkeyLogin.isPending || !form.watch("email")} onClick={() => passkeyLogin.mutate()}>{passkeyLogin.isPending ? t("auth.checkingPasskey") : t("auth.usePasskey")}</Button>
        </Toolbar>
        <Link className={buttonClassName("ghost", "sm")} to="/reset">
          {t("auth.forgotPassword")}
        </Link>
      </form>
    </Card>
  );
}
