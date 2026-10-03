// Only for the isolated Docker payment integration suite.
if (process.env.NODE_ENV !== "test" || !process.env.PAYOS_TEST_STATE)
  throw new Error("payOS fixture requires an explicit test environment");
const fs = require("node:fs");
const { createHmac } = require("node:crypto");
const originalFetch = global.fetch;
function sign(data) {
  const value = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k] == null ? "" : data[k]}`)
    .join("&");
  return createHmac("sha256", process.env.PAYOS_CHECKSUM_KEY)
    .update(value)
    .digest("hex");
}
global.fetch = async (url, init = {}) => {
  if (!String(url).startsWith("https://api-merchant.payos.vn/"))
    return originalFetch(url, init);
  const file = process.env.PAYOS_TEST_STATE;
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  const pathname = new URL(url).pathname;
  let data;
  if (pathname === "/v2/payment-requests" && init.method === "POST") {
    const body = JSON.parse(init.body);
    const code = String(body.orderCode);
    const id = `test-${code}`;
    state[code] ||= {
      id,
      orderCode: body.orderCode,
      amount: body.amount,
      amountPaid: 0,
      amountRemaining: body.amount,
      status: "PENDING",
    };
    fs.writeFileSync(file, JSON.stringify(state));
    data = {
      orderCode: body.orderCode,
      amount: body.amount,
      paymentLinkId: id,
      checkoutUrl: `https://pay.payos.vn/web/${id}`,
      qrCode: "test-qr",
    };
  } else {
    const code = pathname.split("/")[3];
    data = state[code];
    if (!data) return Response.json({ code: "NOT_FOUND" });
    if (pathname.endsWith("/cancel")) {
      data.status = data.amountPaid === data.amount ? "PAID" : "CANCELLED";
      fs.writeFileSync(file, JSON.stringify(state));
    }
  }
  return Response.json({
    code: "00",
    data,
    signature: state.badSignature ? "0".repeat(64) : sign(data),
  });
};
