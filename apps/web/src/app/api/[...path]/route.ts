import { proxyApi } from "../../../lib/api-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function forward(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyApi(request, (await params).path);
}
export {
  forward as GET,
  forward as POST,
  forward as PUT,
  forward as DELETE,
  forward as PATCH,
  forward as HEAD,
  forward as OPTIONS,
};
