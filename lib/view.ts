/* Simple view or Pro view. Simple is always the default. A signed-in user's choice is saved with their settings
 * (so it follows them to any device); a visitor's lives in a cookie. Set by POST /api/view (the top bar's toggle);
 * read by getView (lib/auth/viewer.ts). Pure, so browser code can import the names. */
export type View = "simple" | "pro";
export const VIEW_COOKIE = "insidir_view";
/** Set once the Terminal has shown "How it works" (components/simple/FirstVisit). */
export const SEEN_COOKIE = "insidir_seen_how";

export const readView = (v: string | undefined | null): View => (v === "pro" ? "pro" : "simple");
