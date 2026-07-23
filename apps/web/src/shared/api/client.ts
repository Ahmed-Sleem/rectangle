/**
 * Same-origin API client for Rectangle's production web app. It sends httpOnly
 * session cookies and converts non-2xx responses into typed client errors.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const error = typeof body === "object" && body && "error" in body ? (body as { error: { code?: string; message?: string; details?: unknown } }).error : undefined;
    throw new ApiClientError(response.status, error?.code ?? "REQUEST_FAILED", error?.message ?? "Request failed.", error?.details);
  }

  return body as T;
}
