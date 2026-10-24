/* Insidir sends no email whatsoever. There is no email provider and no delivery worker: enqueueEmail() stores nothing
 * and transportFor() has no transport to give, whatever the environment says. The outbox table (email_outbox,
 * sql/014) stays only for the rows written before email was removed; sql/028 cancelled everything still waiting, and
 * the hourly maintenance erases addresses and bodies left in it, except billing notices kept as the record of what a
 * customer was told. */
import { emailSettings } from "./config.mjs";

export { emailSettings };

export async function enqueueEmail() {
  return { queued: false, disabled: true }; // no emailing whatsoever
}

export function transportFor() { return null; }

export async function purgeEmailBodies(query) {
  return (await query(`UPDATE email_outbox SET to_email=NULL,text_body=NULL,html_body=NULL
    WHERE status<>'sent' AND (text_body IS NOT NULL OR to_email IS NOT NULL) AND NOT retain_body`)).rowCount || 0;
}
