/** Hook for reading the current real setup/session state. */
import { useContext } from "react";
import { AuthContext } from "./AuthContext";

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

/**
 * Reads the session when one is available without throwing.
 *
 * Use this for presentation decisions such as hiding an action the user cannot
 * perform, where a missing provider should degrade to the least-privileged view
 * rather than break the page. Anything that depends on identity for correctness
 * must keep using `useAuth`.
 */
export function useOptionalAuth() {
  return useContext(AuthContext);
}
