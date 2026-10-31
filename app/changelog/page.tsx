/* Changelog (/changelog): what shipped, newest first (lib/changelog.ts). */
import type { Metadata } from "next";
import { TrustPage } from "@/components/TrustPage";
import { CHANGELOG } from "@/lib/changelog";
import { Reveal } from "@/components/motion/Reveal";

export const metadata: Metadata = { title: "Changelog", description: "What's new on Insidir, newest first." };

const DAY = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function ChangelogPage() {
  return (
    <TrustPage path="/changelog" title="Changelog" lead="What's new on Insidir, newest first.">
      {CHANGELOG.map(d => (
        <Reveal as="section" key={d.date} data-testid="changelog-day">
          <h2><time dateTime={d.date}>{DAY.format(new Date(`${d.date}T12:00:00Z`))}</time></h2>
          <ul>{d.items.map(i => <li key={i}>{i}</li>)}</ul>
        </Reveal>
      ))}
    </TrustPage>
  );
}
