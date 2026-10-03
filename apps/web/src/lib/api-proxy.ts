import { apiUrl } from "./api-url";

export async function proxyApi(request: Request, parts: string[]) {
  if (parts.some((p) => p === "." || p === ".." || !p))
    return Response.json(
      { message: "Đường dẫn không hợp lệ." },
      { status: 400 },
    );
  try {
    const upstream = apiUrl(parts.map(encodeURIComponent).join("/"));
    upstream.search = new URL(request.url).search;
    const headers = new Headers();
    for (const name of [
      "accept",
      "content-type",
      "cookie",
      "origin",
      "user-agent",
      "authorization",
      "x-csrf-token",
      "idempotency-key",
    ]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
      ...(!["GET", "HEAD"].includes(request.method)
        ? { body: await request.arrayBuffer() }
        : {}),
    });
    const outgoing = new Headers(response.headers);
    for (const name of [
      "content-encoding",
      "content-length",
      "transfer-encoding",
      "connection",
      "set-cookie",
    ])
      outgoing.delete(name);
    for (const cookie of response.headers.getSetCookie())
      outgoing.append("set-cookie", cookie);
    outgoing.set("Cache-Control", "private, no-store");
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      { message: "Máy chủ chưa sẵn sàng. Vui lòng thử lại." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
