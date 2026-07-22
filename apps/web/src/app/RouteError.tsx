import { isRouteErrorResponse, useRouteError } from "react-router-dom";

export function RouteError() {
  const error = useRouteError();

  let message = "Something went wrong loading this view.";
  if (isRouteErrorResponse(error)) {
    message = error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="rect-error" role="alert">
      <p className="rect-error__title">Unable to load module</p>
      <p className="rect-error__text">{message}</p>
    </div>
  );
}
