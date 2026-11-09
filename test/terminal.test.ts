import { describe, expect, it } from "vitest";
import { isQuestion } from "@/components/desk/CommandBar";
import { activeKey } from "@/components/terminal/FKeys";
import { etClockText } from "@/components/terminal/Clock";
import { fetchedText } from "@/components/terminal/Panel";

describe("the terminal chrome", () => {
  it("the command line sends questions to Ask Insidir and everything else to search", () => {
    expect(isQuestion("Who's the best NFL wallet this month and what's he on today?")).toBe(true);
    expect(isQuestion("is anyone big against my Chargers bet")).toBe(true);
    expect(isQuestion("why did the Hegseth odds move")).toBe(true);
    expect(isQuestion("Chiefs")).toBe(false);
    expect(isQuestion("https://polymarket.com/event/x?y")).toBe(false);
    expect(isQuestion("0x7c3db723f1d4d8cb9c55009520")).toBe(false);
  });
  it("the active function key follows the page", () => {
    expect(activeKey("/board")).toBe("/board");
    expect(activeKey("/wallet/0xabc")).toBe("/wallets");
    expect(activeKey("/market/x-1")).toBe("/markets");
    expect(activeKey("/brief")).toBe("/brief");
    expect(activeKey("/briefing")).toBe("/briefing");
    expect(activeKey("/")).toBeNull();
  });
  it("the clock and fetched stamps are Eastern time", () => {
    expect(etClockText(Date.UTC(2026, 10, 9, 4, 52, 14))).toBe("SUN 08 NOV 2026 · 23:52:14 ET");
    expect(fetchedText(Date.UTC(2026, 10, 9, 3, 31))).toBe("updated 10:31 PM ET");
  });
});
