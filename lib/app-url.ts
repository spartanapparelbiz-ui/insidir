/** The site's own address (https://insidir.com in production), for absolute links in emails, redirects and pushes. */
export const appUrl = (): string => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
