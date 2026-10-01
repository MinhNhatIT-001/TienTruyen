import "server-only";
export const siteOrigin = (
  process.env.APP_ORIGIN || "http://localhost:3000"
).replace(/\/$/, "");
export async function publicApi<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL || "http://127.0.0.1:4000"}/api${path}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}
