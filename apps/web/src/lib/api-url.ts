// Read at request time: service bindings do not exist during builds or middleware.
export function apiUrl(path: string): URL {
  const base = process.env.API_SERVICE_URL || process.env.API_INTERNAL_URL;
  if (!base && process.env.VERCEL)
    throw new Error("Missing API_SERVICE_URL service binding");
  const normalized = `${(base || "http://127.0.0.1:4000").replace(/\/$/, "")}/`;
  return new URL(`api/${path.replace(/^\//, "")}`, normalized);
}
