/* Where a sign-in may land, and what counts as an email address. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const validEmail = (e: string): boolean => e.length <= 254 && EMAIL.test(e);

/** Same-site paths only. */
export const safeNext = (next: string | null | undefined, fallback = "/"): string =>
  next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
