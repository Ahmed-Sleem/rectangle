/**
 * Confirming or reverting an email change from an emailed link.
 *
 * Both directions land here because they are the same shape — present a
 * token, see what happened — and differ only in what the outcome means.
 */
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiClientError } from "@/shared/api/client";
import { buttonClassName, Card, LoadingState } from "@/shared/ui";
import { confirmEmailChange, revertEmailChange } from "./lifecycle-api";
import "../setup/setup-page.css";

export default function EmailChangePage({ mode }: { mode: "confirm" | "revert" }) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const action = useMutation<void, unknown, void>({
    mutationFn: async () => {
      if (mode === "confirm") {
        await confirmEmailChange(token);
        return;
      }
      await revertEmailChange(token);
    },
  });

  // Runs on arrival: the person already made their decision by clicking the
  // link in their inbox, so asking again would be asking twice.
  const { mutate } = action;
  useEffect(() => {
    if (token) mutate();
  }, [token, mutate]);

  if (!token) {
    return (
      <Card className="rect-setup-card">
        <div className="rect-setup-card__header">
          <p>{t("app.name")}</p>
          <h1>{t("auth.linkIncompleteTitle")}</h1>
          <span>{t("auth.emailTokenMissing")}</span>
        </div>
        <Link className={buttonClassName("secondary")} to="/login">
          Go to sign in
        </Link>
      </Card>
    );
  }

  if (action.isPending || action.isIdle) {
    return (
      <Card className="rect-setup-card">
        <LoadingState
          title={mode === "confirm" ? t("auth.confirmingNewAddress") : t("auth.restoringAddress")}
          message={t("auth.oneMoment")}
        />
      </Card>
    );
  }

  if (action.isError) {
    const message =
      action.error instanceof ApiClientError
        ? action.error.message
        : t("auth.linkNoLongerValid");
    return (
      <Card className="rect-setup-card">
        <div className="rect-setup-card__header">
          <p>{t("app.name")}</p>
          <h1>{t("auth.linkUnavailableTitle")}</h1>
          <span>{message}</span>
        </div>
        <Link className={buttonClassName("secondary")} to="/login">
          Go to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card className="rect-setup-card">
      <div className="rect-setup-card__header">
        <p>{t("app.name")}</p>
        <h1>{mode === "confirm" ? t("auth.emailAddressUpdated") : t("auth.addressRestored")}</h1>
        <span>
          {mode === "confirm"
            ? t("auth.emailChangedSignedOut")
            : t("auth.emailRevertedDisabled")}
        </span>
      </div>
      <Link className={buttonClassName("primary")} to="/login">
        Go to sign in
      </Link>
    </Card>
  );
}
