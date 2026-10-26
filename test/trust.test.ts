/* Every trust claim on the site has to stay literally true. These check the code behind them. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scaleFrom, scaleText } from "@/lib/scale";
import { MONEY_LINE, TRUST } from "@/components/landing/Trust";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("trust claims", () => {
  it("'the apps don't pay us': no referral or affiliate tags on any venue link", () => {
    expect(MONEY_LINE).toContain("the apps don't pay us");
    // If this fails, an affiliate or referral link was added: change "How Insidir makes money" and disclose it.
    for (const f of [...files("lib"), ...files("components"), ...files("app")]) {
      const src = readFileSync(f, "utf8");
      for (const url of src.match(/(kalshi\.com|polymarket\.(com|us))[^"'`\s]*/g) ?? []) {
        expect(url, f).not.toMatch(/[?&](ref|referral|aff|affiliate|via|utm_[a-z]+|r)=/i);
      }
      expect(src, f).not.toMatch(/affiliate_?(id|code|link)|referral_?(code|link)/i);
    }
  });

  it("'Cancel in one click': the Cancel button cancels on its own, with no confirm step", () => {
    const form = read("components/account/AccountForms.tsx");
    const cancel = form.slice(form.indexOf("export function CancelButton"));
    expect(cancel).toContain('fetch("/api/account/cancel"');
    expect(cancel.slice(0, cancel.indexOf("Cancel subscription"))).not.toMatch(/confirm\(/);
  });

  it("'Every deal we flag goes in Receipts': each new deal gets a receipt row when it is stored", () => {
    expect(read("lib/worker/store.ts")).toMatch(/insert\(receipts\)/);
  });

  it("'Payments by Whop' and 'We never touch your money': checkout goes to Whop, and there's no deposit or order code", () => {
    expect(read("lib/auth/whop.ts")).toMatch(/whop\.com/);
    for (const f of [...files("lib"), ...files("app")]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\b(createOrder|placeOrder|submitOrder|withdraw|deposit)\s*\(/);
    }
  });

  it("lists the four trust items", () => {
    expect(TRUST).toHaveLength(4);
  });
});

describe("the scale line", () => {
  const live = { live: true, paused: [], lastScanAt: 1 } as const;
  it("counts only the viewer's venues with healthy scans", () => {
    const counts = [{ venue: "kalshi" as const, n: 3000 }, { venue: "polymarket" as const, n: 9000 }, { venue: "polymarket_us" as const, n: 400 }];
    expect(scaleFrom(counts, "us", { ...live, paused: [] })).toEqual({ markets: 3400, apps: 2 });
    expect(scaleFrom(counts, "non_us", { ...live, paused: [] })).toEqual({ markets: 12000, apps: 2 });
    expect(scaleFrom(counts, "us", { ...live, paused: ["polymarket_us"] })).toEqual({ markets: 3000, apps: 1 });
  });
  it("is hidden while the scanner is paused or nothing was seen", () => {
    expect(scaleFrom([{ venue: "kalshi", n: 10 }], "us", { live: false, paused: [], lastScanAt: null })).toBeNull();
    expect(scaleFrom([], "us", { ...live, paused: [] })).toBeNull();
  });
  it("reads plainly", () => {
    expect(scaleText({ markets: 41203, apps: 2 })).toBe("Scanning 41,203 markets across 2 apps right now");
    expect(scaleText({ markets: 1, apps: 1 })).toBe("Scanning 1 market on 1 app right now");
  });
});
