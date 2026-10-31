/* SEO titles (lib/seo/titles.ts) and the sitemap XML (lib/seo/sitemaps.ts). */
import { describe, expect, it } from "vitest";
import { companyTitle, insiderTitle, roleShort, trackerTitle, traderTitle } from "@/lib/seo/titles";
import { indexXml, urlsetXml } from "@/lib/seo/sitemaps";

describe("titles", () => {
  it("a company with its latest insider buy", () => {
    expect(companyTitle("Accenture", "ACN", { owner: "Julie Sweet", role: "Chair & CEO", value: 3_000_000, filedAt: "2026-10-28T20:00:00Z" }).title).toBe("Accenture (ACN) insider buying: CEO Julie Sweet bought $3M on Oct 28, 2026");
    expect(companyTitle("Acme", "ACME", null).title).toBe("Acme (ACME) insider trading: every Form 4 buy and sale");
  });
  it("roles read short", () => expect(["The CEO", "Director", "10% Owner", "EVP, Chief Financial Officer", "President"].map(roleShort)).toEqual(["CEO", "Director", "10% owner", "CFO", "President"]));
  it("an insider, a tracker, a trader", () => {
    expect(insiderTitle("Julie Sweet", "Accenture", "ACN", "Chair & CEO", { owner: "Julie Sweet", role: "CEO", value: 3e6, filedAt: "2026-10-28T20:00:00Z" }).title).toBe("Julie Sweet (CEO, Accenture) insider trades: bought $3M of ACN on Oct 28, 2026");
    expect(trackerTitle("Tennis", "Every large tennis position.", { won: 40, lost: 23, net: 820, staked: 6300 }, 30).title).toBe("Tennis: followable ROI +13.0% on 63 settled");
    expect(trackerTitle("Golf", "x", { won: 2, lost: 1, net: 1, staked: 300 }, 30).title).toBe("Golf: live tracker of large positions");
    expect(traderTitle("googleplay", { resolved: 63, won: 41, lost: 22 }, 20).title).toBe("googleplay: verified record 41–22 on Polymarket");
  });
});

describe("sitemaps", () => {
  it("an index of every type and escaped URL sets", () => {
    const x = indexXml(Date.UTC(2026, 9, 31, 3, 40));
    expect(x.match(/<sitemap>/g)).toHaveLength(7);
    expect(x).toContain("<lastmod>2026-10-31T03:00:00.000Z</lastmod>");
    expect(urlsetXml([{ loc: "https://insidir.com/market/a&b", changefreq: "hourly", priority: 0.5 }])).toContain("<loc>https://insidir.com/market/a&amp;b</loc><changefreq>hourly</changefreq><priority>0.5</priority>");
  });
});
