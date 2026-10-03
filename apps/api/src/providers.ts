import { createHmac, timingSafeEqual } from "crypto";
import { HttpException } from "@nestjs/common";
import { z } from "zod";
const configured = (...keys: string[]) => keys.every((k) => !!process.env[k]);
export const paymentProvider = () =>
  (process.env.DEMO_TOPUP_ENABLED === "true" ? "local" : process.env.PAYMENT_PROVIDER) ||
  (process.env.NODE_ENV === "production" ? "payos" : "local");
export function providerOptions() {
  return {
    google: configured("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    facebook: configured(
      "FACEBOOK_CLIENT_ID",
      "FACEBOOK_CLIENT_SECRET",
      "FACEBOOK_GRAPH_VERSION",
    ),
    phone: configured(
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_VERIFY_SERVICE_SID",
    ),
    payment: paymentProvider(),
    paymentReady:
      paymentProvider() === "payos" &&
      configured("PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY"),
    simulate:
      (process.env.DEMO_TOPUP_ENABLED === "true" ||
        (process.env.NODE_ENV !== "production" && process.env.DEV_TOPUP_ENABLED === "true")) &&
      paymentProvider() === "local",
  };
}
export function unavailable(message: string): never {
  throw new HttpException({ message }, 503);
}
export async function remoteJson(
  url: string,
  init: RequestInit = {},
  verificationCheck = false,
) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
    if (verificationCheck && [400, 404, 429].includes(r.status))
      throw new HttpException(
        {
          message:
            r.status === 429
              ? "Bạn đã thử quá nhiều lần. Vui lòng chờ rồi gửi mã mới."
              : "Mã không hợp lệ hoặc đã hết hạn. Hãy kiểm tra hoặc gửi mã mới.",
        },
        r.status === 429 ? 429 : 400,
      );
    if (!r.ok)
      unavailable("Dịch vụ kết nối chưa sẵn sàng. Vui lòng thử lại sau.");
    return (await r.json()) as any;
  } catch (e) {
    if (e instanceof HttpException) throw e;
    unavailable("Không kết nối được dịch vụ. Vui lòng thử lại sau.");
  }
}
export function normalizePhone(value: string) {
  let phone = value.replace(/[\s().-]/g, "");
  if (/^0[35789]\d{8}$/.test(phone)) phone = "+84" + phone.slice(1);
  if (!/^\+84[35789]\d{8}$/.test(phone))
    throw new HttpException(
      { message: "Nhập số di động Việt Nam hợp lệ (0… hoặc +84…)." },
      400,
    );
  return phone;
}
export async function smsVerification(
  fields: Record<string, string>,
  check = false,
) {
  if (!providerOptions().phone)
    unavailable("Đăng nhập SMS chưa được kích hoạt. Bạn có thể dùng email.");
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const basic = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  return remoteJson(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(sid)}/${check ? "VerificationCheck" : "Verifications"}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields),
    },
    check,
  );
}
export type OAuthProvider = "google" | "facebook";
const appOrigin = () => process.env.APP_ORIGIN || "http://localhost:3000";
export const callbackUrl = (provider: OAuthProvider) =>
  `${appOrigin()}/api/auth/oauth/${provider}/callback`;
export function oauthConfig(provider: OAuthProvider) {
  if (!providerOptions()[provider])
    unavailable(
      `Đăng nhập ${provider === "google" ? "Google" : "Facebook"} chưa được kích hoạt.`,
    );
  const prefix = provider === "google" ? "GOOGLE" : "FACEBOOK";
  const version = process.env.FACEBOOK_GRAPH_VERSION || "";
  if (provider === "facebook" && !/^v\d+\.\d+$/.test(version))
    unavailable("Cấu hình Facebook chưa hợp lệ.");
  return {
    id: process.env[`${prefix}_CLIENT_ID`]!,
    secret: process.env[`${prefix}_CLIENT_SECRET`]!,
    version,
  };
}
export function oauthUrl(
  provider: OAuthProvider,
  state: string,
  challenge: string,
) {
  const c = oauthConfig(provider);
  const url = new URL(
    provider === "google"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : `https://www.facebook.com/${c.version}/dialog/oauth`,
  );
  const params: Record<string, string> = {
    client_id: c.id,
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    scope: provider === "google" ? "openid email profile" : "public_profile",
    state,
  };
  if (provider === "google")
    Object.assign(params, {
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}
export async function oauthIdentity(
  provider: OAuthProvider,
  code: string,
  verifier: string,
) {
  const c = oauthConfig(provider);
  const params: Record<string, string> = {
    client_id: c.id,
    client_secret: c.secret,
    redirect_uri: callbackUrl(provider),
    code,
    grant_type: "authorization_code",
  };
  if (provider === "google") params.code_verifier = verifier;
  const token = await remoteJson(
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : `https://graph.facebook.com/${c.version}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    },
  );
  const access = z.string().min(1).parse(token.access_token);
  if (provider === "google") {
    const profile = await remoteJson(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: `Bearer ${access}` } },
    );
    const p = z
      .object({
        sub: z.string().min(1),
        email: z.email(),
        email_verified: z.literal(true),
        name: z.string().optional(),
      })
      .parse(profile);
    return {
      subject: p.sub,
      email: p.email.toLowerCase(),
      name: p.name || "Bạn đọc mới",
      verified: true,
    };
  }
  const debug = new URL(`https://graph.facebook.com/${c.version}/debug_token`);
  debug.searchParams.set("input_token", access);
  const result = await remoteJson(debug.toString(), {
    headers: { Authorization: `Bearer ${c.id}|${c.secret}` },
  });
  const info = result.data;
  if (
    !info?.is_valid ||
    info.app_id !== c.id ||
    typeof info.user_id !== "string" ||
    (info.expires_at && info.expires_at < Date.now() / 1000)
  )
    throw new HttpException({ message: "Phiên Facebook không hợp lệ." }, 401);
  const proof = createHmac("sha256", c.secret).update(access).digest("hex");
  const profile = await remoteJson(
    `https://graph.facebook.com/${c.version}/me?fields=id,name&appsecret_proof=${proof}`,
    { headers: { Authorization: `Bearer ${access}` } },
  );
  if (profile.id !== info.user_id)
    throw new HttpException({ message: "Không xác minh được Facebook." }, 401);
  return {
    subject: info.user_id,
    email: undefined,
    name: typeof profile.name === "string" ? profile.name : "Bạn đọc mới",
    verified: false,
  };
}
export function payosSignature(data: Record<string, unknown>, key: string) {
  const input = Object.keys(data)
    .sort()
    .filter((k) => data[k] !== undefined)
    .map((k) => {
      let v = data[k];
      if (Array.isArray(v))
        v = JSON.stringify(
          v.map((item) =>
            Object.fromEntries(
              Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
            ),
          ),
        );
      if (v == null || v === "null" || v === "undefined") v = "";
      return `${k}=${v}`;
    })
    .join("&");
  return createHmac("sha256", key).update(input).digest("hex");
}
export function verifyPayos(data: Record<string, unknown>, signature: string) {
  const key = process.env.PAYOS_CHECKSUM_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(payosSignature(data, key), "hex"),
  );
}
export async function payos(path: string, body?: Record<string, unknown>) {
  if (!providerOptions().paymentReady)
    unavailable("Thanh toán payOS chưa được kích hoạt.");
  const r = await remoteJson(`https://api-merchant.payos.vn${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "x-client-id": process.env.PAYOS_CLIENT_ID!,
      "x-api-key": process.env.PAYOS_API_KEY!,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.code !== "00" || !r.data)
    unavailable(
      "Chưa xử lý được thanh toán. Vui lòng kiểm tra lại trạng thái đơn trước khi thử lại.",
    );
  if (typeof r.signature !== "string" || !verifyPayos(r.data, r.signature))
    unavailable(
      "Không xác minh được phản hồi payOS. Vui lòng kiểm tra lại thanh toán.",
    );
  return r.data;
}
