/* Whop sends sign-ins back to whichever callback is registered on our login app (production: /login/callback). Both
 * addresses run the same handler, and the deploy-time setup fails the deploy when neither is registered. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleLoginCallback } from "@/lib/auth/callback";
import { CALLBACK_PATHS } from "@/lib/auth/callback-paths";
import * as login from "@/app/login/callback/route";
import * as reset from "@/app/reset/callback/route";

describe("sign-in callbacks", () => {
  it("/login/callback and /reset/callback are the same handler, /login/callback preferred", () => {
    expect(login.GET).toBe(handleLoginCallback);
    expect(reset.GET).toBe(handleLoginCallback);
    expect(login.dynamic).toBe("force-dynamic");
    expect(CALLBACK_PATHS).toEqual(["/login/callback", "/reset/callback"]);
  });
  it("the deploy step fails when neither callback is registered", () => {
    const src = readFileSync("scripts/whop-setup.ts", "utf8");
    expect(src).toMatch(/r\.app === "missing redirect"[\s\S]*process\.exitCode = 1/);
  });
});
