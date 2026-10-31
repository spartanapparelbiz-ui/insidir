/* Structured data for search engines (schema.org JSON-LD): the publisher (Organization, on every page), each
 * entity page's Dataset (what it is, who publishes it, when it was last updated, where the data comes from) and its
 * BreadcrumbList. Real values only. */
import { appUrl } from "@/lib/app-url";
import { COMPANY } from "@/lib/copy";

const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json(data) }} />;
}

export function organizationLd() {
  const base = appUrl();
  return { "@context": "https://schema.org", "@type": "Organization", name: "Insidir", legalName: COMPANY.name, url: base, logo: `${base}/icons/icon-512.png`, email: COMPANY.email,
    address: { "@type": "PostalAddress", addressLocality: "Pompano Beach", addressRegion: "FL", addressCountry: "US" } };
}

/** Home › … › this page. `trail` is [name, path] from the top, ending with this page. */
export function breadcrumbLd(trail: Array<[string, string]>) {
  const base = appUrl();
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [["Insidir", "/"] as [string, string], ...trail].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${base}${path}` })) };
}

export function datasetLd(o: { name: string; description: string; path: string; updated?: Date | number | null; sources: string[]; keywords?: string[] }) {
  const base = appUrl();
  return { "@context": "https://schema.org", "@type": "Dataset", name: o.name, description: o.description, url: `${base}${o.path}`, isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "Insidir", url: base }, publisher: { "@type": "Organization", name: "Insidir", url: base },
    ...(o.updated ? { dateModified: new Date(o.updated).toISOString() } : {}), isBasedOn: o.sources, ...(o.keywords?.length ? { keywords: o.keywords } : {}),
    license: `${base}/terms` };
}

/** Breadcrumbs and a Dataset for one entity page. */
export function EntityLd(o: { trail: Array<[string, string]>; name: string; description: string; path: string; updated?: Date | number | null; sources: string[]; keywords?: string[] }) {
  return <><JsonLd data={breadcrumbLd(o.trail)} /><JsonLd data={datasetLd(o)} /></>;
}
