/* Back from Whop's sign-in. /login/callback and /reset/callback are the same handler (lib/auth/callback.ts): Whop
 * redirects to whichever one is registered on our login app. */
import { handleLoginCallback } from "@/lib/auth/callback";

export const dynamic = "force-dynamic";
export const GET = handleLoginCallback;
