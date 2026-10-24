
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./types";

const keySets = new Map<
  string,
  ReturnType<typeof createRemoteJWKSet>
>();

export async function verifyUser(
  request: Request,
  env: Env
): Promise<string | null> {
  const token = request.headers.get(
    "Cf-Access-Jwt-Assertion"
  );

  if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) {
    return null;
  }

  try {
    const issuer = env.TEAM_DOMAIN.replace(/\/+$/, "");

    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) {
      return null;
    }

    let keys = keySets.get(issuer);

    if (!keys) {
      keys = createRemoteJWKSet(
        new URL(`${issuer}/cdn-cgi/access/certs`)
      );
      keySets.set(issuer, keys);
    }

    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: env.POLICY_AUD,
      algorithms: ["RS256"]
    });

    return typeof payload.sub === "string" && payload.sub
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}
