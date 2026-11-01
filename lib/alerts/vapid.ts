/* The web-push (VAPID) keys, read on the server at run time (never inlined at build): INSIDIR_VAPID_PUBLIC_KEY and
 * INSIDIR_VAPID_PRIVATE_KEY (production), else VAPID_PUBLIC_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.
 * The browser gets the public key from the server (the alerts page, GET /api/push/key), so a key set after the
 * build still works. Server only. */
export interface VapidKeys { publicKey: string; privateKey: string; subject: string }

/** Read by name at run time: Next.js inlines `process.env.NEXT_PUBLIC_…` at build, a computed name it can't. */
const read = (env: Record<string, string | undefined>, name: string): string => (env[name] ?? "").trim();
const OLD_PUBLIC = ["NEXT", "PUBLIC", "VAPID", "PUBLIC", "KEY"].join("_");

export function vapidKeys(env: Record<string, string | undefined> = process.env): VapidKeys {
  return {
    publicKey: read(env, "INSIDIR_VAPID_PUBLIC_KEY") || read(env, "VAPID_PUBLIC_KEY") || read(env, OLD_PUBLIC),
    privateKey: read(env, "INSIDIR_VAPID_PRIVATE_KEY") || read(env, "VAPID_PRIVATE_KEY"),
    subject: read(env, "VAPID_SUBJECT") || "mailto:hello@aethric.llc",
  };
}

/** The public key the browser subscribes with ("" when push isn't set up). */
export const vapidPublicKey = (env?: Record<string, string | undefined>): string => vapidKeys(env).publicKey;
