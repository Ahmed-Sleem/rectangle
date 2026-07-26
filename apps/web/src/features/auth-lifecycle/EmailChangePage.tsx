/**
 * Confirming or reverting an email change from an emailed link.
 *
 * Both directions land here because they are the same shape — present a
 * token, see what happened — and differ only in what the outcome means.
 */
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiClientError } from "@/shared/api/client";
import { buttonClassName, Card, LoadingState } from "@/shared/ui";
import { confirmEmailChange, revertEmailChange } from "./lifecycle-api";
import "../setup/setup-page.css";

export default function EmailChangePage({ mode }: { mode: "confirm" | "revert" }) {
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
          <p>Rectangle</p>
          <h1>Link incomplete</h1>
          <span>This link is missing its token.</span>
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
          title={mode === "confirm" ? "Confirming your new address" : "Restoring your address"}
          message="One moment…"
        />
      </Card>
    );
  }

  if (action.isError) {
    const message =
      action.error instanceof ApiClientError
        ? action.error.message
        : "This link is no longer valid.";
    return (
      <Card className="rect-setup-card">
        <div className="rect-setup-card__header">
          <p>Rectangle</p>
          <h1>Link unavailable</h1>
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
        <p>Rectangle</p>
        <h1>{mode === "confirm" ? "Email address updated" : "Address restored"}</h1>
        <span>
          {mode === "confirm"
            ? "Sign in with your new address. You have been signed out everywhere else."
            : "Your previous address is back and the account has been disabled. Ask an administrator to review it and re-enable it."}
        </span>
      </div>
      <Link className={buttonClassName("primary")} to="/login">
        Go to sign in
      </Link>
    </Card>
  );
}
