/* Which ping setup a device gets (components/app/PingSetup.tsx): its OS, its browser, and whether it's an app's
 * built-in browser, where web push never works. */
import { describe, expect, it } from "vitest";
import { detectDevice } from "@/components/app/push";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 355.0.0.0 (iPhone15,2; iOS 18_1; en_US)",
  iphoneX: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.70",
  ipadDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36",
  androidTikTok: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 musical_ly_2023",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
};

describe("detectDevice", () => {
  it.each([
    ["iphoneSafari", { os: "ios", browser: "safari", inApp: null }],
    ["iphoneChrome", { os: "ios", browser: "chrome", inApp: null }],
    ["iphoneInstagram", { os: "ios", inApp: "Instagram" }],
    ["iphoneX", { os: "ios", inApp: "X" }],
    ["androidChrome", { os: "android", browser: "chrome", inApp: null }],
    ["androidWebView", { os: "android", inApp: "this app" }],
    ["androidTikTok", { os: "android", inApp: "TikTok" }],
    ["samsung", { os: "android", browser: "samsung", inApp: null }],
    ["macSafari", { os: "mac", browser: "safari", inApp: null }],
    ["macChrome", { os: "mac", browser: "chrome", inApp: null }],
    ["winEdge", { os: "windows", browser: "edge", inApp: null }],
    ["winFirefox", { os: "windows", browser: "firefox", inApp: null }],
  ] as const)("%s", (k, want) => {
    expect(detectDevice(UA[k])).toMatchObject(want);
  });

  it("an iPad that reports itself as a Mac is an iPhone-style device (touch screen)", () => {
    expect(detectDevice(UA.ipadDesktop, "MacIntel", 5).os).toBe("ios");
    expect(detectDevice(UA.ipadDesktop, "MacIntel", 0).os).toBe("mac");
  });
});
