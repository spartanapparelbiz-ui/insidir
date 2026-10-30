/* Photos come from Unsplash's image CDN: one URL shape (crop around the focal point, sized there), a srcset from 96 to
 * 3840 wide at the box's ratio, every tracker on its own photo, and no drawn art left anywhere in the product. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Photo, photoSrcSet } from "@/components/Photo";
import { PHOTOS, PHOTOGRAPHERS, SLOT_PHOTO, trackerPhoto } from "@/lib/photos";
import { TRACKERS } from "@/lib/trackers";
import { url } from "@/lib/unsplash";

const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("photos from the CDN", () => {
  it("builds the Unsplash URL with the focal point and size", () => {
    expect(url("1546519638-68e109498ffc", { w: 768, h: 576, fx: 0.4, fy: 0.3 }))
      .toBe("https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&crop=focalpoint&fp-x=0.4&fp-y=0.3&w=768&h=576&q=80");
    expect(url("x", { w: 1920, q: 85 })).toBe("https://images.unsplash.com/photo-x?auto=format&fit=crop&crop=focalpoint&fp-x=0.5&fp-y=0.5&w=1920&q=85");
  });

  it("a photo is a real img: srcset 96–3840 at its ratio, width and height set, lazy, its colour behind it", () => {
    const set = photoSrcSet("nba", "1:1").split(", ");
    expect(set.map(s => s.split(" ")[1])).toEqual(["96w", "192w", "384w", "768w", "1280w", "1920w", "2560w", "3840w"]);
    expect(set[3]).toContain("w=768&h=768");
    const html = renderToStaticMarkup(createElement(Photo, { name: "nba", ratio: "21:9", sizes: "100vw" }));
    expect(html).toMatch(/<img [^>]*width="1280" height="549"/);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain(`background-color:${PHOTOS.nba.color}`);
    const hero = renderToStaticMarkup(createElement(Photo, { name: "nba", priority: true }));
    expect(hero).toContain('loading="eager"');
    expect(hero).toContain('fetchPriority="high"');
    expect(hero).toContain("q=85");
  });

  it("every tracker and every page slot has a photo, with a focal point and a colour", () => {
    for (const t of TRACKERS) expect(PHOTOS[trackerPhoto(t.slug)], t.slug).toBeTruthy();
    for (const n of Object.values(SLOT_PHOTO)) expect(PHOTOS[n]).toBeTruthy();
    for (const [k, p] of Object.entries(PHOTOS)) {
      expect(p.fx, k).toBeGreaterThanOrEqual(0); expect(p.fx, k).toBeLessThanOrEqual(1);
      expect(p.color, k).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(PHOTOGRAPHERS.length).toBeGreaterThan(30);
  });

  it("nothing in the product is drawn art", () => {
    const files = [...walk("app"), ...walk("components"), ...walk("lib")].filter(f => /\.(tsx?|css)$/.test(f));
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/SubjectArt|tcover__art|artpanel|tcover__curve/);
  });
});
