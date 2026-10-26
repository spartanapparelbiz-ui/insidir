/* Sign in with Whop: OAuth 2.1 + PKCE with OpenID Connect, run on the server (docs.whop.com/developer/guides/oauth).
 * Scopes: openid profile email, nothing more.
 *
 * No Whop token is kept. Access is checked with the account API key (users.checkAccess), so after the profile is
 * read the refresh token is revoked straight away and our own session cookie takes over. */
import { createHash, randomBytes } from "node:crypto";
import { appUrl, whopConfig } from "./config";

export const OAUTH_SCOPES = "openid profile email";
export const redirectUri = (): string => appUrl() + "/auth/callback";

const b64url = (b: Buffer): string => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export interface PkceStart { url: string; state: string; verifier: string; nonce: string }

export function startAuthorize(): PkceStart {
  const c = whopConfig();
  const verifier = b64url(randomBytes(32));
  const state = b64url(randomBytes(16));
  const nonce = b64url(randomBytes(16));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId,
    redirect_uri: redirectUri(),
    scope: OAUTH_SCOPES,
    state,
    nonce,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
  });
  return { url: `${c.oauthUrl}/authorize?${params}`, state, verifier, nonce };
}

export interface WhopProfile { whopUserId: string; username: string | null; email: string | null; name: string | null }

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
async function json(res: Response): Promise<Record<string, unknown>> {
  const body: unknown = await res.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

/** Code → tokens → userinfo, then revokes the refresh token. Throws on any failure. */
export async function finishAuthorize(code: string, verifier: string): Promise<WhopProfile> {
  const c = whopConfig();
  const res = await fetch(`${c.oauthUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: c.clientId, code_verifier: verifier,
      ...(c.clientSecret ? { client_secret: c.clientSecret } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const tokens = await json(res);
  const access = str(tokens.access_token);
  if (!res.ok || !access) throw new Error(`Whop sign-in failed (${res.status}): ${str(tokens.error_description) ?? str(tokens.error) ?? "no token"}`);
  const infoRes = await fetch(`${c.oauthUrl}/userinfo`, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(10_000) });
  const info = await json(infoRes);
  const id = str(info.sub);
  if (!infoRes.ok || !id) throw new Error(`Whop sign-in returned no user (${infoRes.status})`);
  const refresh = str(tokens.refresh_token);
  if (refresh) {
    void fetch(`${c.oauthUrl}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: refresh, client_id: c.clientId }), signal: AbortSignal.timeout(5_000) }).catch(() => undefined);
  }
  return { whopUserId: id, username: str(info.preferred_username), email: str(info.email), name: str(info.name) };
}
