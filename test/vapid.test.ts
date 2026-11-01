/* Web push keys: production sets INSIDIR_VAPID_PUBLIC_KEY and INSIDIR_VAPID_PRIVATE_KEY; the older names still work as
 * a fallback, and the public key reaches the browser from the server (GET /api/push/key), not from the build. */
import webpush from "web-push";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configurePush } from "@/lib/alerts/send";
import { vapidKeys, vapidPublicKey } from "@/lib/alerts/vapid";

const keys = webpush.generateVAPIDKeys();
const old = webpush.generateVAPIDKeys();

describe("web push keys", () => {
  afterEach(() => vi.restoreAllMocks());

  it("push is configured with the INSIDIR_ names", () => {
    const set = vi.spyOn(webpush, "setVapidDetails");
    const env = { INSIDIR_VAPID_PUBLIC_KEY: keys.publicKey, INSIDIR_VAPID_PRIVATE_KEY: keys.privateKey };
    expect(configurePush(env)).toBe(true);
    expect(set).toHaveBeenCalledWith("mailto:hello@aethric.llc", keys.publicKey, keys.privateKey);
  });

  it("the INSIDIR_ names win over the older ones, which still work alone; nothing set means no push", () => {
    expect(vapidKeys({ INSIDIR_VAPID_PUBLIC_KEY: keys.publicKey, INSIDIR_VAPID_PRIVATE_KEY: keys.privateKey, NEXT_PUBLIC_VAPID_PUBLIC_KEY: old.publicKey, VAPID_PRIVATE_KEY: old.privateKey }))
      .toEqual({ publicKey: keys.publicKey, privateKey: keys.privateKey, subject: "mailto:hello@aethric.llc" });
    expect(vapidKeys({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: old.publicKey, VAPID_PRIVATE_KEY: old.privateKey })).toMatchObject({ publicKey: old.publicKey, privateKey: old.privateKey });
    expect(vapidPublicKey({ VAPID_PUBLIC_KEY: old.publicKey })).toBe(old.publicKey);
    const set = vi.spyOn(webpush, "setVapidDetails");
    expect(configurePush({})).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it("the browser gets the public key from the server at run time", async () => {
    const prev = process.env.INSIDIR_VAPID_PUBLIC_KEY;
    process.env.INSIDIR_VAPID_PUBLIC_KEY = keys.publicKey;
    try {
      const { GET } = await import("@/app/api/push/key/route");
      expect(await GET().json()).toEqual({ publicKey: keys.publicKey });
    } finally { if (prev === undefined) delete process.env.INSIDIR_VAPID_PUBLIC_KEY; else process.env.INSIDIR_VAPID_PUBLIC_KEY = prev; }
  });
});
