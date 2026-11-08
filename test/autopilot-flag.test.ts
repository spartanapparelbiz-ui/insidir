/* Autopilot is off until a lawyer has reviewed it (lib/features.ts): off by default and with any FEATURES_READY list
 * that doesn't name it, and every way in (the page, a ticket, the API, the nav link, the worker's matching and pushes,
 * the backtest claims on the landing, the funnel and /results) checks the switch. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isReady } from "@/lib/features";

const read = (f: string) => readFileSync(f, "utf8");

describe("Autopilot's switch", () => {
  it("is off by default and with a list that doesn't name it; on only when named", () => {
    expect(isReady("autopilot", {})).toBe(false);
    expect(isReady("autopilot", { FEATURES_READY: "feed,records,follows,stocks" })).toBe(false);
    expect(isReady("autopilot", { FEATURES_READY: "feed,autopilot" })).toBe(true);
  });
  it("every way in checks it", () => {
    expect(read("app/autopilot/page.tsx")).toMatch(/if \(!isReady\("autopilot"\)\) redirect\("\/"\)/);
    expect(read("app/t/[id]/page.tsx")).toMatch(/if \(!isReady\("autopilot"\)\) redirect\("\/"\)/);
    expect(read("app/api/autopilot/route.ts")).toMatch(/if \(!isReady\("autopilot"\)\) return NextResponse\.json\(.*status: 404/);
    expect(read("app/api/record/rules/route.ts")).toMatch(/if \(!isReady\("autopilot"\)\)/);
    expect(read("components/brand/app/Shell.tsx")).toContain('autopilot={isReady("autopilot")}');
    expect(read("components/brand/Nav.tsx")).toContain('autopilot || h !== "/autopilot"');
    expect(read("worker/index.ts")).toMatch(/isReady\("autopilot"\) \? \[every\("autopilot"/);
    for (const f of ["lib/brand/landing.ts", "lib/go/data.ts"]) expect(read(f), f).toMatch(/isReady\("autopilot"\) \? safe\(leadRule\(db\), null\)/);
    expect(read("app/results/page.tsx")).toMatch(/if \(isReady\("autopilot"\)\) rules = /);
  });
});
