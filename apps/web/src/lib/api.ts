export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let refreshing: Promise<boolean> | null = null;
function csrfHeaders(): Record<string, string> {
  const csrf = document.cookie
    .split("; ")
    .find((x) => x.startsWith("tt_csrf="))
    ?.split("=")[1];
  return csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {};
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(),
      ...options.headers,
    },
  });
  if (
    response.status === 401 &&
    retry &&
    path !== "/auth/login" &&
    path !== "/auth/refresh"
  ) {
    refreshing ??= fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders(),
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
    if (await refreshing) return api<T>(path, options, false);
  }
  const data = await response
    .json()
    .catch(() => ({ message: "Máy chủ chưa sẵn sàng. Vui lòng thử lại." }));
  if (!response.ok)
    throw new ApiError(
      data.message || "Yêu cầu chưa thực hiện được.",
      response.status,
    );
  return data;
}
