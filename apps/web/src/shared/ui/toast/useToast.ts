/** Access to the notification stack from anywhere below the provider. */
import { useContext } from "react";
import { ToastContext, type ToastApi } from "./toast-context";

/**
 * Throws when the provider is absent rather than silently doing nothing: a
 * confirmation that never appears is a bug that hides itself.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }
  return api;
}
