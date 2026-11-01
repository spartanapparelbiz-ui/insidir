/** The Whop sign-in callbacks we serve (both run lib/auth/callback.ts). The first is preferred when both are registered
 *  on the Whop login app. No imports, so the deploy-time setup can use it. */
export const CALLBACK_PATHS = ["/login/callback", "/reset/callback"] as const;
